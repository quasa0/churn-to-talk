"use client";

import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";

type Props = {
  rawActivity: string;
  userName: string;
};

type NioResult = {
  originalAnalytics?: {
    rawActivity?: string;
  };
  sentToNia?: {
    prompt: string;
  };
  injectedByNio?: string;
  niaEvidence?: {
    retrievalLogId?: string;
    cache?: { cached?: boolean; type?: string; similarity?: number };
    unsupportedClaims?: string[];
    sources?: {
      path?: string;
      sourceType?: string;
      score?: number;
      excerpt: string;
      summary?: string;
      chunkId?: string;
    }[];
  };
  openAiStep?: {
    model: string;
    prompt: string;
    output: string;
  };
  error?: string;
};

export function NioDemo({ rawActivity, userName }: Props) {
  const [result, setResult] = useState<NioResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function convert() {
    setBusy(true);
    try {
      const response = await fetch("/api/nio-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawActivity, userName })
      });
      const payload = (await response.json()) as {
        originalAnalytics?: NioResult["originalAnalytics"];
        sentToNia?: NioResult["sentToNia"];
        injectedByNio?: string;
        niaEvidence?: NioResult["niaEvidence"];
        openAiStep?: NioResult["openAiStep"];
        error?: string;
      };
      setResult(payload);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-line bg-white">
      <div className="border-b border-line px-6 py-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
          Nio demonstration
        </div>
        <p className="mt-1 max-w-2xl text-[13px] leading-[1.6] text-mute">
          Shows provenance: original analytics, Nia&apos;s injected fastclip.it context, and the OpenAI interpretation written from both.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-4 p-6">
        <div className="col-span-12 lg:col-span-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            1 original analytics
          </div>
          <div className="mt-2 min-h-[260px] max-h-[420px] overflow-auto rounded-md border border-line bg-paper p-4">
            <SourceBadge tone="raw">we already had this</SourceBadge>
            <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[1.7] text-ink">
              {result?.originalAnalytics?.rawActivity || rawActivity || "-"}
            </pre>
          </div>
        </div>

        <div className="col-span-12 flex items-center justify-center lg:col-span-1">
          <button
            onClick={convert}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-[13px] font-medium text-paper transition-colors hover:bg-black disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            Convert
          </button>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <div className="flex items-center justify-between gap-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              2 Nia injected
            </div>
          </div>
          <div className="mt-2 min-h-[260px] rounded-md border border-moss/20 bg-mossSoft/70 p-4">
            {result ? (
              result.error ? (
                <div className="text-[13px] text-amber">{result.error}</div>
              ) : (
                <>
                  <SourceBadge tone="nia">added by Nia from indexed fastclip.it context</SourceBadge>
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 font-mono text-[9.5px] text-moss">
                    <span className="rounded bg-white/70 px-1.5 py-0.5">
                      sources {result.niaEvidence?.sources?.length ?? 0}
                    </span>
                    {result.niaEvidence?.retrievalLogId ? (
                      <span className="rounded bg-white/70 px-1.5 py-0.5">
                        retrieval {shortId(result.niaEvidence.retrievalLogId)}
                      </span>
                    ) : null}
                    {result.niaEvidence?.cache?.cached !== undefined ? (
                      <span className="rounded bg-white/70 px-1.5 py-0.5">
                        cache {String(result.niaEvidence.cache.cached)}
                      </span>
                    ) : null}
                    {result.niaEvidence?.unsupportedClaims?.length ? (
                      <span className="rounded bg-amberSoft px-1.5 py-0.5 text-amber">
                        guardrail ignored {result.niaEvidence.unsupportedClaims.length}
                      </span>
                    ) : null}
                  </div>
                  {result.niaEvidence?.unsupportedClaims?.length ? (
                    <div className="mb-3 rounded border border-amber/25 bg-white/70 p-2 text-[11.5px] leading-[1.55] text-amber">
                      Nia returned user-action wording not present in the original analytics, so OpenAI was told to ignore:
                      {" "}
                      <span className="font-mono">
                        {result.niaEvidence.unsupportedClaims.join(", ")}
                      </span>
                    </div>
                  ) : null}
                  <MarkdownLike body={result.injectedByNio || "No Nia context returned."} />
                  {result.niaEvidence?.sources?.length ? (
                    <details className="mt-3 rounded border border-moss/20 bg-white/60 px-3 py-2" open>
                      <summary className="cursor-pointer font-mono text-[9.5px] uppercase tracking-[0.14em] text-moss">
                        exact source chunks Nia returned
                      </summary>
                      <div className="mt-2 grid gap-2">
                        {result.niaEvidence.sources.map((source, index) => (
                          <div key={`${source.chunkId ?? source.path}-${index}`} className="rounded border border-line bg-white p-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-mono text-[10px] text-ink">
                                {source.path ?? "unknown source"}
                              </span>
                              <span className="font-mono text-[9px] text-mute">
                                {source.sourceType ?? "source"}
                                {typeof source.score === "number" ? ` · score ${source.score.toFixed(3)}` : ""}
                              </span>
                            </div>
                            <pre className="mt-1 max-h-[110px] overflow-auto whitespace-pre-wrap break-words font-mono text-[10.5px] leading-[1.55] text-mute">
                              {source.excerpt}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  {result.sentToNia?.prompt ? (
                    <details className="mt-3 rounded border border-moss/20 bg-white/60 px-3 py-2">
                      <summary className="cursor-pointer font-mono text-[9.5px] uppercase tracking-[0.14em] text-moss">
                        exact Nia request
                      </summary>
                      <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[10.5px] leading-[1.6] text-mute">
                        {result.sentToNia.prompt}
                      </pre>
                    </details>
                  ) : null}
                </>
              )
            ) : (
              <span className="text-mute">
                Empty until conversion. This is where Nia&apos;s retrieved context appears.
              </span>
            )}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <div className="flex items-center justify-between gap-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              3 OpenAI wrote
            </div>
            {result?.openAiStep?.model ? (
              <span className="rounded bg-amberSoft px-1.5 py-0.5 font-mono text-[9.5px] text-amber">
                {result.openAiStep.model}
              </span>
            ) : null}
          </div>
          <div className="mt-2 min-h-[260px] rounded-md border border-amber/20 bg-amberSoft/70 p-4">
            {result?.openAiStep ? (
              <>
                <SourceBadge tone="openai">written from original analytics + Nia context</SourceBadge>
                <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.7] text-ink">
                  {result.openAiStep.output}
                </pre>
                <details className="mt-3 rounded border border-amber/20 bg-white/60 px-3 py-2">
                  <summary className="cursor-pointer font-mono text-[9.5px] uppercase tracking-[0.14em] text-amber">
                    exact OpenAI prompt
                  </summary>
                  <pre className="mt-2 max-h-[180px] overflow-auto whitespace-pre-wrap break-words font-mono text-[10.5px] leading-[1.6] text-mute">
                    {result.openAiStep.prompt}
                  </pre>
                </details>
              </>
            ) : (
              <span className="text-mute">
                Empty until conversion. This is the final interpretation OpenAI writes.
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function MarkdownLike({ body }: { body: string }) {
  const lines = body.split("\n");
  return (
    <div className="mt-2 max-h-[300px] overflow-auto pr-1 text-[12.5px] leading-[1.65] text-ink">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="h-2" />;
        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={index} className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-moss">
              {formatInline(trimmed.slice(4))}
            </h4>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={index} className="mt-4 text-[14px] font-semibold text-ink">
              {formatInline(trimmed.slice(3))}
            </h3>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h2 key={index} className="text-[15px] font-semibold text-ink">
              {formatInline(trimmed.slice(2))}
            </h2>
          );
        }
        if (trimmed.startsWith("> ")) {
          return (
            <blockquote key={index} className="my-2 border-l-2 border-moss/30 pl-3 text-mute">
              {formatInline(trimmed.slice(2))}
            </blockquote>
          );
        }
        if (/^[-*]\s+/.test(trimmed)) {
          return (
            <div key={index} className="flex gap-2">
              <span className="mt-[0.65em] h-1 w-1 shrink-0 rounded-full bg-moss" />
              <span>{formatInline(trimmed.replace(/^[-*]\s+/, ""))}</span>
            </div>
          );
        }
        if (/^\d+\.\s+/.test(trimmed)) {
          const [num] = trimmed.split(".");
          return (
            <div key={index} className="flex gap-2">
              <span className="shrink-0 font-mono text-[11px] text-moss">{num}.</span>
              <span>{formatInline(trimmed.replace(/^\d+\.\s+/, ""))}</span>
            </div>
          );
        }
        return <p key={index}>{formatInline(trimmed)}</p>;
      })}
    </div>
  );
}

function formatInline(value: string) {
  const parts = value.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={index}>{part}</span>
    )
  );
}

function SourceBadge({
  children,
  tone
}: {
  children: React.ReactNode;
  tone: "raw" | "nia" | "openai";
}) {
  const toneClass =
    tone === "nia"
      ? "border-moss/20 bg-white/70 text-moss"
      : tone === "openai"
      ? "border-amber/20 bg-white/70 text-amber"
      : "border-line bg-white text-mute";
  return (
    <div
      className={`mb-2 inline-flex rounded border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] ${toneClass}`}
    >
      {children}
    </div>
  );
}

function shortId(value: string) {
  return value.length > 10 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}
