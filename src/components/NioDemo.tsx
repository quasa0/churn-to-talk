"use client";

import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";

type Props = {
  rawActivity: string;
  userName: string;
};

export function NioDemo({ rawActivity, userName }: Props) {
  const [result, setResult] = useState("");
  const [angle, setAngle] = useState("");
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
        story?: string;
        angle?: string;
        error?: string;
      };
      setResult(payload.story ?? payload.error ?? "No story returned.");
      setAngle(payload.angle ?? "");
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
          Convert the raw product trail into a founder-readable story using indexed fastclip.it context.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-4 p-6">
        <div className="col-span-12 lg:col-span-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            raw activity
          </div>
          <pre className="mt-2 min-h-[220px] max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-paper p-4 font-mono text-[11.5px] leading-[1.7] text-ink">
            {rawActivity || "-"}
          </pre>
        </div>

        <div className="col-span-12 flex items-center justify-center lg:col-span-2">
          <button
            onClick={convert}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-[13px] font-medium text-paper transition-colors hover:bg-black disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            Convert
          </button>
        </div>

        <div className="col-span-12 lg:col-span-5">
          <div className="flex items-center justify-between gap-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              nio output
            </div>
            {angle ? (
              <span className="rounded bg-mossSoft px-1.5 py-0.5 font-mono text-[9.5px] text-moss">
                {angle}
              </span>
            ) : null}
          </div>
          <div className="mt-2 min-h-[220px] rounded-md border border-line bg-paper p-4 text-[14px] leading-[1.7] text-ink">
            {result || (
              <span className="text-mute">
                Empty until conversion. Click Convert multiple times to see the Nio-backed story change.
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
