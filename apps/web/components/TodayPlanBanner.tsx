"use client";

/**
 * Pre-set "Today's plan" banner for `/lift/[lift]`.
 *
 * v2 — beyond the prescription number.
 *
 * The banner fetches two endpoints in parallel and folds them into a
 * single visual:
 *
 *   1. `GET /api/user/pre?lift=…` → a deterministic prescription the
 *      post-set agent wrote via `recommend_load` (weight × reps × sets).
 *      No LLM in the loop — the number is exact and cheap to compute.
 *
 *   2. `GET /api/user/trends?lift=…` → newest-first per-rule event
 *      counts per session. We pull the most recent session of this lift
 *      and surface its dominant failure pattern as a "today's focus"
 *      hint, paired with the same in-set voice cue the lifter will hear
 *      mid-rep. This is the part that makes the banner *feel* coached —
 *      it answers "why am I about to do this?" with one concrete cue.
 *
 * Render states (in priority order):
 *   - loading             — soft skeleton; never blocks the rest of the page.
 *   - has target + focus  — bold number + "Last session: KNEE_CAVE × 3"
 *                           + cue ("Drive your knees out").
 *   - has target, clean   — bold number + "Clean last time. Keep it tight."
 *   - has target, no data — bold number only (fresh user with a manually
 *                           entered prescription but no logged sessions).
 *   - no target           — gentle empty state for first-time users.
 *
 * Failures degrade gracefully: a 5xx on either endpoint just hides that
 * portion of the banner. We deliberately don't block the live capture
 * page on either request — the lift can still proceed without a banner.
 *
 * No LLM in the loop here on purpose. The narrative justification
 * (sources, biomechanics, etc.) lives on the source session's full
 * report; deep-link via "Why this target?".
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Loader2, ArrowRight, Megaphone, Target } from "lucide-react";
import type {
  Lift,
  TrendSession,
  TrendsResponse,
  UserPreSessionResponse,
} from "@vela/shared-types";

import { ApiError, getTrends, getUserPre, useApi } from "@/lib/api-client";
import { getDefaultCue } from "@/lib/voice/cues";

type BannerData = {
  pre: UserPreSessionResponse;
  /** Most recent session of this lift, or null if none. Used for the
   *  "today's focus" call-out. */
  lastSession: TrendSession | null;
};

type BannerState =
  | { kind: "loading" }
  | { kind: "ready"; data: BannerData }
  | { kind: "error"; message: string };

type Focus = {
  ruleId: string;
  count: number;
  cue: string | null;
  sourceSessionId: string;
};

export function TodayPlanBanner({ lift }: { lift: Lift }) {
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [state, setState] = useState<BannerState>({ kind: "loading" });

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    setState({ kind: "loading" });
    Promise.all([
      getUserPre(api, lift),
      // Trends is the secondary signal. Soft-fail it so a backend
      // hiccup on /api/user/trends doesn't poison the prescription
      // banner — the user still sees their target, just without the
      // focus block.
      getTrends(api, { lift, limit: 5 }).catch<TrendsResponse | null>(() => null),
    ])
      .then(([pre, trends]) => {
        if (cancelled) return;
        const lastSession = pickMostRecent(trends, lift);
        setState({ kind: "ready", data: { pre, lastSession } });
      })
      .catch((err) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : "Unknown error";
        setState({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [api, lift, isLoaded, isSignedIn]);

  return (
    <section
      aria-label="Today's plan"
      className="rounded-2xl border border-white/5 bg-zinc-900/60 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur"
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">
        <span>Today&apos;s plan</span>
        <span className="text-zinc-600">·</span>
        <span className="capitalize text-zinc-400">{lift}</span>
      </div>
      <Body lift={lift} state={state} />
    </section>
  );
}

function Body({ lift, state }: { lift: Lift; state: BannerState }) {
  if (state.kind === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Loader2 className="size-4 animate-spin" />
        <span>Reading your latest prescription…</span>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <p className="text-sm text-amber-400/90">
        Couldn&apos;t load today&apos;s target ({state.message}). You can still
        run the set — your coach will recover next session.
      </p>
    );
  }

  const { target } = state.data.pre;
  const lastSession = state.data.lastSession;
  const focus = lastSession ? deriveFocus(lastSession) : null;

  if (!target) {
    return (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-zinc-400">
          No prescription on file for {lift} yet. Finish a session and your
          coach will write one for next time — based on what they saw.
        </p>
        {focus && <FocusCard focus={focus} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-3xl font-semibold tracking-tight text-zinc-50">
            {fmtWeight(target.weight_lb)}{" "}
            <span className="text-zinc-500">lb</span>
            <span className="mx-3 text-zinc-700">×</span>
            {target.reps}{" "}
            <span className="text-zinc-500">reps</span>
            <span className="mx-3 text-zinc-700">×</span>
            {target.sets}{" "}
            <span className="text-zinc-500">sets</span>
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            Written by your coach after your last {lift} session.
          </p>
        </div>
        {target.source_session_id ? (
          <Link
            href={`/sessions/${target.source_session_id}`}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/30 hover:text-zinc-300"
          >
            Why this target?
            <ArrowRight className="size-3.5" />
          </Link>
        ) : null}
      </div>

      {focus ? (
        <FocusCard focus={focus} />
      ) : lastSession && eventTotal(lastSession) === 0 ? (
        <CleanCard />
      ) : null}
    </div>
  );
}

/**
 * Visual call-out: dominant rule from the previous session of this lift,
 * paired with the in-set cue the lifter is going to hear. The cue text is
 * the same string `voice/cues.ts` ships to the speech synthesizer, so the
 * banner's wording matches what they'll hear mid-rep — no surprise.
 */
function FocusCard({ focus }: { focus: Focus }) {
  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-amber-400/30 bg-amber-400/10 text-amber-200">
          <Target className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-300/80">
            Today&apos;s focus
          </p>
          <p className="mt-0.5 text-sm capitalize text-zinc-100">
            {humanRule(focus.ruleId)}
            <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              ×{focus.count} last session
            </span>
          </p>
          {focus.cue && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm italic text-zinc-300">
              <Megaphone className="size-3.5 text-amber-300/80" />
              &ldquo;{focus.cue}&rdquo;
            </p>
          )}
        </div>
        <Link
          href={`/sessions/${focus.sourceSessionId}`}
          aria-label="View last session"
          className="shrink-0 rounded-md border border-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-zinc-400 transition hover:border-amber-400/30 hover:text-amber-200"
        >
          last set
        </Link>
      </div>
    </div>
  );
}

function CleanCard() {
  return (
    <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-3">
      <div className="flex items-center gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-md border border-emerald-400/30 bg-emerald-400/10 text-emerald-200">
          <Target className="size-3.5" />
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-300/80">
            Today&apos;s focus
          </p>
          <p className="mt-0.5 text-sm text-zinc-100">
            Clean last time. Keep it tight.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// derivation
// ---------------------------------------------------------------------------

/**
 * Trends endpoint returns sessions newest-first, but we filter by lift
 * client-side here too as a belt-and-suspenders check — older API
 * versions (and the offline test fixtures) sometimes returned all lifts
 * regardless of the `lift` query param. Cheap, defensive, won't bite us
 * later.
 */
function pickMostRecent(
  trends: TrendsResponse | null,
  lift: Lift,
): TrendSession | null {
  if (!trends) return null;
  for (const s of trends.sessions) {
    if (s.lift === lift) return s;
  }
  return null;
}

function deriveFocus(session: TrendSession): Focus | null {
  const counts = Object.entries(session.event_counts);
  if (counts.length === 0) return null;
  let topRule = counts[0][0];
  let topCount = counts[0][1];
  for (const [rule, count] of counts) {
    if (count > topCount) {
      topRule = rule;
      topCount = count;
    }
  }
  if (topCount === 0) return null;
  return {
    ruleId: topRule,
    count: topCount,
    cue: getDefaultCue(topRule),
    sourceSessionId: session.session_id,
  };
}

function eventTotal(session: TrendSession): number {
  let total = 0;
  for (const n of Object.values(session.event_counts)) total += n;
  return total;
}

function humanRule(ruleId: string): string {
  return ruleId.replace(/_/g, " ").toLowerCase();
}

function fmtWeight(lb: number): string {
  // Display as integer when whole, one decimal otherwise. Avoids
  // "187.5000000001 lb" creeping in from float math upstream.
  return Number.isInteger(lb) ? String(lb) : lb.toFixed(1);
}
