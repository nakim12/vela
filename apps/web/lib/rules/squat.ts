/**
 * Squat-specific rules. Each rule is a pure function of one pose frame
 * + the current rep state; the engine handles per-(rule, rep) dedup and
 * cross-frame peak tracking, so individual rules can stay stateless.
 *
 * Rule coverage (in priority order):
 *   - KNEE_CAVE         — frontal-plane knee valgus
 *   - HEEL_LIFT         — heel rises off the floor during the squat
 *   - DEPTH_ASYMMETRY   — left vs right hip don't reach the same depth
 *
 * Deliberately deferred for now:
 *   - FORWARD_DUMP      — chest collapse; can't be measured reliably
 *                         from a frontal selfie cam without trusting
 *                         BlazePose's world-coord z-axis (which we
 *                         haven't validated end-to-end yet) or making
 *                         the rule stateful with a per-rep torso
 *                         baseline. Revisit when we add side-camera
 *                         support or world-coord smoke tests.
 *   - BUTT_WINK         — sagittal pelvic tilt; essentially invisible
 *                         from frontal view. Needs side camera.
 */

import type { RiskEvent } from "@vela/shared-types";

import type { PoseFrame } from "@/lib/pose/detector";
import { LM } from "@/lib/pose/detector";
import type { RepCounterState } from "./repCounter";

export type RuleContext = RepCounterState & {
  /** Per-rule threshold map, merged from population defaults + the
   *  user's `/api/user/thresholds` overrides. The rule looks up its
   *  own `id` here. */
  thresholds: Record<string, number>;
};

export type Rule = {
  id: string;
  evaluate(frame: PoseFrame, ctx: RuleContext): RiskEvent | null;
};

/** Population default for KNEE_CAVE — knee horizontal distance from the
 *  user's body midline must be no more than 15% of shoulder width
 *  closer than the ankle is. Tuned for a roughly square-on view; will
 *  need refinement once we have video of real lifters. */
const KNEE_CAVE_DEFAULT = 0.15;

/** Frontal-plane knee valgus.
 *
 *  Signal: with a mirrored selfie camera, the user faces the lens. We
 *  measure how far each knee has shifted *medially* (toward the body's
 *  midline) compared to the ankle on the same side, normalized by
 *  shoulder width so it's scale-invariant.
 *
 *      score = (|ankle - midline| - |knee - midline|) / shoulder_width
 *
 *  A perfectly tracked knee scores ~0. A caving knee scores positive.
 *  We pick the worse of the two legs and tag the event with `side`.
 */
export const KNEE_CAVE: Rule = {
  id: "KNEE_CAVE",
  evaluate(frame, ctx) {
    if (ctx.phase === "idle") return null;
    if (ctx.repIndex < 1) return null;

    const lm = frame.landmarks;
    const lHip = lm[LM.LEFT_HIP];
    const rHip = lm[LM.RIGHT_HIP];
    const lShoulder = lm[LM.LEFT_SHOULDER];
    const rShoulder = lm[LM.RIGHT_SHOULDER];
    const lKnee = lm[LM.LEFT_KNEE];
    const rKnee = lm[LM.RIGHT_KNEE];
    const lAnkle = lm[LM.LEFT_ANKLE];
    const rAnkle = lm[LM.RIGHT_ANKLE];

    if (
      !lHip ||
      !rHip ||
      !lShoulder ||
      !rShoulder ||
      !lKnee ||
      !rKnee ||
      !lAnkle ||
      !rAnkle
    ) {
      return null;
    }

    const minVis = Math.min(
      lKnee.visibility ?? 0.5,
      rKnee.visibility ?? 0.5,
      lAnkle.visibility ?? 0.5,
      rAnkle.visibility ?? 0.5,
    );
    // Bail on low-confidence frames so we don't flag a hallucination.
    if (minVis < 0.4) return null;

    const midX = (lHip.x + rHip.x) / 2;
    const shoulderWidth = Math.abs(rShoulder.x - lShoulder.x);
    if (shoulderWidth < 0.05) return null;

    const score = (
      knee: { x: number; y: number },
      ankle: { x: number; y: number },
    ): number => {
      const kneeFromMid = Math.abs(knee.x - midX);
      const ankleFromMid = Math.abs(ankle.x - midX);
      return (ankleFromMid - kneeFromMid) / shoulderWidth;
    };

    const leftScore = score(lKnee, lAnkle);
    const rightScore = score(rKnee, rAnkle);
    const worst = Math.max(leftScore, rightScore);

    const threshold = ctx.thresholds.KNEE_CAVE ?? KNEE_CAVE_DEFAULT;
    if (worst <= threshold) return null;

    const side: "left" | "right" = leftScore >= rightScore ? "left" : "right";
    const severity: RiskEvent["severity"] =
      worst > threshold * 2
        ? "high"
        : worst > threshold * 1.5
          ? "warn"
          : "info";

    return {
      rule_id: "KNEE_CAVE",
      lift: "squat",
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

/** Population default for HEEL_LIFT — the heel must rise at least
 *  2.5 cm off the floor in world space before we call it a lift.
 *  This matches the project plan's "> 2 cm" spec with a thin margin
 *  for steady-state noise. The earlier 4 cm cut-off rejected real
 *  lifts; the noise we saw at 4-10 cm was driven by sub-50%
 *  confidence frames, which the visibility gate (0.5) below now
 *  filters. Severity tiers at 5 cm (warn) and 8 cm (high). */
const HEEL_LIFT_DEFAULT = 0.025;

/** Vertical heel rise off the ground.
 *
 *  Signal: BlazePose world landmarks are in 3D meters with the origin
 *  at the mid-hip and the y axis pointing DOWN (gravity-aligned). When
 *  the foot is flat on the floor, the heel and the forward-most toe
 *  (`foot_index`) sit at the same world-y (≈ +1.0 m for an adult,
 *  measured from the hips). When the heel rises, only the heel arcs
 *  upward in world space → smaller y → `toe.y - heel.y > 0`.
 *
 *      score = toe.y - heel.y     // meters, per leg
 *
 *  We pick the worse side and tag the event with its `side`. Image-
 *  space landmarks are still used for the visibility gate because the
 *  world-coord visibility scores aren't well documented and the image
 *  scores are what the rest of the engine relies on.
 *
 *  If the model returns no world landmarks we silently skip — this
 *  keeps the rule from misbehaving in the rare browsers / configs
 *  where MediaPipe omits the world output. The image-space signal we
 *  shipped first is too noisy for production from a frontal cam.
 */
export const HEEL_LIFT: Rule = {
  id: "HEEL_LIFT",
  evaluate(frame, ctx) {
    if (ctx.phase === "idle") return null;
    if (ctx.repIndex < 1) return null;

    const w = frame.worldLandmarks;
    if (!w) return null;
    const lHeelW = w[LM.LEFT_HEEL];
    const rHeelW = w[LM.RIGHT_HEEL];
    const lToeW = w[LM.LEFT_FOOT_INDEX];
    const rToeW = w[LM.RIGHT_FOOT_INDEX];
    if (!lHeelW || !rHeelW || !lToeW || !rToeW) return null;

    const lm = frame.landmarks;
    const lHeel = lm[LM.LEFT_HEEL];
    const rHeel = lm[LM.RIGHT_HEEL];
    const lToe = lm[LM.LEFT_FOOT_INDEX];
    const rToe = lm[LM.RIGHT_FOOT_INDEX];
    if (!lHeel || !rHeel || !lToe || !rToe) return null;

    const minVis = Math.min(
      lHeel.visibility ?? 0.5,
      rHeel.visibility ?? 0.5,
      lToe.visibility ?? 0.5,
      rToe.visibility ?? 0.5,
    );
    // 0.5 lands between two failure modes: at 0.4 we saw fabricated
    // 10 cm heel rises on 45 %-visibility frames, while at 0.7 we
    // rejected genuine intentional heel lifts because pushing weight
    // onto the toes occludes the heel and drives visibility into the
    // 0.55-0.65 range. 0.5 keeps the real signal and trims the worst
    // hallucinations; the gate is meant to be a coarse filter, not
    // the only line of defense.
    if (minVis < 0.5) return null;

    const leftScore = lToeW.y - lHeelW.y;
    const rightScore = rToeW.y - rHeelW.y;
    const worst = Math.max(leftScore, rightScore);

    const threshold = ctx.thresholds.HEEL_LIFT ?? HEEL_LIFT_DEFAULT;
    if (worst <= threshold) return null;

    const side: "left" | "right" = leftScore >= rightScore ? "left" : "right";
    // Severity in real meters: 2.5 cm (info), 5 cm (warn), 8 cm (high).
    const severity: RiskEvent["severity"] =
      worst > threshold * 3.2
        ? "high"
        : worst > threshold * 2
          ? "warn"
          : "info";

    return {
      rule_id: "HEEL_LIFT",
      lift: "squat",
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

/** Population default for DEPTH_ASYMMETRY — left vs right hip image-y
 *  may differ by up to 10 % of shoulder-width before we call the rep
 *  uneven. Matches the project plan's "> 4 cm" spec (≈ 10 % of a
 *  typical 40 cm shoulder). We bumped this to 15 % once and that
 *  rejected real intentional weight-shift reps; the impossible
 *  measurements (`measured 7.28`) we'd seen earlier were all sub-70 %
 *  confidence frames, which the visibility gate (0.7) now filters
 *  unconditionally. Threshold and visibility live in different layers. */
const DEPTH_ASYMMETRY_DEFAULT = 0.1;

/** Left vs right hip don't bottom out at the same depth.
 *
 *  Signal: at any non-idle frame during the rep, take
 *
 *      score = |left_hip.y - right_hip.y| / shoulder_width
 *
 *  The engine keeps the worst frame's measurement per rep, so the
 *  reported `measured` value reflects the deepest moment of asymmetry
 *  across that rep.
 *
 *  We tag `side: "both"` rather than picking one. Asymmetry is a
 *  symmetry violation — the cue ("even out your depth") is about
 *  comparing the two sides, not about correcting one. The overlay
 *  highlights both hips to match.
 */
export const DEPTH_ASYMMETRY: Rule = {
  id: "DEPTH_ASYMMETRY",
  evaluate(frame, ctx) {
    if (ctx.phase === "idle") return null;
    if (ctx.repIndex < 1) return null;

    const lm = frame.landmarks;
    const lHip = lm[LM.LEFT_HIP];
    const rHip = lm[LM.RIGHT_HIP];
    const lShoulder = lm[LM.LEFT_SHOULDER];
    const rShoulder = lm[LM.RIGHT_SHOULDER];

    if (!lHip || !rHip || !lShoulder || !rShoulder) return null;

    const minVis = Math.min(
      lHip.visibility ?? 0.5,
      rHip.visibility ?? 0.5,
    );
    // Same story as HEEL_LIFT — sub-0.7 visibility on hips produces
    // wildly fabricated y-coords (we observed `measured 7.28` once,
    // which would mean one hip was several shoulder-widths above the
    // other; physically impossible). The 100 %-confidence frames are
    // where the real signal lives.
    if (minVis < 0.7) return null;

    const shoulderWidth = Math.abs(rShoulder.x - lShoulder.x);
    if (shoulderWidth < 0.05) return null;

    const score = Math.abs(lHip.y - rHip.y) / shoulderWidth;
    const threshold = ctx.thresholds.DEPTH_ASYMMETRY ?? DEPTH_ASYMMETRY_DEFAULT;
    if (score <= threshold) return null;

    const severity: RiskEvent["severity"] =
      score > threshold * 2
        ? "high"
        : score > threshold * 1.5
          ? "warn"
          : "info";

    return {
      rule_id: "DEPTH_ASYMMETRY",
      lift: "squat",
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

/** Default rule set for the squat. Bench/deadlift get their own arrays
 *  in sibling files when those rules land. */
export const SQUAT_RULES: Rule[] = [KNEE_CAVE, HEEL_LIFT, DEPTH_ASYMMETRY];
