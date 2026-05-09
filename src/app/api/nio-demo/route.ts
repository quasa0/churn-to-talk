import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FALLBACK_CONTEXT =
  "fastclip.it converts long-form videos and podcasts into short-form clips. Users upload or import media, generate AI clips, edit hooks/captions/aspect ratios, preview, export, and download clips.";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    rawActivity?: string;
    userName?: string;
  };
  const rawActivity = String(body.rawActivity ?? "").trim();
  const userName = String(body.userName ?? "This user").trim() || "This user";

  if (!rawActivity) {
    return NextResponse.json({ error: "Missing rawActivity" }, { status: 400 });
  }

  const requestFingerprint =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const prompt = buildNioPrompt(rawActivity, requestFingerprint);
  const niaResponse = await fetchNioContext(prompt);
  const injectedByNio = extractNioContext(niaResponse.raw);
  const unsupportedNiaClaims = findUnsupportedNiaClaims(rawActivity, injectedByNio);
  const niaContextForOpenAi = sanitizeNiaContextForOpenAi(injectedByNio, unsupportedNiaClaims);
  const openAiPrompt = buildOpenAiPrompt({
    userName,
    rawActivity,
    injectedByNio: niaContextForOpenAi,
    unsupportedNiaClaims
  });
  const openAiOutput = await fetchOpenAiTakeaway(openAiPrompt);

  return NextResponse.json(
    {
      originalAnalytics: {
        rawActivity,
      },
      sentToNia: {
        prompt
      },
      injectedByNio,
      niaEvidence: {
        retrievalLogId: niaResponse.retrievalLogId,
        cache: niaResponse.cache,
        sources: niaResponse.sources,
        unsupportedClaims: unsupportedNiaClaims
      },
      openAiStep: {
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        prompt: openAiPrompt,
        output: openAiOutput
      },
      generatedAt: new Date().toISOString()
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0"
      }
    }
  );
}

async function fetchNioContext(prompt: string): Promise<{
  raw: string;
  retrievalLogId?: string;
  cache?: { cached?: boolean; type?: string; similarity?: number };
  sources: NiaSource[];
}> {
  const apiKey = process.env.NIA_API_KEY;
  if (!apiKey) return { raw: FALLBACK_CONTEXT, sources: [] };

  const repository = process.env.NIA_REPOSITORY || "quasa0/fastclip.it-copy";
  const localFolder = process.env.NIA_LOCAL_FOLDER || process.env.NIA_LOCAL_FOLDER_ID;
  const sources: Record<string, unknown> = {};
  if (repository) sources.repositories = [{ repository }];
  if (localFolder) sources.local_folders = [localFolder];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch("https://apigcp.trynia.ai/v2/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        mode: "query",
        messages: [{ role: "user", content: prompt }],
        search_mode: "unified",
        include_sources: true,
        fast_mode: false,
        ...sources
      }),
      cache: "no-store",
      signal: controller.signal
    });

    const text = await response.text();
    if (!response.ok || !text.trim()) return { raw: FALLBACK_CONTEXT, sources: [] };
    return normalizeNiaResponse(text);
  } catch {
    return { raw: FALLBACK_CONTEXT, sources: [] };
  } finally {
    clearTimeout(timeout);
  }
}

type NiaSource = {
  path?: string;
  sourceType?: string;
  score?: number;
  excerpt: string;
  summary?: string;
  chunkId?: string;
};

function normalizeNiaResponse(text: string) {
  try {
    const parsed = JSON.parse(text) as {
      retrieval_log_id?: string;
      _cached?: boolean;
      _cache_type?: string;
      _cache_similarity?: number;
      sources?: {
        content?: string;
        metadata?: {
          id?: string;
          file_path?: string;
          file_name?: string;
          source_type?: string;
          score?: number;
          summary?: string;
        };
      }[];
    };

    return {
      raw: text,
      retrievalLogId: parsed.retrieval_log_id,
      cache: {
        cached: parsed._cached,
        type: parsed._cache_type,
        similarity: parsed._cache_similarity
      },
      sources: (parsed.sources ?? []).slice(0, 5).map((source) => ({
        path: source.metadata?.file_path ?? source.metadata?.file_name,
        sourceType: source.metadata?.source_type,
        score: source.metadata?.score,
        excerpt: String(source.content ?? "").slice(0, 700),
        summary: source.metadata?.summary,
        chunkId: source.metadata?.id
      }))
    };
  } catch {
    return { raw: text, sources: [] };
  }
}

function buildNioPrompt(rawActivity: string, requestFingerprint: string) {
  return [
    "Use fastclip.it indexed product/codebase context to interpret this churn activity.",
    `Request fingerprint: ${requestFingerprint}`,
    "",
    "Strict rules:",
    "- Do not invent user events, timestamps, days, pricing views, billing views, page visits, exports, or returns that are not explicitly present in the raw activity.",
    "- If a timestamp or event is missing, say it is missing instead of filling it in.",
    "- Separate what the raw activity proves from what fastclip.it context suggests.",
    "- Return product-specific context: relevant workflow, likely feature touched, and what the founder should understand.",
    "",
    "Raw activity:",
    rawActivity
  ].join("\n");
}

function findUnsupportedNiaClaims(rawActivity: string, injectedByNio: string) {
  const raw = rawActivity.toLowerCase();
  const nio = injectedByNio.toLowerCase();
  const checks = [
    { claim: "pricing page", rawTokens: ["view_pricing", "pricing"] },
    { claim: "billing view", rawTokens: ["billing", "open_billing", "view_billing"] },
    { claim: "export failure", rawTokens: ["export_failed", "export fail"] },
    { claim: "successful export/download", rawTokens: ["export_success", "download", "downloaded"] },
    { claim: "connected account/channel", rawTokens: ["connect", "connected", "channel"] },
    { claim: "day 14 return", rawTokens: ["t-14", "day 14", "return t-14"] },
  ];

  return checks
    .filter(({ claim, rawTokens }) => {
      const nioMentions = claim === "day 14 return"
        ? /\bday\s*14\b/.test(nio)
        : nio.includes(claim);
      const rawSupports = rawTokens.some((token) => raw.includes(token));
      return nioMentions && !rawSupports;
    })
    .map(({ claim }) => claim);
}

function sanitizeNiaContextForOpenAi(injectedByNio: string, unsupportedClaims: string[]) {
  if (!unsupportedClaims.length) return injectedByNio;

  const blockedTerms = new Set<string>();
  for (const claim of unsupportedClaims) {
    if (claim === "pricing page") {
      ["pricing", "price", "$29", "pro", "paid tier", "free tier", "billing", "upgrade", "payment"].forEach((term) =>
        blockedTerms.add(term)
      );
    }
    if (claim === "day 14 return") {
      ["day 14", "14:", "viewed pricing"].forEach((term) => blockedTerms.add(term));
    }
    blockedTerms.add(claim);
  }

  return injectedByNio
    .split(/\n{2,}/)
    .filter((block) => {
      const lower = block.toLowerCase();
      return !Array.from(blockedTerms).some((term) => lower.includes(term));
    })
    .join("\n\n")
    .trim();
}

function extractNioContext(context: string) {
  return (unwrapNiaContent(context).trim() || FALLBACK_CONTEXT).slice(0, 8000);
}

function unwrapNiaContent(value: unknown): string {
  if (typeof value !== "string") {
    if (value && typeof value === "object" && "content" in value) {
      return unwrapNiaContent((value as { content?: unknown }).content);
    }
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && "content" in parsed) {
      return unwrapNiaContent((parsed as { content?: unknown }).content);
    }
  } catch {
    // Plain markdown/text is expected too.
  }

  return trimmed;
}

function buildOpenAiPrompt({
  userName,
  rawActivity,
  injectedByNio,
  unsupportedNiaClaims,
}: {
  userName: string;
  rawActivity: string;
  injectedByNio: string;
  unsupportedNiaClaims: string[];
}) {
  return [
    "You are helping a founder understand a churned fastclip.it user.",
    "Use ONLY the original analytics and the Nia-injected product context below.",
    "Important: Nia may return useful product context plus speculative user-action wording. Treat the ORIGINAL ANALYTICS as the only source of truth for what this user actually did.",
    unsupportedNiaClaims.length
      ? `Ignore these unsupported Nia user-action claims because they are not in the original analytics: ${unsupportedNiaClaims.join(", ")}.`
      : "No unsupported Nia user-action claims were detected by the guardrail.",
    "Write a concise founder-facing interpretation in 2 bullets:",
    "- what happened",
    "- what to ask the user",
    "",
    `User: ${userName}`,
    "",
    "ORIGINAL ANALYTICS:",
    rawActivity,
    "",
    "NIA-INJECTED FASTCLIP CONTEXT:",
    injectedByNio.slice(0, 2200)
  ].join("\n");
}

async function fetchOpenAiTakeaway(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallbackOpenAiOutput(prompt);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.9,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      }),
      cache: "no-store",
      signal: controller.signal
    });
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() || fallbackOpenAiOutput(prompt);
  } catch {
    return fallbackOpenAiOutput(prompt);
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackOpenAiOutput(prompt: string) {
  const raw = prompt.match(/ORIGINAL ANALYTICS:\n([\s\S]*?)\n\nNIA-INJECTED/)?.[1]?.trim() || "";
  const context = prompt.match(/NIA-INJECTED FASTCLIP CONTEXT:\n([\s\S]*)/)?.[1]?.trim() || FALLBACK_CONTEXT;
  return [
    `- what happened: the original analytics show ${extractSignals(raw)}. Nia added product context around ${summarizeContext(context)}.`,
    "- what to ask the user: ask which exact step blocked them before export, instead of sending a generic check-in."
  ].join("\n");
}

function extractSignals(rawActivity: string) {
  return rawActivity
    .replace(/[{}[\]"]/g, " ")
    .replace(/\\u2022/g, " -> ")
    .replace(/\s+/g, " ")
    .slice(0, 220)
    .trim();
}

function summarizeContext(context: string) {
  const compact = context
    .replace(/[{}[\]"]/g, " ")
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const interesting =
    compact.match(/(upload|import|clips?|captions?|export|download|editor|transcript|aspect ratio|pricing|workflow)[^.]{20,180}/i)?.[0] ??
    compact.slice(0, 180);
  return interesting || FALLBACK_CONTEXT;
}
