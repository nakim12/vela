/**
 * Web Speech API wrapper for in-set voice cues.
 *
 * v1 ships intentionally thin: a `speak()` that respects a global
 * cooldown so cascades of rule fires don't turn into a Lego-narrator
 * monologue, plus a `warmUpSpeech()` we call from a user-gesture
 * handler (the "Start Set" click) so Safari and Chrome both flip the
 * speech engine into the "ready" state. The component owns mute state
 * and decides whether to call `speak()` at all — the engine itself is
 * mute-agnostic, which keeps state from getting out of sync between
 * React and module memory.
 *
 * No personalization here yet. Cue strings come from
 * `lib/voice/cues.ts`. The follow-up PR (`voice-cues-v2`) will replace
 * the static map with an API-fetched, per-user cue dictionary.
 *
 * Note on browser support:
 *   - Chrome desktop / Edge: works out of the box.
 *   - Safari desktop: works after first user gesture; warmUpSpeech()
 *     handles this.
 *   - Mobile Safari: sometimes drops utterances when the tab loses
 *     audio focus. We don't try to recover; the visual cue (skeleton
 *     flash + event log) is the source of truth, voice is augmentation.
 */

/** Minimum gap between two spoken cues, in ms. Long enough that two
 *  back-to-back rule fires don't step on each other (e.g. KNEE_CAVE on
 *  rep 3 immediately followed by HEEL_LIFT on rep 4 used to merge into
 *  a half-finished cue + the next one starting). 4 s gives the average
 *  lifter time to absorb the first cue and start applying it before
 *  the second arrives. */
const COOLDOWN_MS = 4000;

let lastSpokenAt = 0;
let warmedUp = false;

function isSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Prime the engine on a user gesture. Without this, the first
 *  `speak()` call on Safari and many Chrome configurations is silently
 *  dropped. We send a near-silent space character — enough to wake the
 *  engine without the user hearing anything. Idempotent. */
export function warmUpSpeech(): void {
  if (warmedUp || !isSupported()) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0.01;
  window.speechSynthesis.speak(u);
  warmedUp = true;
}

/** Cancel any in-flight or queued utterance. Call on End Set so a cue
 *  fired in the last 200ms doesn't get spoken over the report page. */
export function cancelSpeech(): void {
  if (!isSupported()) return;
  window.speechSynthesis.cancel();
}

/** Speak `text` if the cooldown has elapsed. Returns true if the cue
 *  was queued, false if it was suppressed (cooldown active or speech
 *  not supported). The caller should NOT special-case `false` — a
 *  suppressed cue is fine, the next event will get its own chance. */
export function speak(text: string): boolean {
  if (!isSupported()) return false;
  const now = performance.now();
  if (now - lastSpokenAt < COOLDOWN_MS) return false;
  lastSpokenAt = now;

  // Chrome auto-pauses speechSynthesis after ~15 s of inactivity (a
  // long-standing browser bug). Calling `resume()` is a no-op when
  // the engine is already running and unblocks queued utterances when
  // it's been auto-paused. Without this, the second voice cue of a
  // long set silently disappears on Chrome desktop.
  window.speechSynthesis.resume();

  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  u.pitch = 1.0;
  u.volume = 1.0;
  window.speechSynthesis.speak(u);
  return true;
}

/** Reset the cooldown so the next `speak()` is guaranteed to fire.
 *  Used between sets — we don't want the cooldown from the last rep of
 *  set 1 to suppress the first cue of set 2 ten minutes later. */
export function resetSpeechCooldown(): void {
  lastSpokenAt = 0;
}
