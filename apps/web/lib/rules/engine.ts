/**
 * Rules engine — the in-browser side of §3.3 of the project plan.
 *
 * Responsibilities:
 *  - Drive the rep counter and ask each {@link Rule} to evaluate the
 *    current pose frame.
 *  - Deduplicate candidate events per (rule_id, rep_index, side). One
 *    bad rep should produce one row in the live event log, even if
 *    the rule fired on 30 frames in a row, the user keeps caving the
 *    same knee for two seconds, or our flush timer happened to tick
 *    in the middle.
 *  - Buffer accepted events until {@link flush} is called by the
 *    capture component (typically every few seconds and once at
 *    end-of-set).
 *
 * Two state maps are intentional:
 *
 *   - `worstSeen` is per-session and never cleared until the engine
 *     itself is dropped. It stores the worst measurement we've ever
 *     observed for each (rule, rep, side) and powers the
 *     "first-time-ever" decision that drives `isNew` on EngineEvent.
 *   - `buffer` is the next-flush queue. Cleared on `flush()`. Holds
 *     just the entries whose worst-measurement got updated since the
 *     last flush — that way the backend gets the latest worst (not
 *     stale data) without re-receiving an entry whose value didn't
 *     change.
 *
 * Earlier the engine collapsed these into a single map cleared on
 * flush, which produced duplicate eventLog rows whenever a single
 * rep took longer than the 3 s flush interval (every flush wiped the
 * dedup state and the next fire on the same key was treated as new).
 *
 * The engine deliberately does NOT POST anything itself — that's the
 * capture component's job, so the engine stays trivial to unit-test
 * and we don't pollute it with auth concerns.
 */

import type { Lift, RiskEvent } from "@vela/shared-types";

import type { PoseFrame } from "@/lib/pose/detector";

import { BENCH_RULES } from "./bench";
import { createRepCounterForLift, type RepCounter, type RepCounterState } from "./repCounter";
import { SQUAT_RULES, type Rule } from "./squat";

export type EngineEvent = {
  /** The newly-buffered (or updated) candidate. */
  event: RiskEvent;
  /** True when this is the first time we've seen this (rule, rep, side);
   *  false when we updated an existing candidate in place because the
   *  measurement got worse. UI can use this to avoid duplicate log rows. */
  isNew: boolean;
};

export interface RulesEngine {
  /** Feed one pose frame in. Returns the rep state so callers can render
   *  rep count / phase indicators without having to track it themselves. */
  ingest(frame: PoseFrame): RepCounterState;
  /** Drain the buffered candidate events. Each call returns an array
   *  ordered by first-seen frame index. */
  flush(): RiskEvent[];
  /** Read-only view of the buffer (for live UI). */
  pending(): RiskEvent[];
  /** Final state after the user hits "End Set". */
  state(): RepCounterState;
}

export type EngineConfig = {
  lift: Lift;
  thresholds: Record<string, number>;
  /** Fired when a new candidate is buffered or an existing one is
   *  updated. Use this to drive a live event log in the UI. */
  onEvent?: (e: EngineEvent) => void;
};

export function createEngine(config: EngineConfig): RulesEngine {
  return buildEngine(
    rulesForLift(config.lift),
    createRepCounterForLift(config.lift),
    config,
  );
}

/** Resolve the active rule set for a given lift. Deadlift returns []
 *  so the rep counter still runs (the UI demos cleanly even without
 *  rule coverage). New lifts plug their rule arrays in here. */
function rulesForLift(lift: Lift): Rule[] {
  switch (lift) {
    case "squat":
      return SQUAT_RULES;
    case "bench":
      return BENCH_RULES;
    case "deadlift":
      return [];
  }
}

function buildEngine(
  rules: Rule[],
  repCounter: RepCounter,
  config: EngineConfig,
): RulesEngine {
  /** Worst measurement per (rule, rep, side) seen this session. Never
   *  cleared. Source of truth for `isNew` and for "what should the
   *  event log show right now". */
  const worstSeen = new Map<string, RiskEvent>();
  /** Subset of `worstSeen` that has been updated since the last
   *  flush. Sent to the backend on flush, then cleared. */
  const buffer = new Map<string, RiskEvent>();

  function ingest(frame: PoseFrame): RepCounterState {
    const repState = repCounter.ingest(frame);
    for (const rule of rules) {
      const candidate = rule.evaluate(frame, {
        ...repState,
        thresholds: config.thresholds,
      });
      if (!candidate) continue;
      const key = `${candidate.rule_id}:${candidate.rep_index}:${candidate.side ?? ""}`;
      const prev = worstSeen.get(key);
      if (prev && candidate.measured <= prev.measured) {
        // Not a new worst for this (rule, rep, side). Skip silently —
        // do NOT call onEvent, do NOT touch the buffer. This is the
        // critical path for every frame, so it has to be cheap.
        continue;
      }
      const updated = prev
        ? {
            ...candidate,
            frame_range: [prev.frame_range[0], frame.index] as [
              number,
              number,
            ],
          }
        : candidate;
      worstSeen.set(key, updated);
      buffer.set(key, updated);
      config.onEvent?.({ event: updated, isNew: !prev });
    }
    return repState;
  }

  function flush(): RiskEvent[] {
    const events = [...buffer.values()].sort(
      (a, b) => a.frame_range[0] - b.frame_range[0],
    );
    buffer.clear();
    return events;
  }

  function pending(): RiskEvent[] {
    return [...buffer.values()].sort(
      (a, b) => a.frame_range[0] - b.frame_range[0],
    );
  }

  return { ingest, flush, pending, state: repCounter.state };
}
