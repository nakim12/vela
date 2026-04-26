/**
 * Squat rep counter — a tiny state machine that watches the average
 * hip-y coordinate and emits a "rep complete" event when the user has
 * descended past a threshold and returned to roughly their starting
 * height.
 *
 * Image-space y grows DOWN (MediaPipe normalizes [0, 1] with origin at
 * top-left), so "going down" = y increases.
 *
 * The contract is intentionally narrow: the engine asks the counter for
 * the current phase and rep index; the counter asks the engine for
 * nothing. Adding bench/deadlift later means dropping in another
 * counter implementation behind the same {@link RepCounter} interface.
 */

import type { PoseFrame } from "@/lib/pose/detector";
import { LM } from "@/lib/pose/detector";

export type RepPhase =
  | "idle" // haven't moved enough to call this a rep yet
  | "descending" // hips are going down
  | "bottom" // hips have reversed direction at the bottom
  | "ascending"; // hips are going back up toward standing

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

type Internal = {
  phase: RepPhase;
  repIndex: number;
  /** y-coord of the hips when the user was last standing. Used as the
   *  reference height to call descent / return-to-top. */
  standingY: number | null;
  /** Most recent hip-y. Used to detect direction reversal. */
  lastHipY: number | null;
  /** y-coord at the bottom of the current rep. */
  bottomY: number | null;
};

/** Tunables. These are deliberately conservative because false positives
 *  here cascade into the rules engine (a phantom rep with bogus events).
 *  All in normalized image-space units (so 0.08 ~= 8% of frame height). */
const DESCENT_DELTA = 0.08;
const RETURN_TO_TOP_DELTA = 0.04;
const REVERSAL_NOISE = 0.005;

/** Build a fresh counter. Call {@link RepCounter.ingest} with every pose
 *  frame; it returns the current phase + rep index in O(1). */
export function createSquatRepCounter(): RepCounter {
  const s: Internal = {
    phase: "idle",
    repIndex: 0,
    standingY: null,
    lastHipY: null,
    bottomY: null,
  };

  function snapshot(): RepCounterState {
    return { phase: s.phase, repIndex: s.repIndex };
  }

  function ingest(frame: PoseFrame): RepCounterState {
    const lh = frame.landmarks[LM.LEFT_HIP];
    const rh = frame.landmarks[LM.RIGHT_HIP];
    if (!lh || !rh) return snapshot();

    const hipY = (lh.y + rh.y) / 2;

    if (s.standingY === null) {
      s.standingY = hipY;
      s.lastHipY = hipY;
      return snapshot();
    }

    const last = s.lastHipY ?? hipY;
    s.lastHipY = hipY;

    switch (s.phase) {
      case "idle": {
        // Continually retrack the standing height while we're idle so
        // the user can shift weight without permanently biasing the
        // reference.
        if (hipY < s.standingY) s.standingY = hipY;
        if (hipY - s.standingY > DESCENT_DELTA) {
          s.phase = "descending";
          s.bottomY = hipY;
          s.repIndex += 1;
        }
        break;
      }
      case "descending": {
        if (hipY > (s.bottomY ?? hipY)) {
          s.bottomY = hipY;
        } else if (last - hipY > REVERSAL_NOISE) {
          s.phase = "ascending";
        }
        break;
      }
      case "bottom":
      case "ascending": {
        if (hipY - (s.standingY ?? hipY) < RETURN_TO_TOP_DELTA) {
          // Back to standing — rep is complete.
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
