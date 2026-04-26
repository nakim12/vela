/**
 * `CueStream` — thin WebSocket client for `/ws/sessions/:id`.
 *
 * The agent-driven, in-set cue path. Replaces the static
 * `getDefaultCue()` lookup that v1 of voice cues shipped with: instead
 * of `rule_id → hardcoded string`, the rules engine now hands flagged
 * `RiskEvent`s to the backend, which runs the in-set agent loop and
 * sends back a personalized 3–8 word cue (or the literal `STOP` if a
 * high-severity risk correlates with a known injury).
 *
 * Design choices worth flagging:
 *
 *   - **One socket per set.** The agent maintains conversation state in
 *     a Backboard thread keyed by `session_id`, so reconnecting mid-set
 *     would either lose context or duplicate it. We open in `connect()`
 *     and close in `close()`, no auto-reconnect.
 *
 *   - **Fire-and-forget sends.** `sendEvents()` returns a boolean (was
 *     it queued for the server) but does NOT return a Promise tied to
 *     the cue response. Cues come back asynchronously via `onCue`.
 *     This keeps the rules engine's `onEvent` callback synchronous —
 *     the engine fires every frame, and awaiting an agent round-trip
 *     in there would back up the frame loop.
 *
 *   - **Optimistic gating in the caller, not here.** We don't dedupe
 *     or rate-limit sends. The component already runs a per-rule
 *     cooldown (`PER_RULE_CUE_COOLDOWN_MS`) and the global speech
 *     cooldown (`speech.ts`). Adding a third layer here would make the
 *     "why is this cue swallowed?" debug story painful.
 *
 *   - **No auth header.** Browser `WebSocket` can't attach
 *     `Authorization`. The backend route currently only validates that
 *     `session_id` exists in the DB (see `apps/api/ws/session.py`).
 *     This is a known gap for the hackathon — productionizing should
 *     either pass the Clerk JWT as a query param or use the
 *     `Sec-WebSocket-Protocol` subprotocol trick.
 */
"use client";

import type {
  RiskEvent,
  WsClientFrame,
  WsServerFrame,
} from "@vela/shared-types";

/** Pulled from `NEXT_PUBLIC_API_URL` and `http`-swapped to `ws`. We
 *  rely on the env var over hardcoding because the demo deploys the
 *  API on a different origin than the FE. */
function resolveWsBase(): string {
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  if (apiBase.startsWith("https://")) return "wss://" + apiBase.slice(8);
  if (apiBase.startsWith("http://")) return "ws://" + apiBase.slice(7);
  return apiBase;
}

export type CueStreamListener = {
  /** Called with the agent's cue text. May be the literal `STOP` for a
   *  safety-stop recommendation; the caller decides how to render that
   *  (today: `speak()` it like any other cue). */
  onCue?: (text: string) => void;
  /** Server has set up the assistant + thread and is ready to accept
   *  `events` frames. Sends before this complete with an `error`. */
  onReady?: () => void;
  /** Server-side error frame OR transport-level error. The string
   *  matches what the backend sends (e.g. `agent_failed: ...`,
   *  `bad_events: ...`) so callers can log it verbatim. */
  onError?: (message: string) => void;
  /** Socket closed (cleanly or otherwise). Fires once per `connect()`. */
  onClose?: () => void;
};

export class CueStream {
  private ws: WebSocket | null = null;
  private ready = false;
  /** Set in `close()` so messages that arrive after we've torn down
   *  the set don't sneak through to `onCue`. Browsers don't guarantee
   *  that `ws.close()` immediately stops `message` events. */
  private closed = false;
  private readonly listener: CueStreamListener;

  constructor(listener: CueStreamListener) {
    this.listener = listener;
  }

  connect(sessionId: string): void {
    if (this.ws) return;

    const url = `${resolveWsBase()}/ws/sessions/${encodeURIComponent(sessionId)}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      this.listener.onError?.(`open_failed: ${toMessage(err)}`);
      return;
    }
    this.ws = ws;

    ws.onmessage = (ev) => {
      if (this.closed) return;
      let frame: WsServerFrame;
      try {
        frame = JSON.parse(typeof ev.data === "string" ? ev.data : "") as WsServerFrame;
      } catch (err) {
        this.listener.onError?.(`bad_frame: ${toMessage(err)}`);
        return;
      }
      switch (frame.type) {
        case "ready":
          this.ready = true;
          this.listener.onReady?.();
          break;
        case "cue":
          this.listener.onCue?.(frame.text);
          break;
        case "error":
          this.listener.onError?.(frame.message);
          break;
        case "pong":
          break;
      }
    };

    ws.onclose = () => {
      this.ready = false;
      if (!this.closed) this.listener.onClose?.();
      this.closed = true;
    };

    ws.onerror = () => {
      // The browser doesn't expose useful error info on `WebSocket`
      // errors — `onclose` always follows with a code we can't read
      // either. We emit a generic message so the caller can fall back
      // to default cues without having to read transport internals.
      this.listener.onError?.("connection_error");
    };
  }

  /** True when the socket is open AND the server has sent `ready`.
   *  Sends before `ready` would race the assistant/thread setup and
   *  produce confusing `setup_failed` errors. */
  isReady(): boolean {
    return (
      this.ready &&
      this.ws !== null &&
      this.ws.readyState === WebSocket.OPEN &&
      !this.closed
    );
  }

  /** Send a batch of `RiskEvent`s. Returns whether the send was
   *  queued; cue text comes back asynchronously via `onCue`. */
  sendEvents(events: RiskEvent[]): boolean {
    if (!this.isReady() || !this.ws || events.length === 0) return false;
    const frame: WsClientFrame = { type: "events", events };
    try {
      this.ws.send(JSON.stringify(frame));
      return true;
    } catch (err) {
      this.listener.onError?.(`send_failed: ${toMessage(err)}`);
      return false;
    }
  }

  close(): void {
    this.closed = true;
    this.ready = false;
    const ws = this.ws;
    this.ws = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try {
        ws.close(1000, "set_ended");
      } catch {
        // Some browsers throw if close is called during CONNECTING
        // with a custom code/reason. Swallow — the socket is on its
        // way out either way.
      }
    }
  }
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown_error";
}
