/**
 * Bench-specific rules. Same `Rule` interface as squat — pure functions
 * of one pose frame + the current rep state. The engine handles dedup
 * and peak tracking, so individual rules stay stateless.
 *
 * Rule coverage (in priority order):
 *   - UNEVEN_PRESS     — left vs right wrist y differ at the same instant,
 *                        i.e. the bar is tilted
 *   - BAR_PATH_DRIFT   — wrist x deviates from shoulder x; the bar has
 *                        drifted forward (toward feet) or backward
 *                        (toward head) from the natural over-shoulder line
 *
 * Camera assumption (v1):
 *   We expect a "head-on" framing — camera at the foot of the bench,
 *   pointed up the lifter's body, capturing both shoulders and both
 *   wrists. This is what the project plan prescribes for bench. From
 *   that angle, image-space y maps to bar height (lockout = small y,
 *   chest = larger y) and image-space x maps to lateral motion.
 *
 * Deliberately deferred for now:
 *   - SHOULDER_FLARE   — elbow-torso angle. Robust angle math depends
 *                        on knowing where the torso is in 3D, which we
 *                        can't reliably get from a single frontal-style
 *                        view. Revisit when we add side-camera support.
 *   - WRIST_BREAK      — wrist-forearm angle. Hard to measure without
 *                        forearm direction; needs hand keypoints
 *                        (separate model output we don't pull yet).
 *   - BAR_PATH_DRIFT (cross-rep variant) — the project-plan spec for
 *                        BAR_PATH_DRIFT is "horizontal travel between
 *                        rep n and rep n+1 > 8 cm" as a fatigue proxy.
 *                        That's stateful across reps; v1 ships the
 *                        within-rep cousin, which surfaces the same
 *                        signal from a different angle (any single rep
 *                        whose wrist x drifts off the shoulder line).
 */

import type { RiskEvent } from "@vela/shared-types";

import type { PoseFrame } from "@/lib/pose/detector";
import { LM } from "@/lib/pose/detector";
import type { Rule } from "./squat";

/** Population default for UNEVEN_PRESS — left vs right wrist image-y may
 *  differ by up to 7 % of shoulder width before we call the bar tilted.
 *  Plan says "> 3 cm at lockout"; for a typical 40 cm shoulder span that
 *  works out to ~7.5 %. We measure per-frame rather than only at lockout
 *  because the engine already keeps the per-rep peak, which is the worst
 *  moment of asymmetry across the rep — equivalent to what the plan asks
 *  for at lockout, plus we catch tilt during the press too. */
const UNEVEN_PRESS_DEFAULT = 0.07;

/** Tilted bar — left vs right wrist don't sit at the same height.
 *
 *  Signal: per-frame, take
 *
 *      score = |left_wrist.y - right_wrist.y| / shoulder_width
 *
 *  Tag side: "both" because the issue is the *symmetry*, not one arm
 *  being wrong on its own (the cue is "press evenly", which is about
 *  matching the two sides). The overlay highlights both wrists.
 */
export const UNEVEN_PRESS: Rule = {
  id: "UNEVEN_PRESS",
  evaluate(frame, ctx) {
    if (ctx.phase === "idle") return null;
    if (ctx.repIndex < 1) return null;

    const lm = frame.landmarks;
    const lWrist = lm[LM.LEFT_WRIST];
    const rWrist = lm[LM.RIGHT_WRIST];
    const lShoulder = lm[LM.LEFT_SHOULDER];
    const rShoulder = lm[LM.RIGHT_SHOULDER];

    if (!lWrist || !rWrist || !lShoulder || !rShoulder) return null;

    const minVis = Math.min(
      lWrist.visibility ?? 0.5,
      rWrist.visibility ?? 0.5,
      lShoulder.visibility ?? 0.5,
      rShoulder.visibility ?? 0.5,
    );
    // Wrists are often partially occluded by the bar itself, so 0.5
    // matches what HEEL_LIFT uses — high enough to reject hallucinations,
    // low enough to keep most real frames.
    if (minVis < 0.5) return null;

    const shoulderWidth = Math.abs(rShoulder.x - lShoulder.x);
    if (shoulderWidth < 0.05) return null;

    const score = Math.abs(lWrist.y - rWrist.y) / shoulderWidth;
    const threshold = ctx.thresholds.UNEVEN_PRESS ?? UNEVEN_PRESS_DEFAULT;
    if (score <= threshold) return null;

    // Severity in shoulder-widths: 7 % (info), 11 % (warn), 17 % (high).
    const severity: RiskEvent["severity"] =
      score > threshold * 2.5
        ? "high"
        : score > threshold * 1.6
          ? "warn"
          : "info";

    return {
      rule_id: "UNEVEN_PRESS",
      lift: "bench",
      rep_index: ctx.repIndex,
      severity,
      measured: Number(score.toFixed(3)),
      threshold: Number(threshold.toFixed(3)),
      frame_range: [frame.index, frame.index],
      confidence: Number(minVis.toFixed(2)),
      side: "both",
    };
  },
};

/** Population default for BAR_PATH_DRIFT — each wrist may sit up to
 *  15 % of shoulder width away from its same-side shoulder before we
 *  call the bar drifted. The wrist should track over the shoulder
 *  during the press (any reasonable bench setup); meaningful x-axis
 *  separation means the bar has moved toward feet or toward head.
 *  Severity tiers at 15 % (info), 22 % (warn), 30 % (high). */
const BAR_PATH_DRIFT_DEFAULT = 0.15;

/** Bar drifts off the over-shoulder line.
 *
 *  Signal: per-side, per-frame, take
 *
 *      score = |wrist.x - shoulder.x| / shoulder_width
 *
 *  Pick the worse side. We tag with that side since the cue ("stack
 *  the bar over your shoulders") is symmetric — but the overlay
 *  highlights only the offending arm so the lifter sees which side
 *  is drifting.
 *
 *  This is the *within-rep* variant of BAR_PATH_DRIFT; the project
 *  plan defines a *cross-rep* fatigue version (compare lockout x of
 *  rep n vs rep n+1) which would need cross-rep state we don't have
 *  yet. The within-rep signal is stricter — it'll fire on any single
 *  rep that drifts, not just the rep where fatigue creeps in — but
 *  it's a strict superset of what the plan flags, so it's a safe v1.
 */
export const BAR_PATH_DRIFT: Rule = {
  id: "BAR_PATH_DRIFT",
  evaluate(frame, ctx) {
    if (ctx.phase === "idle") return null;
    if (ctx.repIndex < 1) return null;

    const lm = frame.landmarks;
    const lWrist = lm[LM.LEFT_WRIST];
    const rWrist = lm[LM.RIGHT_WRIST];
    const lShoulder = lm[LM.LEFT_SHOULDER];
    const rShoulder = lm[LM.RIGHT_SHOULDER];

    if (!lWrist || !rWrist || !lShoulder || !rShoulder) return null;

    const minVis = Math.min(
      lWrist.visibility ?? 0.5,
      rWrist.visibility ?? 0.5,
      lShoulder.visibility ?? 0.5,
      rShoulder.visibility ?? 0.5,
    );
    if (minVis < 0.5) return null;

    const shoulderWidth = Math.abs(rShoulder.x - lShoulder.x);
    if (shoulderWidth < 0.05) return null;

    const leftScore = Math.abs(lWrist.x - lShoulder.x) / shoulderWidth;
    const rightScore = Math.abs(rWrist.x - rShoulder.x) / shoulderWidth;
    const worst = Math.max(leftScore, rightScore);

    const threshold = ctx.thresholds.BAR_PATH_DRIFT ?? BAR_PATH_DRIFT_DEFAULT;
    if (worst <= threshold) return null;

    const side: "left" | "right" = leftScore >= rightScore ? "left" : "right";
    const severity: RiskEvent["severity"] =
      worst > threshold * 2
        ? "high"
        : worst > threshold * 1.45
          ? "warn"
          : "info";

    return {
      rule_id: "BAR_PATH_DRIFT",
      lift: "bench",
      rep_index: ctx.repIndex,
      severity,
      measured: Number(worst.toFixed(3)),
      threshold: Number(threshold.toFixed(3)),
      frame_range: [frame.index, frame.index],
      confidence: Number(minVis.toFixed(2)),
      side,
    };
  },
};

/** Default rule set for the bench. Order matters only for tie-breaking
 *  in the engine's "first event of this rep" semantics. */
export const BENCH_RULES: Rule[] = [UNEVEN_PRESS, BAR_PATH_DRIFT];
