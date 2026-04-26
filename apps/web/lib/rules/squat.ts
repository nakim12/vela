/**
 * Squat-specific rules. Each rule is a pure function of one pose frame
 * + the current rep state; the engine handles per-(rule, rep) dedup and
 * cross-frame peak tracking, so individual rules can stay stateless.
 *
 * For v1 we ship one rule (KNEE_CAVE) so the UI has something to flag
 * without us having to tune three different geometry checks at once.
 * Forward dump and butt wink are obvious next-ups; their structure
 * follows the same shape.
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

/** Default rule set for the squat. Bench/deadlift get their own arrays
 *  in sibling files when those rules land. */
export const SQUAT_RULES: Rule[] = [KNEE_CAVE];
