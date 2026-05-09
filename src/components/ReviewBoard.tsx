"use client";

import { useMemo, useState } from "react";
import { Check, Mail, Play, RefreshCw, Save, Sparkles } from "lucide-react";
import type { DetectedUser, RunHistoryItem } from "@/app/lib/types";
import { clsx } from "clsx";

type Props = {
  initialUsers: DetectedUser[];
  initialRuns: RunHistoryItem[];
};

export function ReviewBoard({ initialUsers, initialRuns }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [runs, setRuns] = useState(initialRuns);
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(initialUsers.map((user) => [user.id, user.draft_message ?? ""]))
  );
  const [busy, setBusy] = useState<string | null>(null);
  const pendingCount = useMemo(() => users.filter((user) => user.status === "pending").length, [users]);

  async function loadData() {
    const [usersResponse, runsResponse] = await Promise.all([
      fetch("/api/detected-users", { cache: "no-store" }),
      fetch("/api/runs", { cache: "no-store" })
    ]);
    const usersPayload = (await usersResponse.json()) as { users: DetectedUser[] };
    const runsPayload = (await runsResponse.json()) as { runs: RunHistoryItem[] };
    setUsers(usersPayload.users);
    setRuns(runsPayload.runs);
    setDrafts(Object.fromEntries(usersPayload.users.map((user) => [user.id, user.draft_message ?? ""])));
  }

  async function refresh() {
    setBusy("refresh");
    try {
      await loadData();
    } finally {
      setBusy(null);
    }
  }

  async function triggerAgent() {
    setBusy("trigger");
    try {
      await fetch("/api/run-agent", { method: "POST" });
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await sleep(3500);
        await loadData();
      }
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft(userId: string) {
    setBusy(`save:${userId}`);
    try {
      await fetch(`/api/detected-users/${userId}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_message: drafts[userId] ?? "" })
      });
    } finally {
      setBusy(null);
    }
  }

  async function send(userId: string) {
    setBusy(`send:${userId}`);
    try {
      await fetch(`/api/detected-users/${userId}/send`, { method: "POST" });
      setUsers((current) => current.map((user) => (user.id === userId ? { ...user, status: "sent" } : user)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-4 px-4 py-4 sm:px-5">
      <header className="flex flex-col gap-3 border-b border-line pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-moss">
            <Sparkles size={14} />
            fastclip.it recovery desk
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">Churn Recovery Agent</h1>
          <p className="mt-1 max-w-2xl text-sm text-moss">
            Review founder-voice drafts for users who tried fastclip.it, hit friction, and disappeared.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={refresh}
            disabled={busy !== null}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink shadow-sm disabled:opacity-60"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <button
            onClick={triggerAgent}
            disabled={busy !== null}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-action px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
          >
            <Play size={16} />
            Trigger Agent Now
          </button>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="h-fit rounded-md border border-line bg-white p-3 shadow-soft lg:sticky lg:top-4">
          <h2 className="text-base font-semibold text-ink">Run History</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Metric label="Pending" value={pendingCount.toString()} />
            <Metric label="Users" value={users.length.toString()} />
            <Metric label="Runs" value={runs.length.toString()} />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {runs.length === 0 ? (
              <p className="text-sm text-moss">No runs logged yet.</p>
            ) : (
              runs.map((run) => (
                <div key={run.key} className="rounded-md bg-field px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{formatDate(run.ran_at)}</p>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-moss">
                      {run.users_found ?? 0} users
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-moss">{run.status ?? "complete"} · {run.source ?? "agent"}</p>
                </div>
              ))
            )}
          </div>
        </aside>

        <div className="flex flex-col gap-3">
          {users.length === 0 ? (
            <div className="rounded-md border border-dashed border-line bg-white p-8 text-center text-moss">
              No detected users yet. Trigger the agent after Turso and Tensorlake env vars are configured.
            </div>
          ) : (
            users.map((user) => (
              <article
                key={user.id}
                className="grid gap-3 rounded-md border border-line bg-white p-3 shadow-sm xl:grid-cols-[220px_minmax(0,1fr)_minmax(360px,0.9fr)]"
              >
                <div className="flex flex-col gap-2">
                  <div>
                    <h2 className="truncate text-base font-semibold text-ink">{user.name}</h2>
                    <p className="mt-0.5 truncate text-xs text-moss">{user.email}</p>
                  </div>
                  <span
                    className={clsx(
                      "inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      user.status === "sent" ? "bg-green-100 text-success" : "bg-amber-100 text-warning"
                    )}
                  >
                    {user.status}
                  </span>
                  <details className="rounded-md bg-field px-2.5 py-2 text-xs text-moss">
                    <summary className="cursor-pointer font-semibold text-ink">timeline</summary>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-5">{user.event_timeline}</pre>
                  </details>
                </div>

                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <InfoBlock title="Why detected" value={user.detection_reason} />
                  <InfoBlock title="Activity summary" value={user.activity_summary} />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.08em] text-moss" htmlFor={`draft-${user.id}`}>
                    Draft
                  </label>
                  <textarea
                    id={`draft-${user.id}`}
                    value={drafts[user.id] ?? ""}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [user.id]: event.target.value }))
                    }
                    className="mt-1 min-h-24 w-full resize-y rounded-md border border-line bg-paper p-2 text-sm leading-5 text-ink outline-none focus:border-action focus:ring-2 focus:ring-action/20 xl:min-h-28"
                  />
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <button
                      onClick={() => saveDraft(user.id)}
                      disabled={busy !== null}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2.5 text-xs font-semibold text-ink disabled:opacity-60"
                    >
                      <Save size={14} />
                      Save
                    </button>
                    <button
                      onClick={() => send(user.id)}
                      disabled={busy !== null || user.status === "sent"}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-success px-2.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {user.status === "sent" ? <Check size={14} /> : <Mail size={14} />}
                      Send
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-paper p-2">
      <p className="text-[11px] font-semibold text-moss">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function InfoBlock({ title, value }: { title: string; value: string | null }) {
  return (
    <div className="min-h-24 rounded-md bg-field p-2.5">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-moss">{title}</p>
      <p className="mt-1 line-clamp-5 text-sm leading-5 text-ink">{value}</p>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
