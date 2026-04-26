/**
 * Canvas drawing helpers for the live pose overlay.
 *
 * Why a separate file: the math is pure (landmarks → 2D pixels) and the
 * choices about *what* to render are orthogonal to capture-loop wiring
 * inside `LiftCapture`. Keeping them split lets us swap the look (color
 * palette, line weights, joint emphasis) without touching the
 * MediaPipe / camera lifecycle, and makes the renderer trivially
 * unit-testable.
 *
 * The drawing is intentionally minimal in v1:
 *   - 33-pt BlazePose skeleton (lines + dots).
 *   - Landmarks below `minVisibility` are skipped so we don't draw a
 *     ghost limb behind the lifter when an arm leaves frame.
 *   - When a rule fires, `LiftCapture` passes a `highlightLandmarks`
 *     set; the corresponding joints + connecting bones flash red.
 *     The flash duration is owned by the caller; we render whatever
 *     the caller marks active on this frame.
 */

import { PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { RiskSide } from "@vela/shared-types";

import { LM } from "./detector";

const LEFT_LEG = [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE] as const;
const RIGHT_LEG = [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE] as const;
const LEFT_FOOT = [LM.LEFT_ANKLE, LM.LEFT_HEEL, LM.LEFT_FOOT_INDEX] as const;
const RIGHT_FOOT = [LM.RIGHT_ANKLE, LM.RIGHT_HEEL, LM.RIGHT_FOOT_INDEX] as const;
const HIP_LINE = [LM.LEFT_HIP, LM.RIGHT_HIP] as const;

/** Default joints to highlight per rule. The rules engine emits a
 *  `side` for laterality-aware rules (e.g. KNEE_CAVE on the left); we
 *  use that to scope the highlight to the offending leg/arm. `"both"`
 *  and missing `side` both light up both sides — better an over-broad
 *  flash than a missing one. */
export function landmarksForRule(
  ruleId: string,
  side?: RiskSide,
): readonly number[] {
  switch (ruleId) {
    case "KNEE_CAVE":
      if (side === "left") return LEFT_LEG;
      if (side === "right") return RIGHT_LEG;
      return [...LEFT_LEG, ...RIGHT_LEG];
    case "HEEL_LIFT":
      // Highlight the foot triangle so the lifter sees which heel
      // came up; the leg landmarks aren't the issue here, the foot is.
      if (side === "left") return LEFT_FOOT;
      if (side === "right") return RIGHT_FOOT;
      return [...LEFT_FOOT, ...RIGHT_FOOT];
    case "DEPTH_ASYMMETRY":
      // Asymmetry is a comparison, not a side problem. Light up both
      // hips so the lifter sees the level mismatch.
      return HIP_LINE;
    default:
      return [];
  }
}

export type DrawPoseOptions = {
  /** Landmark indices to render in the highlight color. */
  highlightLandmarks?: ReadonlySet<number>;
  /** Skip landmarks whose `visibility` is below this threshold. The
   *  BlazePose lite model returns plausible-looking but jittery
   *  predictions for occluded points; rendering them produces the
   *  uncanny "extra leg" effect. 0.4 matches the per-rule confidence
   *  gate the rules engine already uses. */
  minVisibility?: number;
};

const COLOR_BONE = "rgba(56, 189, 248, 0.85)"; // sky-400
const COLOR_BONE_HIGHLIGHT = "rgba(248, 113, 113, 0.95)"; // red-400
const COLOR_JOINT = "rgba(255, 255, 255, 0.92)";
const COLOR_JOINT_HIGHLIGHT = "rgba(248, 113, 113, 1)";

/** Render a pose skeleton onto `ctx`. Always clears the canvas first
 *  so callers can call this every frame without bookkeeping. */
export function drawPose(
  ctx: CanvasRenderingContext2D,
  landmarks: ReadonlyArray<NormalizedLandmark>,
  width: number,
  height: number,
  opts: DrawPoseOptions = {},
): void {
  const { highlightLandmarks, minVisibility = 0.4 } = opts;

  ctx.clearRect(0, 0, width, height);

  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (const conn of PoseLandmarker.POSE_CONNECTIONS) {
    const a = landmarks[conn.start];
    const b = landmarks[conn.end];
    if (!a || !b) continue;
    if ((a.visibility ?? 1) < minVisibility) continue;
    if ((b.visibility ?? 1) < minVisibility) continue;

    const both =
      highlightLandmarks?.has(conn.start) && highlightLandmarks?.has(conn.end);
    ctx.strokeStyle = both ? COLOR_BONE_HIGHLIGHT : COLOR_BONE;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }

  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if ((lm.visibility ?? 1) < minVisibility) continue;
    const isHighlighted = highlightLandmarks?.has(i) ?? false;
    ctx.fillStyle = isHighlighted ? COLOR_JOINT_HIGHLIGHT : COLOR_JOINT;
    ctx.beginPath();
    ctx.arc(
      lm.x * width,
      lm.y * height,
      isHighlighted ? 5 : 3.5,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}
