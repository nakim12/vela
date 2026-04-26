"use client";

/**
 * `<LiftCapture />` — the live-set surface that replaces the placeholder
 * card on `/lift/[lift]`.
 *
 * Lifecycle (one mount handles many sets, but typically one per page):
 *   1. User clicks "Start Set". We request camera permission, lazy-load
 *      the MediaPipe Pose Landmarker, then `POST /api/sessions` to mint
 *      a session row.
 *   2. We start a `requestVideoFrameCallback` loop that runs the model
 *      once per video frame, feeds the landmarks into the rules engine,
 *      and updates the live UI (rep count, current phase, event log).
 *   3. Every {@link FLUSH_INTERVAL_MS} we drain the engine's candidate
 *      buffer and `POST /api/sessions/{id}/events`. The BE is idempotent
 *      so retries on transient failure are safe.
 *   4. User clicks "End Set". We stop the frame loop, do one final
 *      flush, `POST /api/sessions/{id}/end`, and navigate to the
 *      session report so the post-set agent can take over.
 *
 * v1 ships HTTP event posting only. The WebSocket cue stream
 * (`apps/api/ws/session.py`) is its own follow-up because it adds
 * connection lifecycle on top of an already-busy component.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Play, Square, Video } from "lucide-react";
import type { Lift, RiskEvent } from "@vela/shared-types";

import { RiskBadge } from "@/components/RiskBadge";
import {
  ApiError,
  createSession,
  endSession,
  postEvents,
  useApi,
} from "@/lib/api-client";
import { getPoseLandmarker, type PoseFrame } from "@/lib/pose/detector";
import { drawPose, landmarksForRule } from "@/lib/pose/draw";
import { createEngine, type RulesEngine } from "@/lib/rules/engine";

type Phase =
  | { kind: "idle" }
  | { kind: "preparing"; step: "camera" | "model" | "session" }
  | { kind: "permission-denied" }
  | { kind: "error"; message: string }
  | { kind: "running"; sessionId: string }
  | { kind: "ending"; sessionId: string };

const FLUSH_INTERVAL_MS = 3000;

/** How long an event highlight on the skeleton stays lit, in ms. Long
 *  enough that the lifter notices it during the next rep, short enough
 *  that stale fires don't bleed into clean reps. */
const HIGHLIGHT_TTL_MS = 1500;

export function LiftCapture({ lift }: { lift: Lift }) {
  const api = useApi();
  const router = useRouter();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const engineRef = useRef<RulesEngine | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameCounterRef = useRef(0);
  /** landmark index → `performance.now()` expiry timestamp. The frame
   *  loop reads + prunes this map; the engine `onEvent` callback writes
   *  to it. Using a ref (not state) so we don't re-render on every
   *  rule fire — the canvas redraws on its own each frame anyway. */
  const highlightsRef = useRef<Map<number, number>>(new Map());

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [eventLog, setEventLog] = useState<RiskEvent[]>([]);
  const [repCount, setRepCount] = useState(0);
  const [phaseLabel, setPhaseLabel] = useState<string>("idle");

  const cleanup = useCallback(() => {
    if (rafIdRef.current !== null && videoRef.current) {
      videoRef.current.cancelVideoFrameCallback?.(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (flushTimerRef.current !== null) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    engineRef.current = null;
    sessionIdRef.current = null;
    frameCounterRef.current = 0;
    highlightsRef.current.clear();
    const canvas = canvasRef.current;
    if (canvas) {
      canvas
        .getContext("2d")
        ?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async () => {
    setEventLog([]);
    setRepCount(0);
    setPhaseLabel("idle");

    setPhase({ kind: "preparing", step: "camera" });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setPhase({ kind: "permission-denied" });
      } else {
        setPhase({ kind: "error", message: `camera: ${toMessage(err)}` });
      }
      return;
    }
    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) {
      cleanup();
      setPhase({ kind: "error", message: "video element missing" });
      return;
    }
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      // Autoplay can be denied on some browsers; user can click to play.
    }

    setPhase({ kind: "preparing", step: "model" });
    let landmarker;
    try {
      landmarker = await getPoseLandmarker();
    } catch (err) {
      cleanup();
      setPhase({ kind: "error", message: `model: ${toMessage(err)}` });
      return;
    }

    setPhase({ kind: "preparing", step: "session" });
    let session;
    try {
      session = await createSession(api, { lift });
    } catch (err) {
      cleanup();
      setPhase({ kind: "error", message: `session: ${toMessage(err)}` });
      return;
    }
    sessionIdRef.current = session.session_id;

    const engine = createEngine({
      lift,
      thresholds: {},
      onEvent: ({ event, isNew }) => {
        setEventLog((prev) => {
          if (isNew) return [...prev, event];
          const k = `${event.rule_id}-${event.rep_index}-${event.side ?? ""}`;
          return prev.map((e) =>
            `${e.rule_id}-${e.rep_index}-${e.side ?? ""}` === k ? event : e,
          );
        });
        // Light up the affected joints on the overlay. `landmarksForRule`
        // returns [] for rules we don't have a visualization for; that's
        // fine — the overlay just keeps drawing the white skeleton.
        const expiresAt = performance.now() + HIGHLIGHT_TTL_MS;
        for (const idx of landmarksForRule(event.rule_id, event.side)) {
          highlightsRef.current.set(idx, expiresAt);
        }
      },
    });
    engineRef.current = engine;

    const tickFrame: VideoFrameRequestCallback = () => {
      const v = videoRef.current;
      if (!engineRef.current || !v) return;
      const result = landmarker.detectForVideo(v, performance.now());
      const lms = result.landmarks?.[0];
      if (lms) {
        const frame: PoseFrame = {
          index: frameCounterRef.current++,
          timestampMs: Date.now(),
          landmarks: lms,
          worldLandmarks: result.worldLandmarks?.[0],
        };
        const repState = engineRef.current.ingest(frame);
        setRepCount(repState.repIndex);
        setPhaseLabel(repState.phase);

        // Sync the canvas to the source video's intrinsic resolution
        // once we actually have frames. `videoWidth/Height` is 0 until
        // metadata loads, so we wait for the first detection to size
        // it. Reassigning .width/.height is cheap if the value matches.
        const canvas = canvasRef.current;
        if (canvas && v.videoWidth && v.videoHeight) {
          if (
            canvas.width !== v.videoWidth ||
            canvas.height !== v.videoHeight
          ) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
          }
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const now = performance.now();
            const active = new Set<number>();
            for (const [idx, expiry] of highlightsRef.current) {
              if (expiry > now) active.add(idx);
              else highlightsRef.current.delete(idx);
            }
            drawPose(ctx, lms, canvas.width, canvas.height, {
              highlightLandmarks: active,
            });
          }
        }
      }
      if (videoRef.current && engineRef.current) {
        rafIdRef.current = videoRef.current.requestVideoFrameCallback(tickFrame);
      }
    };
    rafIdRef.current = video.requestVideoFrameCallback(tickFrame);

    flushTimerRef.current = setInterval(() => {
      const eng = engineRef.current;
      const sid = sessionIdRef.current;
      if (!eng || !sid) return;
      const events = eng.flush();
      if (events.length === 0) return;
      postEvents(api, sid, events).catch((err) => {
        // Single batch failures aren't fatal — keep capturing. The
        // final flush in `end()` will retry whatever's still buffered.
        console.error("[LiftCapture] flush failed", err);
      });
    }, FLUSH_INTERVAL_MS);

    setPhase({ kind: "running", sessionId: session.session_id });
  }, [api, lift, cleanup]);

  const end = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    setPhase({ kind: "ending", sessionId });

    if (rafIdRef.current !== null && videoRef.current) {
      videoRef.current.cancelVideoFrameCallback?.(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (flushTimerRef.current !== null) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    const tail = engineRef.current?.flush() ?? [];
    if (tail.length > 0) {
      try {
        await postEvents(api, sessionId, tail);
      } catch (err) {
        console.error("[LiftCapture] final flush failed", err);
      }
    }

    try {
      await endSession(api, sessionId);
    } catch (err) {
      console.error("[LiftCapture] end session failed", err);
    }

    cleanup();
    router.push(`/sessions/${sessionId}`);
  }, [api, cleanup, router]);

  const isRunning = phase.kind === "running";
  const isEnding = phase.kind === "ending";
  const isPreparing = phase.kind === "preparing";

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400/90">
            Live capture
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Browser pose detection — video stays on your device.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Stat label="rep" value={String(repCount)} />
          <Stat label="phase" value={phaseLabel} />
          <Stat label="events" value={String(eventLog.length)} />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="size-full -scale-x-100 object-cover"
          />
          {/* Skeleton overlay. Mirrored + object-cover so the painted
              landmarks line up pixel-for-pixel with the mirrored video
              underneath; pointer-events-none so clicks fall through to
              the start/end controls. */}
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full -scale-x-100 object-cover"
          />
          {phase.kind === "idle" && (
            <Overlay icon={<Camera className="size-6 text-zinc-300" />}>
              Step into frame and click Start Set.
            </Overlay>
          )}
          {phase.kind === "preparing" && (
            <Overlay icon={<Loader2 className="size-6 animate-spin text-sky-300" />}>
              {phase.step === "camera" && "Requesting camera access…"}
              {phase.step === "model" && "Loading pose model (~3 MB)…"}
              {phase.step === "session" && "Creating session…"}
            </Overlay>
          )}
          {phase.kind === "permission-denied" && (
            <Overlay icon={<Video className="size-6 text-red-300" />}>
              Camera permission denied. Allow access in your browser and click
              Start Set again.
            </Overlay>
          )}
          {phase.kind === "error" && (
            <Overlay icon={<Video className="size-6 text-red-300" />}>
              {phase.message}
            </Overlay>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-zinc-950/40 p-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            event log
          </p>
          {eventLog.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No events yet. Try a rep with intentional knee cave to test the
              loop end-to-end.
            </p>
          ) : (
            <ol className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {eventLog.map((ev, i) => (
                <li
                  key={`${ev.rule_id}-${ev.rep_index}-${ev.side ?? ""}-${i}`}
                  className="rounded-lg border border-white/5 bg-zinc-900/40 p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <RiskBadge event={ev} />
                    <span className="font-mono text-[10px] text-zinc-500">
                      rep {ev.rep_index}
                      {ev.side ? ` · ${ev.side}` : ""}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-zinc-500">
                    measured {ev.measured} · threshold {ev.threshold} · conf{" "}
                    {(ev.confidence * 100).toFixed(0)}%
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <footer className="mt-4 flex items-center justify-end gap-2">
        {!isRunning && !isEnding && (
          <button
            type="button"
            onClick={start}
            disabled={isPreparing}
            className="inline-flex items-center gap-1.5 rounded-md border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-sm font-medium text-sky-200 transition hover:bg-sky-400/20 disabled:opacity-40"
          >
            {isPreparing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            {isPreparing ? "Preparing…" : "Start Set"}
          </button>
        )}
        {isRunning && (
          <button
            type="button"
            onClick={end}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-sm font-medium text-red-200 transition hover:bg-red-400/20"
          >
            <Square className="size-3.5" />
            End Set
          </button>
        )}
        {isEnding && (
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-300"
          >
            <Loader2 className="size-3.5 animate-spin" />
            Finishing…
          </button>
        )}
      </footer>
    </section>
  );
}

function Overlay({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-zinc-950/70 text-center text-sm text-zinc-200 backdrop-blur-sm">
      <div className="flex max-w-sm flex-col items-center gap-2 px-6">
        {icon}
        <p>{children}</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/5 bg-zinc-950/60 px-2 py-1">
      <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-[11px] text-zinc-200">{value}</p>
    </div>
  );
}

function toMessage(err: unknown): string {
  if (err instanceof ApiError) return err.detail;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
