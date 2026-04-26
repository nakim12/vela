"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  Clock,
  Loader2,
  RefreshCw,
  Repeat,
  Sparkles,
  Timer,
  Trash2,
} from "lucide-react";
import type {
  MemoryUpdate,
  PostSetSummaryResponse,
  RiskEvent,
  RiskSeverity,
  SessionReport,
} from "@vela/shared-types";

import { AppHeader } from "@/components/AppHeader";
import { RiskBadge } from "@/components/RiskBadge";
import {
  ApiError,
  deleteMemoryUpdate,
  getMemoryUpdates,
  getSessionReport,
  postSummary,
  useApi,
} from "@/lib/api-client";

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = use(params);
  const api = useApi();
  const [report, setReport] = useState<SessionReport | null>(null);
  const [summary, setSummary] = useState<PostSetSummaryResponse | null>(null);
  const [memories, setMemories] = useState<MemoryUpdate[] | null>(null);

  const [loadingReport, setLoadingReport] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingMemories, setLoadingMemories] = useState(false);

  const [reportError, setReportError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  const refreshMemories = useCallback(async () => {
    setLoadingMemories(true);
    setMemoryError(null);
    try {
      const r = await getMemoryUpdates(api, sessionId);
      setMemories(r.memory_updates);
    } catch (err) {
      setMemoryError(toMessage(err));
    } finally {
      setLoadingMemories(false);
    }
  }, [api, sessionId]);

  const generateSummary = useCallback(
    async (force: boolean) => {
      setLoadingSummary(true);
      setSummaryError(null);
      try {
        const r = await postSummary(api, sessionId, { force });
        setSummary(r);
        // The agent likely just wrote new memories — refresh the panel.
        await refreshMemories();
      } catch (err) {
        setSummaryError(toMessage(err));
      } finally {
        setLoadingSummary(false);
      }
    },
    [api, sessionId, refreshMemories],
  );

  // Initial load: report + memories in parallel. Summary fires only on
  // user click (or auto-fires below if the session has events but no
  // cached summary yet).
  useEffect(() => {
    let cancelled = false;
    setLoadingReport(true);
    setReportError(null);
    getSessionReport(api, sessionId)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((err) => {
        if (!cancelled) setReportError(toMessage(err));
      })
      .finally(() => !cancelled && setLoadingReport(false));
    refreshMemories();
    return () => {
      cancelled = true;
    };
  }, [api, sessionId, refreshMemories]);

  // If the session already has a cached `summary_md`, surface it without
  // making the user click "Generate". Cheap because no agent runs.
  useEffect(() => {
    if (!report || summary) return;
    if (report.session.summary_md) {
      setSummary({
        session_id: sessionId,
        summary_md: report.session.summary_md,
        event_count: report.event_count,
        generated: false,
      });
    }
  }, [report, summary, sessionId]);

  async function handleDeleteMemory(memoryId: string) {
    if (!confirm("Delete this memory permanently?")) return;
    const prev = memories ?? [];
    setMemories(prev.filter((m) => m.id !== memoryId));
    try {
      await deleteMemoryUpdate(api, sessionId, memoryId);
    } catch (err) {
      // Roll back on failure.
      setMemories(prev);
      alert(`Delete failed: ${toMessage(err)}`);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link
          href="/sessions"
          className="mb-6 inline-flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-200"
        >
          <ArrowLeft className="size-3.5" />
          back to sessions
        </Link>

        {loadingReport && (
          <div className="flex h-64 items-center justify-center text-zinc-500">
            <Loader2 className="mr-2 size-4 animate-spin" /> Loading report…
          </div>
        )}

        {reportError && (
          <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            <span className="font-mono text-[10px] uppercase tracking-wider text-red-300">
              report error
            </span>{" "}
            {reportError}
          </div>
        )}

        {report && (
          <>
            <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">
                  Session report
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight capitalize">
                  {report.session.lift}{" "}
                  <span className="text-zinc-500">·</span>{" "}
                  <span className="text-zinc-300">
                    {report.event_count} risk events
                  </span>
                </h1>
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-zinc-500">
                  <Clock className="size-3" />
                  {new Date(report.session.started_at).toLocaleString()}
                  {report.session.ended_at && (
                    <>
                      <span className="text-zinc-700">→</span>
                      {new Date(report.session.ended_at).toLocaleString()}
                    </>
                  )}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                  id {report.session.session_id}
                </p>
              </div>
            </header>

            <SummaryStrip report={report} />

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
              {/* LEFT: timeline */}
              <Panel
                title="Risk timeline"
                subtitle={
                  report.events.length === 0
                    ? "Nothing flagged this session"
                    : `${report.events.length} event${report.events.length === 1 ? "" : "s"}, grouped by rule`
                }
              >
                {report.events.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    Clean session. No rules tripped.
                  </p>
                ) : (
                  <RuleGroups events={report.events} />
                )}
              </Panel>

              {/* RIGHT: agent report + memory updates */}
              <div className="space-y-6">
                <Panel
                  title="Coach's report"
                  subtitle={
                    summary
                      ? summary.generated
                        ? "Just generated"
                        : "From cache"
                      : "Run the agent to generate"
                  }
                  action={
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={loadingSummary || report.event_count === 0}
                        onClick={() => generateSummary(false)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-medium text-zinc-100 transition hover:bg-white/15 disabled:opacity-40"
                      >
                        <Sparkles className="size-3" />
                        {summary ? "Regenerate" : "Generate"}
                      </button>
                      {summary && (
                        <button
                          type="button"
                          disabled={loadingSummary}
                          onClick={() => generateSummary(true)}
                          aria-label="Force regenerate (bypass cache)"
                          className="inline-flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 disabled:opacity-40"
                          title="Bypass cache and re-run the agent from scratch"
                        >
                          <RefreshCw className="size-3" />
                        </button>
                      )}
                    </div>
                  }
                >
                  {loadingSummary && (
                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                      <Loader2 className="size-3.5 animate-spin text-zinc-300" />
                      Agent is reasoning… (~25s on first run)
                    </div>
                  )}
                  {summaryError && (
                    <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
                      {summaryError}
                    </div>
                  )}
                  {!loadingSummary && !summary && !summaryError && (
                    <p className="text-sm text-zinc-500">
                      {report.event_count === 0
                        ? "No risk events to summarize."
                        : "Click Generate to run the agent loop. It'll pull memories, search the corpus, and write a personalized markdown report."}
                    </p>
                  )}
                  {summary && !loadingSummary && (
                    <div className="prose prose-invert prose-sm max-w-none prose-headings:text-zinc-100 prose-strong:text-zinc-100 prose-code:text-zinc-200 prose-a:text-zinc-300 prose-li:my-1">
                      <ReactMarkdown>{summary.summary_md}</ReactMarkdown>
                    </div>
                  )}
                </Panel>

                <Panel
                  title="What the agent learned"
                  subtitle={memorySubtitle(memories, loadingMemories)}
                  action={
                    <button
                      type="button"
                      onClick={refreshMemories}
                      disabled={loadingMemories}
                      aria-label="Refresh agent memories"
                      className="inline-flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 disabled:opacity-40"
                      title="Refresh"
                    >
                      <RefreshCw
                        className={
                          "size-3 " + (loadingMemories ? "animate-spin" : "")
                        }
                      />
                    </button>
                  }
                >
                  {memoryError && (
                    <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
                      {memoryError}
                    </div>
                  )}
                  {memories === null && !memoryError && (
                    <MemorySkeleton />
                  )}
                  {memories && memories.length === 0 && !memoryError && (
                    <p className="text-sm text-zinc-500">
                      Nothing here yet. Generate the report above and the
                      agent&rsquo;s observations from this session will
                      appear here.
                    </p>
                  )}
                  {memories && memories.length > 0 && (
                    <ul className="space-y-2">
                      {memories.map((m) => (
                        <li
                          key={m.id}
                          className="group flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-zinc-900/40 p-3 transition hover:border-white/10 hover:bg-zinc-900/60"
                        >
                          <div className="min-w-0 flex-1">
                            {m.category && (
                              <CategoryChip category={m.category} />
                            )}
                            <p className="mt-1.5 text-sm leading-relaxed text-zinc-200">
                              {m.content}
                            </p>
                            <p className="mt-1.5 font-mono text-[10px] text-zinc-600">
                              {new Date(m.created_at).toLocaleString()}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteMemory(m.id)}
                            aria-label="Delete memory"
                            className="shrink-0 text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:text-red-300"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/5 bg-zinc-950/60 px-2 py-1.5">
      <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-[11px] text-zinc-200">{value}</p>
    </div>
  );
}

/**
 * `SummaryStrip` — quick-glance numbers that frame the rest of the page.
 *
 * The session report API already returns everything we need:
 *   - `events[]` carries `rep_index` and `severity`, so we can derive
 *     "reps observed" and a per-severity breakdown without a new endpoint.
 *   - `started_at` / `ended_at` give a duration once the session is closed.
 *
 * Reps observed = `max(rep_index) + 1` from the event list. This will
 * undercount on a clean session (zero events ⇒ "—") and we display it
 * that way honestly rather than guessing. The full `report.sets` array
 * is reserved for a future "sets table" panel; we deliberately skip it
 * here to keep this strip readable at a glance.
 */
function SummaryStrip({ report }: { report: SessionReport }) {
  const counts = countBySeverity(report.events);
  const repsObserved = repsFromEvents(report.events);
  const duration = formatDuration(
    report.session.started_at,
    report.session.ended_at,
  );
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <SummaryCard
        icon={<Repeat className="size-3.5" />}
        label="Reps observed"
        value={repsObserved === null ? "—" : String(repsObserved)}
        hint={repsObserved === null ? "no events flagged" : "from event log"}
      />
      <SummaryCard
        icon={<Timer className="size-3.5" />}
        label="Duration"
        value={duration ?? "—"}
        hint={duration ? "start → end" : "session not closed"}
      />
      <SeverityCard
        severity="warn"
        count={counts.warn}
        label="Warnings"
      />
      <SeverityCard
        severity="high"
        count={counts.high}
        label="High severity"
      />
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-zinc-600">{hint}</p>
    </div>
  );
}

function SeverityCard({
  severity,
  count,
  label,
}: {
  severity: "warn" | "high";
  count: number;
  label: string;
}) {
  const tone =
    severity === "high"
      ? {
          ring: count > 0 ? "border-red-400/40 bg-red-400/[0.06]" : "border-white/10 bg-white/[0.02]",
          text: count > 0 ? "text-red-200" : "text-zinc-100",
          dot: count > 0 ? "bg-red-400" : "bg-zinc-600",
          hint: count > 0 ? "needs attention" : "none flagged",
        }
      : {
          ring: count > 0 ? "border-amber-400/40 bg-amber-400/[0.06]" : "border-white/10 bg-white/[0.02]",
          text: count > 0 ? "text-amber-100" : "text-zinc-100",
          dot: count > 0 ? "bg-amber-400" : "bg-zinc-600",
          hint: count > 0 ? "fix on next set" : "none flagged",
        };
  return (
    <div className={"rounded-xl border p-4 " + tone.ring}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        <span className={"size-1.5 rounded-full " + tone.dot} />
        {label}
      </div>
      <p className={"mt-2 text-2xl font-semibold tracking-tight " + tone.text}>
        {count}
      </p>
      <p className="mt-0.5 text-[11px] text-zinc-600">{tone.hint}</p>
    </div>
  );
}

/**
 * `RuleGroups` — collapses the flat event log into one card per
 * `rule_id`, with the worst severity bubbled to the top and per-rep
 * detail rows hung underneath.
 *
 * Why grouped: a session with 12 `KNEE_CAVE` events across 4 reps
 * reads as 12 nearly-identical rows in a flat list, which buries the
 * signal. Grouping by rule answers the question the user actually
 * asks first ("what rules tripped, how badly?") and keeps the
 * per-event data one expand away.
 *
 * Sort: rules with `high` severity first, then `warn`, then `info`,
 * tiebreak by event count (most → least). Within a rule, events stay
 * in DB-insertion order (oldest → newest) which matches the live
 * session experience.
 */
function RuleGroups({ events }: { events: RiskEvent[] }) {
  const groups = groupByRule(events);
  return (
    <ol className="space-y-3">
      {groups.map((group) => (
        <li
          key={group.ruleId}
          className="overflow-hidden rounded-lg border border-white/5 bg-zinc-900/40"
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/5 bg-white/[0.02] px-3 py-2">
            <RiskBadge event={group.worst} />
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              {group.events.length} event
              {group.events.length === 1 ? "" : "s"} · {group.repSummary}
            </span>
          </div>
          <ul className="divide-y divide-white/[0.04]">
            {group.events.map((evt, i) => (
              <li
                key={`${evt.rule_id}-${evt.rep_index}-${evt.frame_range[0]}-${i}`}
                className="px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                  <span className="font-mono uppercase tracking-widest">
                    rep {evt.rep_index}
                    {evt.side ? ` · ${evt.side}` : ""}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                    {evt.severity}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-zinc-400">
                  <Stat label="measured" value={fmt(evt.measured)} />
                  <Stat label="threshold" value={fmt(evt.threshold)} />
                  <Stat
                    label="confidence"
                    value={`${(evt.confidence * 100).toFixed(0)}%`}
                  />
                </div>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function MemorySkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="rounded-lg border border-white/5 bg-zinc-900/40 p-3"
        >
          <div className="h-3 w-16 animate-pulse rounded bg-white/5" />
          <div className="mt-2 h-3 w-full animate-pulse rounded bg-white/5" />
          <div className="mt-1.5 h-3 w-3/4 animate-pulse rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}

/**
 * Tiny color-keyed chip for the agent's `category` tag. Categories
 * are free-form strings the LLM picks (e.g. `session_telemetry`,
 * `cue`, `threshold_change`), so we hash to a small palette rather
 * than maintain an enum that can drift.
 */
function CategoryChip({ category }: { category: string }) {
  const tone = CATEGORY_TONES[hashCategory(category) % CATEGORY_TONES.length];
  return (
    <span
      className={
        "inline-block rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest " +
        tone
      }
    >
      {category.replace(/_/g, " ")}
    </span>
  );
}

const CATEGORY_TONES = [
  "border-sky-400/30 bg-sky-400/10 text-sky-200",
  "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  "border-violet-400/30 bg-violet-400/10 text-violet-200",
  "border-amber-400/30 bg-amber-400/10 text-amber-200",
  "border-rose-400/30 bg-rose-400/10 text-rose-200",
];

function hashCategory(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function memorySubtitle(
  memories: MemoryUpdate[] | null,
  loading: boolean,
): string {
  if (memories === null) return loading ? "Loading…" : "";
  const n = memories.length;
  if (n === 0) return "Nothing logged yet";
  return `${n} memor${n === 1 ? "y" : "ies"} written this session`;
}

type RuleGroup = {
  ruleId: string;
  worst: RiskEvent;
  events: RiskEvent[];
  repSummary: string;
};

const SEV_RANK: Record<RiskSeverity, number> = { info: 0, warn: 1, high: 2 };

function groupByRule(events: RiskEvent[]): RuleGroup[] {
  const map = new Map<string, RiskEvent[]>();
  for (const e of events) {
    const arr = map.get(e.rule_id) ?? [];
    arr.push(e);
    map.set(e.rule_id, arr);
  }
  const groups: RuleGroup[] = [];
  for (const [ruleId, list] of map) {
    let worst = list[0];
    for (const e of list) {
      if (SEV_RANK[e.severity] > SEV_RANK[worst.severity]) worst = e;
    }
    const reps = Array.from(new Set(list.map((e) => e.rep_index))).sort(
      (a, b) => a - b,
    );
    const repSummary =
      reps.length === 1
        ? `rep ${reps[0]}`
        : reps.length <= 4
          ? `reps ${reps.join(", ")}`
          : `${reps.length} reps`;
    groups.push({ ruleId, worst, events: list, repSummary });
  }
  groups.sort((a, b) => {
    const sevDiff = SEV_RANK[b.worst.severity] - SEV_RANK[a.worst.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.events.length - a.events.length;
  });
  return groups;
}

function countBySeverity(events: RiskEvent[]): Record<RiskSeverity, number> {
  const c: Record<RiskSeverity, number> = { info: 0, warn: 0, high: 0 };
  for (const e of events) c[e.severity]++;
  return c;
}

function repsFromEvents(events: RiskEvent[]): number | null {
  if (events.length === 0) return null;
  let max = 0;
  for (const e of events) if (e.rep_index > max) max = e.rep_index;
  return max + 1;
}

function formatDuration(startedAt: string, endedAt: string | null): string | null {
  if (!endedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }
  const sec = Math.round((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function toMessage(err: unknown): string {
  if (err instanceof ApiError) return err.detail;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
