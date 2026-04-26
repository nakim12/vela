/**
 * Default in-set voice cues, keyed by rule id.
 *
 * These are the *generic* fallbacks. v2 of voice cues will fetch a
 * per-user override map from the backend (sourced from the user's
 * Backboard knowledge graph + the post-set agent's most recent
 * recommendations). The frontend will merge that on top of this map,
 * so a missing personalized cue still gets spoken — just generically.
 *
 * Style guide for cue strings (matters because they get spoken aloud
 * mid-set, not read on a screen):
 *   - Imperative voice. "Drive your knees out", not "Try to drive…"
 *   - <= 6 words. The lifter is mid-rep; long cues land late.
 *   - No jargon. "Knee cave" is jargon to a beginner; "knees out" is
 *     not. Keep the proprietary terms in the event log, the cue text
 *     is for the body to act on.
 */

import type { RiskSide } from "@vela/shared-types";

/** Map of rule_id → cue text. Add new rules here as the engine grows. */
const DEFAULT_CUES: Record<string, string> = {
  KNEE_CAVE: "Drive your knees out",
  HEEL_LIFT: "Push through your heels",
  DEPTH_ASYMMETRY: "Even out your depth",
  UNEVEN_PRESS: "Press both arms together",
  BAR_PATH_DRIFT: "Stack the bar over your shoulders",
};

export function getDefaultCue(
  ruleId: string,
  // `side` is reserved for future per-side phrasing ("drive your LEFT
  // knee out") once we trust the laterality signal enough to call it
  // out by name. v1 keeps the cue side-agnostic — calling out the
  // wrong leg is worse than calling out neither.
  _side?: RiskSide,
): string | null {
  return DEFAULT_CUES[ruleId] ?? null;
}
