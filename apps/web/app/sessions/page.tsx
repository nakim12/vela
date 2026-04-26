"use client";

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
import { ArrowRight, Loader2 } from "lucide-react";
import type {
  SessionListResponse,
  TrendsResponse,
} from "@vela/shared-types";

import { AppHeader } from "@/components/AppHeader";
import { ApiError, getTrends, listSessions } from "@/lib/api-client";
import { useUserStore } from "@/lib/store/user";

const RULE_COLORS: Record<string, string> = {
  KNEE_CAVE: "#38bdf8",
  FORWARD_DUMP: "#f97316",
  BUTT_WINK: "#a78bfa",
  HEEL_LIFT: "#34d399",
  DEPTH_ASYMMETRY: "#facc15",
  ROUND_BACK: "#f472b6",
  HIPS_RISE_FIRST: "#fb7185",
  BAR_DRIFT: "#60a5fa",
};

function colorFor(ruleId: string, idx: number): string {
  if (RULE_COLORS[ruleId]) return RULE_COLORS[ruleId];
  // Deterministic fallback for unknown rule_ids.
  const palette = ["#38bdf8", "#a78bfa", "#34d399", "#facc15", "#f472b6"];
  return palette[idx % palette.length];
}

export default function SessionsPage() {
  const userId = useUserStore((s) => s.userId);
  const [trends, setTrends] = useState<TrendsResponse | null>(null);
  const [list, setList] = useState<SessionListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getTrends(userId), listSessions(userId)])
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
  }, [userId]);

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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400/90">
              History
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Sessions for{" "}
              <span className="text-sky-300">{userId}</span>
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Newest first. Click any row to see the agent&rsquo;s post-set
              report and the memories it logged.
            </p>
          </div>
          <Link
            href="/lift/squat"
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-400 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-sky-300"
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

        {!loading && !error && (
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-100">
                  Risk events over time
                </h2>
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  per session · grouped by rule
                </span>
              </div>
              {chartData.rows.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
                  No sessions yet for this user.
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
                      />
                      {chartData.rules.map((rule, i) => (
                        <Line
                          key={rule}
                          type="monotone"
                          dataKey={rule}
                          stroke={colorFor(rule, i)}
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
              <h2 className="mb-4 text-sm font-semibold text-zinc-100">
                Recent sessions
              </h2>
              {!list || list.sessions.length === 0 ? (
                <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">
                  No sessions yet. Run the seed scripts or start a live
                  capture.
                </div>
              ) : (
                <ul className="space-y-2">
                  {list.sessions.map((s) => (
                    <li key={s.session_id}>
                      <Link
                        href={`/sessions/${s.session_id}`}
                        className="group flex items-center justify-between rounded-lg border border-white/5 bg-zinc-900/40 px-4 py-3 transition hover:border-sky-400/30 hover:bg-sky-400/[0.04]"
                      >
                        <div>
                          <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                            <span className="capitalize">{s.lift}</span>
                            <span className="text-zinc-600">·</span>
                            <span className="text-zinc-400">
                              {new Date(s.started_at).toLocaleString()}
                            </span>
                          </div>
                          <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                            id {s.session_id.slice(0, 12)}…{" "}
                            {s.event_count > 0 && (
                              <span className="ml-2 rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-amber-200">
                                {s.event_count} events
                              </span>
                            )}
                          </div>
                        </div>
                        <ArrowRight className="size-4 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-sky-300" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
