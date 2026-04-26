"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  Clock,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import type {
  MemoryUpdate,
  PostSetSummaryResponse,
  RiskEvent,
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

            <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
              {/* LEFT: timeline */}
              <Panel title="Risk timeline" subtitle="Newest at the bottom">
                {report.events.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    No risk events flagged for this session.
                  </p>
                ) : (
                  <ol className="space-y-3">
                    {report.events.map((evt: RiskEvent, i: number) => (
                      <li
                        key={`${evt.rule_id}-${i}`}
                        className="rounded-lg border border-white/5 bg-zinc-900/40 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <RiskBadge event={evt} />
                          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                            rep {evt.rep_index}
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
                  </ol>
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
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={loadingSummary || report.event_count === 0}
                        onClick={() => generateSummary(false)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-medium text-zinc-100 hover:bg-white/15 disabled:opacity-40"
                      >
                        <Sparkles className="size-3" />
                        {summary ? "Regenerate (cached)" : "Generate"}
                      </button>
                      {summary && (
                        <button
                          type="button"
                          disabled={loadingSummary}
                          onClick={() => generateSummary(true)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-white/10 disabled:opacity-40"
                          title="Bypass cache, re-run the agent"
                        >
                          <RefreshCw className="size-3" />
                          Force
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
                  subtitle={
                    memories
                      ? `${memories.length} memor${memories.length === 1 ? "y" : "ies"} written this session`
                      : ""
                  }
                  action={
                    <button
                      type="button"
                      onClick={refreshMemories}
                      disabled={loadingMemories}
                      className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-white/10 disabled:opacity-40"
                    >
                      <RefreshCw
                        className={
                          "size-3 " + (loadingMemories ? "animate-spin" : "")
                        }
                      />
                      Refresh
                    </button>
                  }
                >
                  {memoryError && (
                    <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
                      {memoryError}
                    </div>
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
                          className="group flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-zinc-900/40 p-3"
                        >
                          <div className="min-w-0 flex-1">
                            {m.category && (
                              <span className="inline-block rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-200">
                                {m.category}
                              </span>
                            )}
                            <p className="mt-1.5 text-sm leading-relaxed text-zinc-200">
                              {m.content}
                            </p>
                            <p className="mt-1 font-mono text-[10px] text-zinc-600">
                              {new Date(m.created_at).toLocaleString()}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteMemory(m.id)}
                            aria-label="Delete memory"
                            className="opacity-50 transition hover:text-red-300 hover:opacity-100"
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
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
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

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function toMessage(err: unknown): string {
  if (err instanceof ApiError) return err.detail;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
