/**
 * Rep counters — tiny state machines per lift.
 *
 * The counter watches a single y-coordinate (the "tracking signal"),
 * detects descent past `descentDelta` from a continuously-updated
 * standing reference, and counts a rep complete when the signal
 * returns to within `returnToTopDelta` of standing.
 *
 * Lift differences:
 *   - Squat: track average hip y. The hips drop on descent.
 *   - Bench: track average wrist y. The wrist drops on descent (the
 *     bar comes toward the chest in a head-on / overhead camera view,
 *     where image-space y grows down). Same direction as squat hips,
 *     so the same state machine applies — only the tracked landmark
 *     differs.
 *
 * Image-space y grows DOWN (MediaPipe normalizes [0, 1] with origin
 * at top-left), so "going down" = y increases for both lifts.
 *
 * The contract is intentionally narrow: the engine asks the counter
 * for the current phase and rep index; the counter asks the engine for
 * nothing. Adding deadlift later means another factory in this file
 * with its own tracking signal.
 */

import type { Lift } from "@vela/shared-types";

import type { PoseFrame } from "@/lib/pose/detector";
import { LM } from "@/lib/pose/detector";

export type RepPhase =
  | "idle" // haven't moved enough to call this a rep yet
  | "descending" // the tracked signal is moving down
  | "bottom" // the signal has reversed direction at the bottom
  | "ascending"; // the signal is moving back up toward starting height

export type RepCounterState = {
  phase: RepPhase;
  /** 1-indexed; 0 means no reps completed yet. Matches the BE expectation
   *  that `rep_index` on a RiskEvent is the rep that was in progress. */
  repIndex: number;
};

export interface RepCounter {
  ingest(frame: PoseFrame): RepCounterState;
  state(): RepCounterState;
}

/** Tunables for the generic counter. All in normalized image-space units
 *  (so 0.08 ~= 8% of frame height). Conservative because false positives
 *  here cascade into the rules engine — a phantom rep produces bogus
 *  events tied to a rep that never happened. */
type CounterTunables = {
  descentDelta: number;
  returnToTopDelta: number;
  reversalNoise: number;
};

const SQUAT_TUNABLES: CounterTunables = {
  descentDelta: 0.08,
  returnToTopDelta: 0.04,
  reversalNoise: 0.005,
};

/** Bench has a smaller usable y-range than squat (the wrist's image
 *  travel is bounded by the bar's lockout-to-chest distance, ~25-35 cm)
 *  and the camera framing is typically tighter, so the same fractional
 *  thresholds end up too aggressive. We loosen them empirically; expect
 *  to tune once we have real bench videos. */
const BENCH_TUNABLES: CounterTunables = {
  descentDelta: 0.05,
  returnToTopDelta: 0.025,
  reversalNoise: 0.005,
};

type Internal = {
  phase: RepPhase;
  repIndex: number;
  /** y-coord of the tracked signal when the user was last "standing"
   *  (idle reference height). Used to call descent / return-to-top. */
  standingY: number | null;
  /** Most recent tracked y. Used to detect direction reversal. */
  lastY: number | null;
  /** y-coord at the bottom of the current rep. */
  bottomY: number | null;
};

/** Build a generic rep counter parameterized by a y-getter. The getter
 *  reads the current frame's landmarks and returns the y to track, or
 *  `null` if the relevant points aren't visible enough to make a call.
 *  Returning `null` keeps the counter idle on dropped frames rather
 *  than fabricating a phase change. */
function buildCounter(
  getY: (frame: PoseFrame) => number | null,
  t: CounterTunables,
): RepCounter {
  const s: Internal = {
    phase: "idle",
    repIndex: 0,
    standingY: null,
    lastY: null,
    bottomY: null,
  };

  function snapshot(): RepCounterState {
    return { phase: s.phase, repIndex: s.repIndex };
  }

  function ingest(frame: PoseFrame): RepCounterState {
    const y = getY(frame);
    if (y === null) return snapshot();

    if (s.standingY === null) {
      s.standingY = y;
      s.lastY = y;
      return snapshot();
    }

    const last = s.lastY ?? y;
    s.lastY = y;

    switch (s.phase) {
      case "idle": {
        // Continually retrack the standing height while we're idle so
        // the user can shift weight without permanently biasing the
        // reference.
        if (y < s.standingY) s.standingY = y;
        if (y - s.standingY > t.descentDelta) {
          s.phase = "descending";
          s.bottomY = y;
          s.repIndex += 1;
        }
        break;
      }
      case "descending": {
        if (y > (s.bottomY ?? y)) {
          s.bottomY = y;
        } else if (last - y > t.reversalNoise) {
          s.phase = "ascending";
        }
        break;
      }
      case "bottom":
      case "ascending": {
        if (y - (s.standingY ?? y) < t.returnToTopDelta) {
          // Back to the top — rep is complete.
          s.phase = "idle";
          s.bottomY = null;
        }
        break;
      }
    }

    return snapshot();
  }

  return { ingest, state: snapshot };
}

/** Build a fresh squat counter. Tracks average hip y. */
export function createSquatRepCounter(): RepCounter {
  return buildCounter(squatHipY, SQUAT_TUNABLES);
}

/** Build a fresh bench counter. Tracks average wrist y. We average the
 *  two wrists (rather than picking one) so a single occluded wrist
 *  doesn't confuse phase detection — the average stays close to the
 *  visible side. */
export function createBenchRepCounter(): RepCounter {
  return buildCounter(benchWristY, BENCH_TUNABLES);
}

/** Dispatch a counter for a given lift. Falls back to the squat counter
 *  for lifts we haven't implemented yet so the engine still has a working
 *  rep state (the user can demo even when no rules fire). */
export function createRepCounterForLift(lift: Lift): RepCounter {
  switch (lift) {
    case "squat":
      return createSquatRepCounter();
    case "bench":
      return createBenchRepCounter();
    case "deadlift":
      return createSquatRepCounter();
  }
}

function squatHipY(frame: PoseFrame): number | null {
  const lh = frame.landmarks[LM.LEFT_HIP];
  const rh = frame.landmarks[LM.RIGHT_HIP];
  if (!lh || !rh) return null;
  return (lh.y + rh.y) / 2;
}

function benchWristY(frame: PoseFrame): number | null {
  const lw = frame.landmarks[LM.LEFT_WRIST];
  const rw = frame.landmarks[LM.RIGHT_WRIST];
  if (!lw || !rw) return null;
  return (lw.y + rw.y) / 2;
}
