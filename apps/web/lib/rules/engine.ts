/**
 * Rules engine — the in-browser side of §3.3 of the project plan.
 *
 * Responsibilities:
 *  - Drive the rep counter and ask each {@link Rule} to evaluate the
 *    current pose frame.
 *  - Deduplicate candidate events per (rule_id, rep_index, side) — we
 *    don't want to ship 30 KNEE_CAVE events per rep just because the
 *    knee was cave for the entire descent. We keep the worst frame's
 *    measurement and update it in place if a worse one comes along.
 *  - Buffer accepted events until {@link flush} is called by the
 *    capture component (typically every few seconds and once at
 *    end-of-set).
 *
 *  The engine deliberately does NOT POST anything itself — that's the
 *  capture component's job, so the engine stays trivial to unit-test
 *  and we don't pollute it with auth concerns.
 */

import type { Lift, RiskEvent } from "@vela/shared-types";

import type { PoseFrame } from "@/lib/pose/detector";

import { createSquatRepCounter, type RepCounter, type RepCounterState } from "./repCounter";
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
  if (config.lift !== "squat") {
    // Bench / deadlift rules will plug in here later. Until then we
    // still build a working engine (rep counter runs) so the UI can
    // demo on those lifts even without rule coverage.
    return buildEngine([], createSquatRepCounter(), config);
  }
  return buildEngine(SQUAT_RULES, createSquatRepCounter(), config);
}

function buildEngine(
  rules: Rule[],
  repCounter: RepCounter,
  config: EngineConfig,
): RulesEngine {
  const candidates = new Map<string, RiskEvent>();

  function ingest(frame: PoseFrame): RepCounterState {
    const repState = repCounter.ingest(frame);
    for (const rule of rules) {
      const candidate = rule.evaluate(frame, {
        ...repState,
        thresholds: config.thresholds,
      });
      if (!candidate) continue;
      const key = `${candidate.rule_id}:${candidate.rep_index}:${candidate.side ?? ""}`;
      const existing = candidates.get(key);
      if (!existing || candidate.measured > existing.measured) {
        const updated = existing
          ? {
              ...candidate,
              frame_range: [existing.frame_range[0], frame.index] as [
                number,
                number,
              ],
            }
          : candidate;
        candidates.set(key, updated);
        config.onEvent?.({ event: updated, isNew: !existing });
      }
    }
    return repState;
  }

  function flush(): RiskEvent[] {
    const events = [...candidates.values()].sort(
      (a, b) => a.frame_range[0] - b.frame_range[0],
    );
    candidates.clear();
    return events;
  }

  function pending(): RiskEvent[] {
    return [...candidates.values()].sort(
      (a, b) => a.frame_range[0] - b.frame_range[0],
    );
  }

  return { ingest, flush, pending, state: repCounter.state };
}
