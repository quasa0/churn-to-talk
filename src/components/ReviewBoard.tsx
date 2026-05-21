"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Code2,
  DatabaseZap,
  ExternalLink,
  FlaskConical,
  Globe2,
  Loader2,
  MapPin,
  RefreshCw,
  Terminal,
  Trophy,
  Zap,
} from "lucide-react";
import { clsx } from "clsx";
import type { DetectedUser, RunHistoryItem } from "@/app/lib/types";

type Props = {
  initialUsers: DetectedUser[];
  initialRuns: RunHistoryItem[];
};

type FilterId = "pending" | "sent" | "all";
type KnowledgeStatus = "idle" | "saved" | "error";

export function ReviewBoard({ initialUsers, initialRuns }: Props) {
  const [users, setUsers] = useState<DetectedUser[]>(initialUsers);
  const [runs, setRuns] = useState<RunHistoryItem[]>(initialRuns);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialUsers.map((u) => [u.id, u.draft_message ?? ""]))
  );
  const [topBusy, setTopBusy] = useState<"refresh" | "trigger" | null>(null);
  const [rowBusy, setRowBusy] = useState<Record<string, "save" | "send" | "knowledge">>({});
  const [knowledgeStatus, setKnowledgeStatus] = useState<Record<string, KnowledgeStatus>>({});
  const [filter, setFilter] = useState<FilterId>("pending");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [highlightedUserId, setHighlightedUserId] = useState<string | null>(null);
  const pollingRuns = useRef<Set<string>>(new Set());

  const pendingCount = useMemo(
    () => users.filter((u) => u.status === "pending").length,
    [users]
  );
  const sentCount = useMemo(
    () => users.filter((u) => u.status === "sent").length,
    [users]
  );
  const visible = useMemo(() => {
    const filtered =
      filter === "all" ? users : users.filter((u) => u.status === filter);
    if (!selectedUserId) return filtered;
    const selected = filtered.find((u) => u.id === selectedUserId);
    if (!selected) return filtered;
    return [selected, ...filtered.filter((u) => u.id !== selectedUserId)];
  }, [users, filter, selectedUserId]);

  const lastRun = runs[0];

  const loadData = useCallback(async () => {
    const [u, r] = await Promise.all([
      fetch("/api/detected-users", { cache: "no-store" }),
      fetch("/api/runs", { cache: "no-store" }),
    ]);
    const usersPayload = (await u.json()) as { users: DetectedUser[] };
    const runsPayload = (await r.json()) as { runs: RunHistoryItem[] };
    setUsers(usersPayload.users);
    setRuns(runsPayload.runs);
    setDrafts(
      Object.fromEntries(
        usersPayload.users.map((x) => [x.id, x.draft_message ?? ""])
      )
    );
  }, []);

  async function refresh() {
    setTopBusy("refresh");
    try {
      await loadData();
    } finally {
      setTopBusy(null);
    }
  }

  function changeFilter(nextFilter: FilterId) {
    setFilter(nextFilter);
    setSelectedUserId(null);
    setHighlightedUserId(null);
    if (window.location.search.includes("sendTo=")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }

  async function triggerAgent() {
    setTopBusy("trigger");
    try {
      const response = await fetch("/api/run-agent", { method: "POST" });
      const payload = (await response.json()) as {
        tensorlake?: { request_id?: string };
        pendingRun?: RunHistoryItem | null;
      };
      const requestId = payload.tensorlake?.request_id;
      const pendingRun = payload.pendingRun;

      if (pendingRun) {
        setRuns((current) => [
          pendingRun,
          ...current.filter((run) => run.key !== pendingRun.key),
        ]);
      }

      if (!requestId) {
        await loadData();
        return;
      }

      for (let i = 0; i < 40; i++) {
        await new Promise((res) => setTimeout(res, 2500));
        const statusResponse = await fetch(`/api/run-agent/${requestId}`, {
          cache: "no-store",
        });
        const statusPayload = (await statusResponse.json()) as {
          complete?: boolean;
          output?: {
            run_id?: string;
            ran_at?: string;
            users_found?: number;
            status?: string;
            source?: string;
          };
        };

        if (statusPayload.complete) {
          setRuns((current) => [
            ...current.filter((run) => run.key !== pendingRun?.key),
          ]);
          await loadData();
          return;
        }
      }

      await loadData();
    } finally {
      setTopBusy(null);
    }
  }

  const pollRun = useCallback(async (requestId: string) => {
    if (pollingRuns.current.has(requestId)) return;
    pollingRuns.current.add(requestId);
    for (let i = 0; i < 40; i++) {
      await new Promise((res) => setTimeout(res, 2500));
      const statusResponse = await fetch(`/api/run-agent/${requestId}`, {
        cache: "no-store",
      });
      if (!statusResponse.ok) {
        pollingRuns.current.delete(requestId);
        return;
      }
      const statusPayload = (await statusResponse.json()) as { complete?: boolean };
      if (statusPayload.complete) {
        pollingRuns.current.delete(requestId);
        await loadData();
        return;
      }
    }
    pollingRuns.current.delete(requestId);
  }, [loadData]);

  async function saveDraft(userId: string) {
    setRowBusy((current) => ({ ...current, [userId]: "save" }));
    try {
      await fetch(`/api/detected-users/${userId}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_message: drafts[userId] ?? "" }),
      });
      setUsers((curr) =>
        curr.map((u) =>
          u.id === userId ? { ...u, draft_message: drafts[userId] ?? "" } : u
        )
      );
    } finally {
      setRowBusy((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
    }
  }

  async function send(userId: string) {
    setRowBusy((current) => ({ ...current, [userId]: "send" }));
    try {
      await fetch(`/api/detected-users/${userId}/send`, { method: "POST" });
      setUsers((curr) =>
        curr.map((u) => (u.id === userId ? { ...u, status: "sent" } : u))
      );
    } finally {
      setRowBusy((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
    }
  }

  async function addToKnowledgeGraph(userId: string) {
    setRowBusy((current) => ({ ...current, [userId]: "knowledge" }));
    setKnowledgeStatus((current) => ({ ...current, [userId]: "idle" }));
    try {
      const user = users.find((item) => item.id === userId);
      const draft = drafts[userId] ?? "";
      if (user && draft !== (user.draft_message ?? "")) {
        await fetch(`/api/detected-users/${userId}/draft`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft_message: draft }),
        });
        setUsers((curr) =>
          curr.map((item) =>
            item.id === userId ? { ...item, draft_message: draft } : item
          )
        );
      }

      const response = await fetch(`/api/detected-users/${userId}/knowledge`, { method: "POST" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Hyperspell write failed");
      }
      setKnowledgeStatus((current) => ({ ...current, [userId]: "saved" }));
    } catch {
      setKnowledgeStatus((current) => ({ ...current, [userId]: "error" }));
    } finally {
      setRowBusy((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sendTo = params.get("sendTo");
    if (!sendTo) return;

    setSelectedUserId(sendTo);
    setHighlightedUserId(sendTo);
    setFilter("all");
    window.scrollTo({ top: 0, behavior: "smooth" });

    const clear = window.setTimeout(() => {
      setHighlightedUserId((current) => (current === sendTo ? null : current));
    }, 10000);

    return () => window.clearTimeout(clear);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    for (const run of runs) {
      if (run.status === "running" && run.request_id) {
        void pollRun(run.request_id);
      }
    }
  }, [pollRun, runs]);

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-6 px-8 py-3.5">
          <div className="flex items-center gap-3">
            <Logo />
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[14px] font-semibold tracking-tight sm:text-[15px]">
                Churn → Talk | Command Center
              </span>
              <span className="hidden h-4 w-px bg-line sm:block" />
              <span className="rounded-md border border-line bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
                fastclip.it
              </span>
            </div>
          </div>

          <div className="hidden items-center gap-7 md:flex">
            <TopStat k="pending" v={pendingCount} />
            <TopStat k="sent" v={sentCount} />
            <TopStat
              k="last run"
              v={lastRun ? relativeFromNow(lastRun.ran_at) : "—"}
              mono
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={topBusy !== null}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2.5 text-[12px] font-medium text-ink transition-colors hover:bg-paper2 disabled:opacity-50"
            >
              <RefreshCw
                size={13}
                className={topBusy === "refresh" ? "animate-spin" : ""}
              />
              Refresh
            </button>
            <button
              onClick={triggerAgent}
              disabled={topBusy !== null}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-ink px-3 text-[12px] font-medium text-paper transition-colors hover:bg-black disabled:opacity-60"
            >
              {topBusy === "trigger" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Zap size={12} />
              )}
              {topBusy === "trigger" ? "Running…" : "Trigger agent"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1480px] px-8 pb-24 pt-8">
        {/* Hero */}
        <div className="grid grid-cols-12 items-end gap-10">
          <div className="col-span-12 lg:col-span-8">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-mute">
              churn recovery · agent
            </div>
            <h1 className="mt-3 max-w-3xl text-[44px] font-semibold leading-[1.05] tracking-tight">
              {pendingCount} {pendingCount === 1 ? "draft" : "drafts"} waiting
              for your voice.
            </h1>
            <p className="mt-3 max-w-xl text-[14.5px] leading-[1.6] text-mute">
              Tensorlake watches for churn signals, reconstructs what each user
              tried, and drafts the short founder note you would have written
              yourself.
            </p>
          </div>
          <div className="col-span-12 lg:col-span-4">
            <Cadence pendingCount={pendingCount} sentCount={sentCount} />
          </div>
        </div>

        <HackathonSection />

        <div className="mt-12 grid grid-cols-12 gap-10">
          {/* Run history rail */}
          <aside className="col-span-12 lg:col-span-3">
            <RunHistory runs={runs} />
          </aside>

          {/* User list */}
          <section className="col-span-12 lg:col-span-9">
            <div className="flex items-end justify-between border-b border-line pb-3">
              <div className="flex items-baseline gap-3">
                <h2 className="text-[15px] font-semibold tracking-tight">
                  Detected users
                </h2>
                <span className="font-mono text-[11px] text-mute">
                  {visible.length} shown
                </span>
              </div>
              <FilterTabs
                value={filter}
                onChange={changeFilter}
                counts={{
                  pending: pendingCount,
                  sent: sentCount,
                  all: users.length,
                }}
              />
            </div>

            <div className="mt-6 flex flex-col gap-6">
              {visible.length === 0 ? (
                <EmptyState />
              ) : (
                visible.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    draft={drafts[user.id] ?? ""}
                    onDraftChange={(v) => {
                      setDrafts((c) => ({ ...c, [user.id]: v }));
                      setKnowledgeStatus((current) => ({ ...current, [user.id]: "idle" }));
                    }}
                    onSave={() => saveDraft(user.id)}
                    onSend={() => send(user.id)}
                    onAddToKnowledgeGraph={() => addToKnowledgeGraph(user.id)}
                    busy={rowBusy[user.id] ?? null}
                    knowledgeStatus={knowledgeStatus[user.id] ?? "idle"}
                    highlighted={highlightedUserId === user.id}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function HackathonSection() {
  const facts = [
    { icon: CalendarDays, label: "Date", value: "May 9, 2026" },
    { icon: MapPin, label: "Place", value: "Entrepreneur First Office, San Francisco" },
    { icon: Trophy, label: "Result", value: "6th place among ~51 teams" },
  ];

  return (
    <section className="mt-8 overflow-hidden rounded-xl border border-line bg-white">
      <div className="grid grid-cols-12 gap-0 lg:divide-x lg:divide-line">
        <div className="col-span-12 px-5 py-5 sm:px-6 lg:col-span-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-mute">
            Hackathon project
          </div>
          <h2 className="mt-2 text-[22px] font-semibold leading-tight tracking-tight">
            Built at the Nozomio Hackathon.
          </h2>
          <p className="mt-2 max-w-xl text-[13.5px] leading-[1.6] text-mute">
            Churn to Talk was created as part of the Nozomio Hackathon, a
            one-day AI agents hackathon in San Francisco. We finished in the
            top 6 out of roughly 51 teams and 200+ participants.
          </p>
          <a
            href="https://luma.com/rshibq6i?tk=KPGwGN"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex h-8 items-center gap-2 rounded-md border border-line bg-paper px-3 text-[12px] font-medium text-ink transition-colors hover:bg-paper2"
          >
            View Luma event
            <ExternalLink size={12} />
          </a>
        </div>

        <div className="col-span-12 grid grid-cols-1 divide-y divide-line border-t border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:col-span-7 lg:border-t-0">
          {facts.map((fact) => {
            const Icon = fact.icon;
            return (
              <div key={fact.label} className="min-w-0 px-5 py-5 sm:px-6">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                  <Icon size={13} className="shrink-0 text-moss" />
                  {fact.label}
                </div>
                <div className="mt-2 text-[15px] font-semibold leading-snug text-ink">
                  {fact.value}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────── Top bar pieces

function TopStat({ k, v, mono = false }: { k: string; v: string | number; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
        {k}
      </span>
      <span
        className={clsx(
          "text-[13px] font-semibold tabular-nums",
          mono && "font-mono"
        )}
      >
        {v}
      </span>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-white">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="#111714" strokeWidth="1.4" />
        <path
          d="M3.5 7.5 L6 10 L10.5 4.5"
          stroke="#4F7A5C"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  );
}

// ───────────────────────────── Cadence card

function Cadence({
  pendingCount,
  sentCount,
}: {
  pendingCount: number;
  sentCount: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
      <CadenceCell label="pending" value={pendingCount} accent="amber" />
      <CadenceCell label="sent today" value={sentCount} accent="moss" />
    </div>
  );
}

function CadenceCell({
  label,
  value,
  accent,
  mono,
}: {
  label: string;
  value: string | number;
  accent?: "amber" | "moss";
  mono?: boolean;
}) {
  const dot =
    accent === "amber"
      ? "bg-amber"
      : accent === "moss"
      ? "bg-moss"
      : "bg-mute2";
  return (
    <div className="bg-white p-4">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
        <span className={clsx("h-1.5 w-1.5 rounded-full", dot)} />
        {label}
      </div>
      <div
        className={clsx(
          "mt-2 text-[26px] font-semibold tabular-nums",
          mono && "font-mono"
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ───────────────────────────── Filter tabs

function FilterTabs({
  value,
  onChange,
  counts,
}: {
  value: FilterId;
  onChange: (v: FilterId) => void;
  counts: Record<FilterId, number>;
}) {
  const opts: { id: FilterId; label: string }[] = [
    { id: "pending", label: "Pending" },
    { id: "sent", label: "Sent" },
    { id: "all", label: "All" },
  ];
  return (
    <div className="flex items-center gap-1 rounded-md border border-line bg-white p-0.5">
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={clsx(
              "inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-[12px] font-medium transition-colors",
              active ? "bg-ink text-paper" : "text-mute hover:text-ink"
            )}
          >
            {o.label}
            <span
              className={clsx(
                "font-mono text-[10px]",
                active ? "text-paper/70" : "text-mute2"
              )}
            >
              {counts[o.id] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────────── Run history sidebar

function RunHistory({ runs }: { runs: RunHistoryItem[] }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!runs.some((run) => run.status === "running")) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [runs]);

  return (
    <div className="lg:sticky lg:top-[68px]">
      <div className="border-b border-line pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight">Tensorlake runs</h2>
          <span className="font-mono text-[10px] tabular-nums text-mute">
            {runs.length}/1000
          </span>
        </div>
        <p className="mt-1 font-mono text-[11px] text-mute">
          Tensorlake CRON · every 3 minutes
        </p>
      </div>

      {runs.length === 0 ? (
        <p className="mt-4 text-sm text-mute">No runs logged yet.</p>
      ) : (
        <ol
          className="mt-5 flex max-h-[min(1680px,calc(100vh-145px))] flex-col overflow-y-auto pr-2"
          aria-label="Last 1000 agent runs"
        >
          {runs.map((r, i) => {
            const source = runSourceMeta(r.source);
            const Icon = source.icon;
            return (
              <li
                key={r.key}
                className="relative grid grid-cols-[26px_1fr] gap-3 pb-5"
              >
                {i < runs.length - 1 && (
                  <span className="absolute left-[12px] top-5 h-full w-px bg-line" />
                )}
                <span
                  className={clsx(
                    "relative z-10 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-paper",
                    source.dot
                  )}
                >
                  <Icon size={12} strokeWidth={2.3} className="text-white" />
                </span>
                <div className="min-w-0">
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2">
                    <span
                      className={clsx(
                        "font-mono text-[11px] tabular-nums text-ink",
                        source.isCron && "font-bold"
                      )}
                    >
                      {fmtClock(r.ran_at)}
                    </span>
                    {r.request_id ? (
                      <a
                        href={tensorlakeRequestUrl(r.request_id)}
                        target="_blank"
                        rel="noreferrer"
                        className={clsx(
                          "inline-flex items-center gap-1 justify-self-end rounded px-1.5 py-0.5 text-right font-mono text-[9.5px] leading-tight tracking-[0.04em] transition-transform hover:-translate-y-px",
                          source.badge
                        )}
                        aria-label={`Open ${source.label} run in Tensorlake`}
                      >
                        {source.label}
                        <ArrowRight size={10} strokeWidth={2.4} />
                      </a>
                    ) : (
                      <span
                        className={clsx(
                          "justify-self-end rounded px-1.5 py-0.5 text-right font-mono text-[9.5px] leading-tight tracking-[0.04em]",
                          source.badge
                        )}
                      >
                        {source.label}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-mute">
                    {r.status === "running" ? (
                      <span className="inline-flex items-center gap-1.5 text-amber">
                        <Loader2 size={11} className="animate-spin" />
                        running {fmtElapsed(r.ran_at, now)}
                      </span>
                    ) : r.status === "failed" ? (
                      <span className="text-amber">failed</span>
                    ) : (r.users_found ?? 0) > 0 ? (
                      <span>
                        <span className="font-semibold text-ink tabular-nums">
                          {r.users_found}
                        </span>{" "}
                        {r.users_found === 1 ? "user" : "users"} surfaced
                      </span>
                    ) : (
                      <span className="text-mute2">no signal</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function runSourceMeta(source?: string) {
  const normalized = (source ?? "agent").toLowerCase();
  if (normalized === "cron") {
    return {
      label: "Tensorlake CRON",
      dot: "bg-moss",
      badge: "bg-mossSoft text-moss",
      icon: Clock3,
      isCron: true,
    };
  }
  if (normalized === "manual-script" || normalized === "manual") {
    return {
      label: "Manually over CLI",
      dot: "bg-amber",
      badge: "bg-amberSoft text-amber",
      icon: Terminal,
      isCron: false,
    };
  }
  if (normalized === "vercel-ui" || normalized === "vercel") {
    return {
      label: "Web UI Trigger",
      dot: "bg-[#2F7EA3]",
      badge: "bg-[#E4F1F6] text-[#246A8A]",
      icon: Globe2,
      isCron: false,
    };
  }
  if (normalized === "local") {
    return {
      label: "Local test",
      dot: "bg-amber",
      badge: "bg-amberSoft text-amber",
      icon: FlaskConical,
      isCron: false,
    };
  }
  return {
    label: sourceLabel(source),
    dot: "bg-mute",
    badge: "bg-paper2 text-mute",
    icon: Code2,
    isCron: false,
  };
}

function sourceLabel(source?: string) {
  if (!source) return "Agent";
  return source
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// ───────────────────────────── User row

function UserRow({
  user,
  draft,
  onDraftChange,
  onSave,
  onSend,
  onAddToKnowledgeGraph,
  busy,
  knowledgeStatus,
  highlighted,
  showDetailsLink = true,
}: {
  user: DetectedUser;
  draft: string;
  onDraftChange: (v: string) => void;
  onSave: () => void;
  onSend: () => void;
  onAddToKnowledgeGraph: () => void;
  busy: string | null;
  knowledgeStatus: KnowledgeStatus;
  highlighted: boolean;
  showDetailsLink?: boolean;
}) {
  const dirty = draft !== (user.draft_message ?? "");
  const sent = user.status === "sent";
  const profile = useMemo(() => deriveEngagement(user), [user]);

  return (
    <article
      className={clsx(
        "overflow-hidden rounded-xl border border-line bg-white transition-[box-shadow,background-color,border-color] duration-500",
        highlighted &&
          "border-amber bg-[#FFFBF1] shadow-[0_0_0_6px_rgba(176,122,44,0.14),0_18px_60px_rgba(176,122,44,0.22)]"
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line px-6 pt-5 pb-4">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={user.name ?? "?"} />
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h3 className="truncate text-[17px] font-semibold tracking-tight">
                {user.name ?? "Unknown"}
              </h3>
              <StatusPill status={user.status} />
            </div>
            <div className="mt-1 flex items-center gap-2 font-mono text-[11.5px] text-mute">
              <span className="truncate">{user.email ?? "—"}</span>
              <span className="text-line">·</span>
              <span>detected {relativeFromNow(user.detected_at)}</span>
            </div>
          </div>
        </div>

        <KPIStrip profile={profile} />
      </header>

      <div className="grid grid-cols-12 gap-0 lg:divide-x lg:divide-line">
        <div className="col-span-12 px-6 py-5 lg:col-span-7">
          <ActivityChart profile={profile} />

          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Reason title="Why churned" body={user.detection_reason} />
            <Reason title="Nia-augmented activity summary" body={user.activity_summary} />
          </div>

          {user.event_timeline ? (
            <details className="mt-4 rounded-md bg-paper2 px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                  Raw events timeline from PostHog
                </span>
                <ChevronDown size={11} className="text-mute" />
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[1.7] text-ink">
                {eventTimelineText(user.event_timeline)}
              </pre>
            </details>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href="https://posthog.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-white px-3 text-[12px] font-medium text-ink transition-colors hover:bg-paper2"
            >
              <PostHogMark />
              See activity in PostHog →
            </a>
            {showDetailsLink ? (
              <Link
                href={`/users/${encodeURIComponent(user.id)}`}
                className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-white px-3 text-[12px] font-medium text-ink transition-colors hover:bg-paper2"
              >
                View full details →
              </Link>
            ) : null}
          </div>
        </div>

        <div className="col-span-12 border-t border-line px-6 py-5 lg:col-span-5 lg:border-t-0">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Founder-voice draft
            </div>
            <div className="font-mono text-[10px] tabular-nums text-mute2">
              {draft.length} chars
            </div>
          </div>

          <textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            rows={11}
            spellCheck={false}
            className="mt-2 w-full resize-none rounded-md border border-line bg-paper p-3.5 text-[13.5px] leading-[1.65] text-ink outline-none focus:border-ink focus:ring-2 focus:ring-ink/5"
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="font-mono text-[11px] text-mute">
              {dirty ? (
                <span className="text-amber">● unsaved edit</span>
              ) : (
                <span>synced</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onAddToKnowledgeGraph}
                disabled={busy !== null}
                className={clsx(
                  "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium transition-colors disabled:opacity-50",
                  knowledgeStatus === "saved"
                    ? "border-moss/25 bg-mossSoft text-moss hover:bg-mossSoft"
                    : knowledgeStatus === "error"
                    ? "border-amber/25 bg-amberSoft text-amber hover:bg-amberSoft"
                    : "border-line bg-white text-ink hover:bg-paper2"
                )}
              >
                {busy === "knowledge" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : knowledgeStatus === "saved" ? (
                  <Check size={13} />
                ) : (
                  <DatabaseZap size={13} />
                )}
                {busy === "knowledge"
                  ? "Adding"
                  : knowledgeStatus === "saved"
                  ? "Saved to Hyperspell"
                  : knowledgeStatus === "error"
                  ? "Retry Hyperspell"
                  : "Save to Hyperspell"}
              </button>
              <button
                onClick={onSave}
                disabled={!dirty || busy !== null}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-3 text-[12px] font-medium text-ink transition-colors hover:bg-paper2 disabled:opacity-50"
              >
                {busy === "save" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : null}
                Save
              </button>
              <button
                onClick={onSend}
                disabled={sent || busy !== null}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-ink px-3 text-[12px] font-medium text-paper transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-mute2"
              >
                {sent ? (
                  <>
                    <Check size={12} /> Sent
                  </>
                ) : busy === "send" ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Sending
                  </>
                ) : (
                  <>
                    <ArrowRight size={12} /> Send
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function FocusedUserCard({ user }: { user: DetectedUser }) {
  const [draft, setDraft] = useState(user.draft_message ?? "");
  const [currentUser, setCurrentUser] = useState(user);
  const [busy, setBusy] = useState<"save" | "send" | "knowledge" | null>(null);
  const [knowledgeStatus, setKnowledgeStatus] = useState<KnowledgeStatus>("idle");

  async function saveDraft() {
    setBusy("save");
    try {
      await fetch(`/api/detected-users/${user.id}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_message: draft }),
      });
      setCurrentUser((curr) => ({ ...curr, draft_message: draft }));
    } finally {
      setBusy(null);
    }
  }

  async function sendDraft() {
    setBusy("send");
    try {
      await fetch(`/api/detected-users/${user.id}/send`, { method: "POST" });
      setCurrentUser((curr) => ({ ...curr, status: "sent" }));
    } finally {
      setBusy(null);
    }
  }

  async function addToKnowledgeGraph() {
    setBusy("knowledge");
    setKnowledgeStatus("idle");
    try {
      if (draft !== (currentUser.draft_message ?? "")) {
        await fetch(`/api/detected-users/${user.id}/draft`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft_message: draft }),
        });
        setCurrentUser((curr) => ({ ...curr, draft_message: draft }));
      }

      const response = await fetch(`/api/detected-users/${user.id}/knowledge`, { method: "POST" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Hyperspell write failed");
      }
      setKnowledgeStatus("saved");
    } catch {
      setKnowledgeStatus("error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <UserRow
      user={currentUser}
      draft={draft}
      onDraftChange={(value) => {
        setDraft(value);
        setKnowledgeStatus("idle");
      }}
      onSave={saveDraft}
      onSend={sendDraft}
      onAddToKnowledgeGraph={addToKnowledgeGraph}
      busy={busy}
      knowledgeStatus={knowledgeStatus}
      highlighted={false}
      showDetailsLink={false}
    />
  );
}

// ───────────────────────────── Card pieces

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-paper2 font-mono text-[12px] font-semibold text-ink">
      {initials || "?"}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cfg =
    status === "sent"
      ? { label: "sent", cls: "bg-mossSoft text-moss", dot: "bg-moss" }
      : status === "archived"
      ? { label: "archived", cls: "bg-paper2 text-mute", dot: "bg-mute2" }
      : { label: "pending", cls: "bg-amberSoft text-amber", dot: "bg-amber" };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]",
        cfg.cls
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function PostHogMark() {
  return (
    <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-sm bg-[#F9BD2B] text-[9px] font-bold text-ink">
      <span className="absolute left-[3px] top-[3px] h-2 w-2 rounded-full border border-ink/80 bg-white" />
      <span className="absolute bottom-[3px] right-[3px] h-1.5 w-1.5 rounded-full bg-ink" />
    </span>
  );
}

function KPIStrip({ profile }: { profile: EngagementProfile }) {
  const totalMin = profile.minutes;
  const time =
    totalMin >= 60 ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m` : `${totalMin}m`;
  const items = [
    { k: "sessions", v: profile.sessions, accent: "ink" as const },
    { k: "time", v: time, accent: "ink" as const },
    { k: "visits", v: profile.pageVisits, accent: "ink" as const },
    { k: "dormant", v: `${profile.dormantDays}d`, accent: "amber" as const },
  ];
  return (
    <div className="hidden shrink-0 items-stretch divide-x divide-line rounded-md border border-line bg-paper2 sm:flex">
      {items.map((it) => (
        <div key={it.k} className="px-3.5 py-2">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-mute">
            {it.k}
          </div>
          <div
            className={clsx(
              "mt-0.5 text-[15px] font-semibold tabular-nums",
              it.accent === "amber" ? "text-amber" : "text-ink"
            )}
          >
            {it.v}
          </div>
        </div>
      ))}
    </div>
  );
}

function Reason({ title, body }: { title: string; body: string | null }) {
  return (
    <div className="rounded-md bg-paper2 px-3.5 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
        {title}
      </div>
      <p className="mt-1.5 text-[13px] leading-[1.6] text-ink">{body ?? "—"}</p>
    </div>
  );
}

// ───────────────────────────── Activity chart

function ActivityChart({ profile }: { profile: EngagementProfile }) {
  const total = profile.days.length;
  const today = total - 1;
  const dormantStart = total - profile.dormantDays;
  const maxSessions = Math.max(2, ...profile.days.map((d) => d.sessions));

  const W = 600;
  const H = 160;
  const padX = 14;
  const baseline = H - 30;
  const topPad = 50;
  const colW = (W - padX * 2) / total;

  return (
    <div className="rounded-md border border-line bg-white">
      <div className="flex items-end justify-between gap-4 px-4 pt-3.5">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Engagement trail
          </div>
          <div className="mt-0.5 text-[13px] text-mute">
            <span className="font-semibold text-ink tabular-nums">
              {profile.activeDates}
            </span>{" "}
            active dates over{" "}
            <span className="font-semibold text-ink tabular-nums">
              {profile.onboardedDaysAgo}
            </span>{" "}
            days
            <span className="mx-1.5 text-mute2">·</span>
            <span className="text-amber">
              dormant{" "}
              <span className="tabular-nums font-semibold">
                {profile.dormantDays}d
              </span>
            </span>
          </div>
        </div>
        <div className="hidden items-center gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-mute md:flex">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-moss" />
            active
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-amber" />
            dormant
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-line" />
            idle
          </span>
        </div>
      </div>

      <div className="px-2 pb-2 pt-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-[140px] w-full"
          role="img"
          aria-label="User activity timeline"
        >
          <defs>
            <pattern
              id={`dormant-${profile.seed}`}
              width="4"
              height="4"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="4" stroke="#E5DCC4" strokeWidth="1" />
            </pattern>
          </defs>

          {/* Dormant plate */}
          {(() => {
            const x = padX + dormantStart * colW;
            const w = (today + 1 - dormantStart) * colW;
            return (
              <g>
                <rect
                  x={x}
                  y={topPad}
                  width={w}
                  height={baseline - topPad}
                  fill={`url(#dormant-${profile.seed})`}
                  opacity="0.9"
                />
                <rect
                  x={x}
                  y={topPad}
                  width={w}
                  height={baseline - topPad}
                  fill="#F7EFD9"
                  opacity="0.55"
                />
              </g>
            );
          })()}

          <line
            x1={padX}
            y1={baseline}
            x2={W - padX}
            y2={baseline}
            stroke="#E5E2D9"
            strokeWidth="1"
          />

          {profile.days.map((d, i) => {
            const bw = Math.min(10, Math.max(4, colW * 0.28));
            const x = padX + i * colW + (colW - bw) / 2;
            const h =
              d.sessions === 0
                ? 2
                : (d.sessions / maxSessions) * (baseline - topPad - 8);
            const y = baseline - h;
            const isDormant = i >= dormantStart;
            const fill =
              d.sessions === 0
                ? "#E5E2D9"
                : isDormant
                ? "#C9A96A"
                : "#4F7A5C";
            return (
              <rect key={i} x={x} y={y} width={bw} height={h} rx="3" fill={fill} />
            );
          })}

          {(() => {
            const x = padX + today * colW + colW * 0.5;
            return (
              <g>
                <line
                  x1={x}
                  y1={topPad - 4}
                  x2={x}
                  y2={baseline + 6}
                  stroke="#111714"
                  strokeWidth="1.2"
                  strokeDasharray="2 2"
                />
                <circle cx={x} cy={topPad - 4} r="3" fill="#111714" />
              </g>
            );
          })()}

          {profile.days.map((d, i) => {
            if (!d.label) return null;
            const x = padX + i * colW + colW * 0.5;
            return (
              <g key={`lbl-${i}`}>
                <line
                  x1={x}
                  y1={baseline}
                  x2={x}
                  y2={topPad - 2}
                  stroke="#9AA098"
                  strokeWidth="0.5"
                  strokeDasharray="1.5 2.5"
                />
                <rect
                  x={x - 8}
                  y={topPad - 48}
                  width="16"
                  height="42"
                  rx="2"
                  fill="#FAF9F4"
                  stroke="#E5E2D9"
                  strokeWidth="0.6"
                />
                <text
                  x={x}
                  y={topPad - 27}
                  textAnchor="middle"
                  className="fill-ink"
                  transform={`rotate(-90 ${x} ${topPad - 27})`}
                  style={{ fontFamily: "Geist Mono, monospace", fontSize: 9 }}
                >
                  {d.label}
                </text>
              </g>
            );
          })}

          {profile.days.map((d, i) => {
            const nearDormantStart = Math.abs(i - dormantStart) <= 1;
            if (
              i !== 0 &&
              i !== today &&
              i !== dormantStart &&
              !nearDormantStart &&
              i % 7 !== 0
            )
              return null;
            if (i !== dormantStart && nearDormantStart) return null;
            const x = padX + i * colW + colW * 0.5;
            const lbl =
              i === 0
                ? `t-${profile.onboardedDaysAgo}d`
                : i === today
                ? "now"
                : i === dormantStart
                ? "last seen"
                : `t-${today - i}d`;
            const colour =
              i === today ? "#111714" : i === dormantStart ? "#B07A2C" : "#9AA098";
            return (
              <text
                key={`tick-${i}`}
                x={x}
                y={baseline + 16}
                textAnchor="middle"
                style={{
                  fontFamily: "Geist Mono, monospace",
                  fontSize: 9,
                  fill: colour,
                }}
              >
                {lbl}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white px-8 py-16 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper2">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="3" fill="#9AA098" />
        </svg>
      </div>
      <h3 className="mt-3 text-[15px] font-semibold">No drafts in this filter</h3>
      <p className="mx-auto mt-1 max-w-sm text-[13px] text-mute">
        Trigger the agent to surface new churned users, or change the filter
        to see ones already sent.
      </p>
    </div>
  );
}

// ───────────────────────────── Engagement profile derivation
// New agent rows include structured activity telemetry inside event_timeline.
// Older rows fall back to deterministic synthesis from the user identity.

type EngagementDay = {
  sessions: number;
  label?: string;
  dormant?: boolean;
};

type EngagementProfile = {
  seed: number;
  onboardedDaysAgo: number;
  dormantDays: number;
  sessions: number;
  minutes: number;
  pageVisits: number;
  activeDates: number;
  days: EngagementDay[];
};

type EventPayload = {
  events?: string;
  engagement?: {
    onboardedDaysAgo?: number;
    dormantDays?: number;
    sessions?: number;
    minutes?: number;
    pageVisits?: number;
    activeDates?: number;
    days?: {
      day?: number;
      sessions?: number;
      label?: string;
    }[];
  };
};

function deriveEngagement(user: DetectedUser): EngagementProfile {
  const seed = hashString(`${user.id}:${user.email ?? ""}:${user.detected_at ?? ""}`);
  const payload = readEventPayload(user.event_timeline);
  const provided = payload?.engagement;
  if (provided) {
    const onboardedDaysAgo = clampNumber(provided.onboardedDaysAgo, 9, 28, 14);
    const dormantDays = clampNumber(
      provided.dormantDays,
      1,
      Math.max(1, onboardedDaysAgo - 1),
      9
    );
    const activeLimit = Math.max(1, onboardedDaysAgo - dormantDays);
    const days: EngagementDay[] = Array.from({ length: onboardedDaysAgo }, () => ({
      sessions: 0,
    }));

    const activeDots = (provided.days ?? [])
      .map((dot) => ({
        day: clampNumber(dot.day, 0, activeLimit - 1, 0),
        sessions: clampNumber(dot.sessions, 1, 5, 1),
        label: cleanTimelineLabel(dot.label),
      }))
      .filter((dot, index, arr) => arr.findIndex((x) => x.day === dot.day) === index)
      .sort((a, b) => a.day - b.day);

    const dots =
      activeDots.length > 0
        ? activeDots
        : [
            { day: 0, sessions: 1, label: "signup" },
            { day: Math.min(2, activeLimit - 1), sessions: 2, label: "upload" },
          ];

    for (const dot of dots) {
      days[dot.day].sessions = dot.sessions;
      days[dot.day].label = dot.label;
    }
    for (let i = onboardedDaysAgo - dormantDays; i < onboardedDaysAgo; i++) {
      if (i >= 0 && i < onboardedDaysAgo) days[i].dormant = true;
    }

    return {
      seed,
      onboardedDaysAgo,
      dormantDays,
      sessions: clampNumber(
        provided.sessions,
        1,
        20,
        dots.reduce((sum, dot) => sum + dot.sessions, 0)
      ),
      minutes: clampNumber(provided.minutes, 1, 240, 30),
      pageVisits: clampNumber(provided.pageVisits, 1, 80, 12),
      activeDates: clampNumber(provided.activeDates, 1, 10, dots.length),
      days,
    };
  }

  const dormantDays = 6 + (seed % 9);
  const activeDates = 2 + (seed % 4);
  const onboardedDaysAgo = dormantDays + activeDates + 3 + (seed % 8);
  const sessions = activeDates + 1 + (seed % 5);
  const pageVisits = activeDates + 4 + (seed % 12);
  const minutes = 16 + (seed % 78);

  const total = onboardedDaysAgo;
  const days: EngagementDay[] = Array.from({ length: total }, () => ({ sessions: 0 }));

  // Place activity in the active window (before dormant tail)
  const activeWindow = Math.max(1, total - dormantDays - 1);
  const eventLabels = ["signup", "upload", "editor", "stuck"];
  for (let i = 0; i < activeDates; i++) {
    const day = Math.min(
      activeWindow - 1,
      Math.floor((i / Math.max(1, activeDates - 1)) * activeWindow)
    );
    if (day < 0 || day >= total) continue;
    days[day].sessions = 1 + ((seed >> (i * 2)) & 0x3);
    days[day].label = eventLabels[Math.min(i, eventLabels.length - 1)];
  }

  // Mark dormant tail
  for (let i = total - dormantDays; i < total; i++) {
    if (i >= 0 && i < total) days[i].dormant = true;
  }

  return {
    seed,
    onboardedDaysAgo,
    dormantDays,
    sessions,
    minutes,
    pageVisits,
    activeDates,
    days,
  };
}

function eventTimelineText(value: string | null): string {
  const payload = readEventPayload(value);
  return payload?.events?.trim() || value || "";
}

function readEventPayload(value: string | null): EventPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as EventPayload;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    return null;
  }
  return null;
}

function clampNumber(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function cleanTimelineLabel(label: string | undefined): string {
  return (label ?? "visit").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "visit";
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// ───────────────────────────── Date utilities

function fmtClock(s?: string) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.valueOf())) return s;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function fmtElapsed(s?: string, now = Date.now()) {
  if (!s) return "0:00";
  const started = new Date(s).valueOf();
  if (Number.isNaN(started)) return "0:00";
  const totalSeconds = Math.max(0, Math.floor((now - started) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function tensorlakeRequestUrl(requestId: string) {
  return `https://cloud.tensorlake.ai/organizations/org_bcMW6MbrTm9hmnnzmQcKG/projects/project_zzkDgDhtgNBWpkNJNznmk/applications/churn_recovery_agent/requests/${encodeURIComponent(
    requestId
  )}`;
}

function relativeFromNow(s?: string | null) {
  if (!s) return "—";
  const t = new Date(s).valueOf();
  if (Number.isNaN(t)) return "—";
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}
