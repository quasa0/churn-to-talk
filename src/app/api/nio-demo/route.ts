import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ANGLES = [
  "export friction",
  "activation blocker",
  "editor confusion",
  "caption workflow hesitation",
  "pricing or limit concern",
  "upload/import reliability",
  "creator outcome uncertainty",
  "return-session intent"
];

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

  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)];
  const context = await fetchNioContext(rawActivity, angle);
  const story = buildStory({ userName, rawActivity, context, angle });

  return NextResponse.json(
    {
      angle,
      story,
      contextPreview: context.slice(0, 700),
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

async function fetchNioContext(rawActivity: string, angle: string) {
  const apiKey = process.env.NIA_API_KEY;
  if (!apiKey) return FALLBACK_CONTEXT;

  const repository = process.env.NIA_REPOSITORY || "quasa0/fastclip.it-copy";
  const localFolder = process.env.NIA_LOCAL_FOLDER || process.env.NIA_LOCAL_FOLDER_ID;
  const sources: Record<string, unknown> = {};
  if (repository) sources.repositories = [{ repository }];
  if (localFolder) sources.local_folders = [localFolder];

  const prompt = [
    "Use fastclip.it product/codebase context to interpret this churn activity.",
    `Angle to emphasize: ${angle}.`,
    `Raw activity: ${rawActivity}`,
    "Return product-specific context: relevant workflow, likely feature touched, and what the founder should understand."
  ].join("\n");

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
    if (!response.ok || !text.trim()) return FALLBACK_CONTEXT;
    return text.slice(0, 5000);
  } catch {
    return FALLBACK_CONTEXT;
  } finally {
    clearTimeout(timeout);
  }
}

function buildStory({
  userName,
  rawActivity,
  context,
  angle
}: {
  userName: string;
  rawActivity: string;
  context: string;
  angle: string;
}) {
  const signals = extractSignals(rawActivity);
  const contextHint = summarizeContext(context);
  const variants = [
    `${userName} looks like a ${angle} case. Nio connected the raw action trail (${signals}) with fastclip.it context: ${contextHint}. The practical read is that they had enough intent to reach the clip workflow, but the next obvious step did not feel safe enough to finish.`,
    `Nio reframed this as ${angle}: ${signals}. Based on fastclip.it context, ${contextHint}. I would treat this as a warm recovery moment, not a cold churned lead.`,
    `${userName}'s trail points to ${angle}. The activity says ${signals}; the Nio context says ${contextHint}. That means the recovery note should ask about the exact step they stalled on instead of sending a generic check-in.`,
    `Converted with Nio: ${signals}. The matching product context is ${contextHint}. Story: ${userName} probably understood the promise of fastclip.it, reached the creation path, then lost confidence before the value moment.`,
    `Nio's read changed this into a founder-facing story: ${userName} did not just disappear, they hit ${angle}. The raw trail is ${signals}, and fastclip.it context adds that ${contextHint}.`
  ];
  return variants[Math.floor(Math.random() * variants.length)];
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
