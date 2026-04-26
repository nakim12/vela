"use client";

/**
 * `/sessions` — history view.
 *
 * The index has three jobs:
 *   1) tell the user "what's the shape of my training lately?" via a
 *      summary strip + line chart of risk events per session;
 *   2) make a single session selectable in one click — the rows are
 *      the primary navigation into the post-set report;
 *   3) gracefully handle the early-onboarding case where there is one
 *      session, or zero, without leaving a sad empty chart on the page.
 *
 * Data sources (both fetched in parallel on mount):
 *   - GET /api/user/trends      → per-rule event counts per session
 *   - GET /api/sessions          → lightweight session list rows
 *
 * They're joined by `session_id` so each list row can carry a colored
 * rule-chip breakdown without a third request. The chart and the list
 * intentionally share the same color palette (`RULE_TONES`) so a user
 * can scan from a chart line down to the row with matching tints.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowRight,
  Calendar,
  Loader2,
  Radio,
  TrendingUp,
} from "lucide-react";
import type {
  Lift,
  SessionListItem,
  SessionListResponse,
  TrendSession,
  TrendsResponse,
} from "@vela/shared-types";

import { useUser } from "@clerk/nextjs";

import { AppHeader } from "@/components/AppHeader";
import { ApiError, getTrends, listSessions, useApi } from "@/lib/api-client";

/**
 * Stable color tokens per rule_id. The keys here MUST match the
 * literal strings the rules engine emits in `RiskEvent.rule_id`
 * (see `apps/web/lib/rules/squat.ts` and `bench.ts`). Anything not
 * in this map falls through to a hashed palette in `colorFor` so a
 * future rule still draws cleanly without a code edit; we just lose
 * the stable visual identity.
 */
const RULE_TONES: Record<
  string,
  { stroke: string; chip: string; label: string }
> = {
  KNEE_CAVE: {
    stroke: "#f87171",
    chip: "border-red-400/40 bg-red-400/10 text-red-200",
    label: "Knee cave",
  },
  HEEL_LIFT: {
    stroke: "#fbbf24",
    chip: "border-amber-400/40 bg-amber-400/10 text-amber-100",
    label: "Heel lift",
  },
  DEPTH_ASYMMETRY: {
    stroke: "#a78bfa",
    chip: "border-violet-400/40 bg-violet-400/10 text-violet-200",
    label: "Depth asymmetry",
  },
  UNEVEN_PRESS: {
    stroke: "#34d399",
    chip: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
    label: "Uneven press",
  },
  BAR_PATH_DRIFT: {
    stroke: "#38bdf8",
    chip: "border-sky-400/40 bg-sky-400/10 text-sky-200",
    label: "Bar path drift",
  },
};

const FALLBACK_STROKES = [
  "#f4f4f5",
  "#d4d4d8",
  "#a1a1aa",
  "#71717a",
  "#e4e4e7",
];

function strokeFor(ruleId: string, idx: number): string {
  return RULE_TONES[ruleId]?.stroke ?? FALLBACK_STROKES[idx % FALLBACK_STROKES.length];
}

function ruleLabel(ruleId: string): string {
  return RULE_TONES[ruleId]?.label ?? ruleId.replace(/_/g, " ").toLowerCase();
}

export default function SessionsPage() {
  const api = useApi();
  const { user, isLoaded } = useUser();
  const displayName =
    user?.primaryEmailAddress?.emailAddress ?? user?.username ?? user?.id ?? "you";
  const [trends, setTrends] = useState<TrendsResponse | null>(null);
  const [list, setList] = useState<SessionListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getTrends(api), listSessions(api)])
      .then(([t, l]) => {
        if (cancelled) return;
        setTrends(t);
        setList(l);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : "Unknown error",
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded]);

  // Fold trends → a session_id-keyed map of `{ rule_id: count }`
  // so the list rows can render rule chips without re-fetching.
  const trendsBySession = useMemo(() => {
    const m = new Map<string, TrendSession>();
    if (!trends) return m;
    for (const s of trends.sessions) m.set(s.session_id, s);
    return m;
  }, [trends]);

  const summary = useMemo(() => buildSummary(list, trends), [list, trends]);

  const chartData = useMemo(() => {
    if (!trends) return { rows: [], rules: [] as string[] };
    // Trends are newest-first; reverse for chronological L->R.
    const ordered = [...trends.sessions].reverse();
    const ruleSet = new Set<string>();
    for (const s of ordered) {
      for (const k of Object.keys(s.event_counts)) ruleSet.add(k);
    }
    const rules = Array.from(ruleSet);
    const rows = ordered.map((s, i) => {
      const date = new Date(s.started_at);
      const label = date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      const row: Record<string, string | number> = {
        x: `${label} · #${i + 1}`,
      };
      for (const r of rules) {
        row[r] = s.event_counts[r] ?? 0;
      }
      return row;
    });
    return { rows, rules };
  }, [trends]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">
              History
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Sessions for{" "}
              <span className="text-zinc-100">{displayName}</span>
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Newest first. Click any row to see the agent&rsquo;s post-set
              report and the memories it logged.
            </p>
          </div>
          <Link
            href="/lift/squat"
            className="inline-flex items-center gap-1.5 rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
          >
            New live session
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {loading && (
          <div className="flex h-64 items-center justify-center text-zinc-500">
            <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
          </div>
        )}

        {error && !loading && (
          <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            <span className="font-mono text-[10px] uppercase tracking-wider text-red-300">
              error
            </span>{" "}
            {error}
          </div>
        )}

        {!loading && !error && summary && (
          <>
            <SummaryStrip summary={summary} />

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
              <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
                      Risk events over time
                    </h2>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      Per session, grouped by rule
                    </p>
                  </div>
                </div>
                {chartData.rows.length < 2 ? (
                  <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-sm text-zinc-500">
                    <TrendingUp className="size-5 text-zinc-700" />
                    <p>
                      {chartData.rows.length === 0
                        ? "No sessions yet."
                        : "One session in the bag — finish another to see trends."}
                    </p>
                  </div>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData.rows}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(255,255,255,0.06)"
                        />
                        <XAxis
                          dataKey="x"
                          stroke="#71717a"
                          fontSize={11}
                          tickLine={false}
                        />
                        <YAxis
                          stroke="#71717a"
                          fontSize={11}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "rgb(24,24,27)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }}
                          formatter={(value) =>
                            typeof value === "string" ? ruleLabel(value) : value
                          }
                        />
                        {chartData.rules.map((rule, i) => (
                          <Line
                            key={rule}
                            type="monotone"
                            dataKey={rule}
                            stroke={strokeFor(rule, i)}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
                      Recent sessions
                    </h2>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      {list && list.sessions.length > 0
                        ? `${list.sessions.length} session${list.sessions.length === 1 ? "" : "s"}`
                        : "No sessions yet"}
                    </p>
                  </div>
                </div>
                {!list || list.sessions.length === 0 ? (
                  <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">
                    Hit{" "}
                    <Link
                      href="/lift/squat"
                      className="text-zinc-200 underline-offset-2 hover:underline"
                    >
                      New live session
                    </Link>{" "}
                    to record your first one.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {list.sessions.map((s) => (
                      <SessionRow
                        key={s.session_id}
                        session={s}
                        trend={trendsBySession.get(s.session_id) ?? null}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary strip
// ---------------------------------------------------------------------------

type Summary = {
  totalSessions: number;
  totalEvents: number;
  topRule: { rule_id: string; count: number } | null;
  lastSessionAt: string | null;
  liftMix: Partial<Record<Lift, number>>;
};

function buildSummary(
  list: SessionListResponse | null,
  trends: TrendsResponse | null,
): Summary | null {
  if (!list) return null;
  const sessions = list.sessions;
  const totalSessions = sessions.length;

  const ruleTotals = new Map<string, number>();
  let totalEvents = 0;
  if (trends) {
    for (const s of trends.sessions) {
      for (const [rule, count] of Object.entries(s.event_counts)) {
        ruleTotals.set(rule, (ruleTotals.get(rule) ?? 0) + count);
        totalEvents += count;
      }
    }
  }
  let topRule: Summary["topRule"] = null;
  for (const [rule_id, count] of ruleTotals) {
    if (!topRule || count > topRule.count) topRule = { rule_id, count };
  }

  const liftMix: Partial<Record<Lift, number>> = {};
  for (const s of sessions) {
    liftMix[s.lift] = (liftMix[s.lift] ?? 0) + 1;
  }

  // `sessions` is newest-first per the API contract.
  const lastSessionAt = sessions[0]?.started_at ?? null;

  return { totalSessions, totalEvents, topRule, lastSessionAt, liftMix };
}

function SummaryStrip({ summary }: { summary: Summary }) {
  const liftLabel =
    Object.entries(summary.liftMix)
      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
      .map(([lift, n]) => `${n} ${lift}`)
      .join(" · ") || "—";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <SummaryCard
        icon={<Calendar className="size-3.5" />}
        label="Sessions"
        value={String(summary.totalSessions)}
        hint={liftLabel}
      />
      <SummaryCard
        icon={<Activity className="size-3.5" />}
        label="Events flagged"
        value={String(summary.totalEvents)}
        hint={
          summary.totalEvents === 0
            ? "all clean"
            : `across ${summary.totalSessions} session${summary.totalSessions === 1 ? "" : "s"}`
        }
      />
      <TopRuleCard topRule={summary.topRule} />
      <SummaryCard
        icon={<Calendar className="size-3.5" />}
        label="Last session"
        value={
          summary.lastSessionAt
            ? formatRelative(new Date(summary.lastSessionAt))
            : "—"
        }
        hint={
          summary.lastSessionAt
            ? new Date(summary.lastSessionAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : "no recent activity"
        }
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
      <p className="mt-0.5 truncate text-[11px] text-zinc-600">{hint}</p>
    </div>
  );
}

function TopRuleCard({ topRule }: { topRule: Summary["topRule"] }) {
  if (!topRule) {
    return (
      <SummaryCard
        icon={<TrendingUp className="size-3.5" />}
        label="Most common"
        value="—"
        hint="no rules tripped"
      />
    );
  }
  const tone = RULE_TONES[topRule.rule_id];
  const stroke = tone?.stroke ?? "#f4f4f5";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: stroke }}
        />
        Most common
      </div>
      <p
        className="mt-2 text-2xl font-semibold capitalize tracking-tight"
        style={{ color: stroke }}
      >
        {ruleLabel(topRule.rule_id)}
      </p>
      <p className="mt-0.5 text-[11px] text-zinc-600">
        {topRule.count} event{topRule.count === 1 ? "" : "s"} total
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session row
// ---------------------------------------------------------------------------

function SessionRow({
  session,
  trend,
}: {
  session: SessionListItem;
  trend: TrendSession | null;
}) {
  const inProgress = session.ended_at === null;
  const duration = inProgress
    ? null
    : formatDuration(session.started_at, session.ended_at);
  const ruleChips = trend
    ? Object.entries(trend.event_counts)
        .filter(([, n]) => n > 0)
        .sort(([, a], [, b]) => b - a)
    : [];

  return (
    <li>
      <Link
        href={`/sessions/${session.session_id}`}
        className="group flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-zinc-900/40 px-4 py-3 transition hover:border-white/25 hover:bg-white/[0.06]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium capitalize text-zinc-100">
              {session.lift}
            </span>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-400">
              {formatRelative(new Date(session.started_at))}
            </span>
            {inProgress ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-emerald-200">
                <Radio className="size-2.5 animate-pulse" />
                live
              </span>
            ) : duration ? (
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                {duration}
              </span>
            ) : null}
          </div>
          {ruleChips.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {ruleChips.map(([rule, n]) => {
                const tone =
                  RULE_TONES[rule]?.chip ??
                  "border-white/10 bg-white/5 text-zinc-300";
                return (
                  <span
                    key={rule}
                    className={
                      "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium capitalize tracking-wide " +
                      tone
                    }
                  >
                    {ruleLabel(rule)}
                    <span className="font-mono text-[10px] opacity-70">
                      ×{n}
                    </span>
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
              {session.event_count === 0
                ? "clean session"
                : `${session.event_count} events`}
            </div>
          )}
        </div>
        <ArrowRight className="size-4 shrink-0 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-zinc-200" />
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Time formatters
// ---------------------------------------------------------------------------

function formatRelative(when: Date): string {
  const now = Date.now();
  const t = when.getTime();
  if (!Number.isFinite(t)) return "—";
  const diffSec = Math.round((now - t) / 1000);
  if (diffSec < 30) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  // Older than a week → fall back to a calendar date.
  return when.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDuration(
  startedAt: string,
  endedAt: string | null,
): string | null {
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
