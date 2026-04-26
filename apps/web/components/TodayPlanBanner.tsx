"use client";

/**
 * Pre-set "Today's plan" banner for `/lift/[lift]`.
 *
 * Reads the deterministic prescription the post-set agent wrote via
 * `recommend_load` at the end of the user's previous session of this lift.
 * Renders one of three states:
 *
 *   1. Loading      — soft skeleton; never blocks the rest of the page.
 *   2. Has target   — bold "Today's squat: 185 lb × 5 × 3" plus a
 *                     deep-link to the source session ("why this?").
 *   3. No target    — gentle empty state for fresh users.
 *
 * Failures are rendered inline (not toasted) so a backend hiccup doesn't
 * break the page; the lift can still proceed without a banner.
 *
 * No LLM in the loop here — the narrative reasoning lives on the source
 * session's report. We deliberately skip the agent's 2-line watch list
 * (injuries / mobility) on this banner because calling `pre_session_loop`
 * on every page load is wasteful and the visceral payoff is the number,
 * not the prose.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Loader2, ArrowRight } from "lucide-react";
import type { Lift, UserPreSessionResponse } from "@vela/shared-types";

import { ApiError, getUserPre, useApi } from "@/lib/api-client";

type BannerState =
  | { kind: "loading" }
  | { kind: "ready"; data: UserPreSessionResponse }
  | { kind: "error"; message: string };

export function TodayPlanBanner({ lift }: { lift: Lift }) {
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [state, setState] = useState<BannerState>({ kind: "loading" });

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    setState({ kind: "loading" });
    getUserPre(api, lift)
      .then((data) => {
        if (!cancelled) setState({ kind: "ready", data });
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
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-400/90">
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

  const { target } = state.data;
  if (!target) {
    return (
      <p className="text-sm leading-relaxed text-zinc-400">
        No prescription on file for {lift} yet. Finish a session and your
        coach will write one for next time — based on what they saw.
      </p>
    );
  }

  return (
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
          className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-sky-400/40 hover:text-sky-300"
        >
          Why this target?
          <ArrowRight className="size-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function fmtWeight(lb: number): string {
  // Display as integer when whole, one decimal otherwise. Avoids
  // "187.5000000001 lb" creeping in from float math upstream.
  return Number.isInteger(lb) ? String(lb) : lb.toFixed(1);
}
