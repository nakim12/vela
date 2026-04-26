"use client";

/**
 * `<LiftUpload />` — sibling of `<LiftCapture />` that runs the same
 * pose-detection + rules pipeline against a user-supplied video file
 * instead of the webcam.
 *
 * Lifecycle (one mount, one upload at a time):
 *   1. User picks a `.mp4` (or any browser-decodable video) from the
 *      file picker. We `URL.createObjectURL(file)` and assign it as
 *      `<video>.src`. Nothing leaves the browser yet.
 *   2. User clicks "Analyze". We lazy-load the MediaPipe Pose
 *      Landmarker and `POST /api/sessions` to mint a session row.
 *   3. We `play()` the video. A `requestVideoFrameCallback` loop runs
 *      the model once per displayed frame, feeds the landmarks into
 *      the rules engine, and updates the live UI (rep count, phase,
 *      event log, skeleton overlay) — exactly like live capture.
 *   4. Every {@link FLUSH_INTERVAL_MS} we drain the engine buffer and
 *      `POST /api/sessions/{id}/events`.
 *   5. When the `<video>` fires `ended`, we do one final flush,
 *      `POST /api/sessions/{id}/end`, and navigate to the session
 *      report so the post-set agent can take over.
 *
 * Why playback-driven (vs. seek-and-step):
 *   The whole stack — detector, engine, rep counter, flush — already
 *   works on a stream of `<video>`-sourced frames at ~30 fps. Letting
 *   the browser play the file and reusing `requestVideoFrameCallback`
 *   gets us the same code path as live with one swap (`srcObject` →
 *   `src`). It also gives the lifter a "watch your form analyzed"
 *   moment with the skeleton overlay drawn on their own footage,
 *   which is a much better demo than a silent progress bar. Trade-off:
 *   a 60 s clip takes 60 s to process. A 2× playback toggle is the
 *   obvious follow-up if that becomes painful.
 *
 * Why no WebSocket cue stream:
 *   Voice cues only help in-set. By the time you upload, the rep is
 *   over — getting "drive your knees out" two seconds after the rep
 *   you can't redo isn't useful. We still let the user mute the UI
 *   for symmetry with live, but the static `getDefaultCue` is the only
 *   audio path here, and it's off by default for uploads.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileVideo,
  Loader2,
  Play,
  Square,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
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
import { getDefaultCue } from "@/lib/voice/cues";
import {
  cancelSpeech,
  resetSpeechCooldown,
  speak,
  warmUpSpeech,
} from "@/lib/voice/speech";

type Phase =
  | { kind: "idle" }
  | { kind: "ready"; file: File }
  | { kind: "preparing"; step: "model" | "session" }
  | { kind: "error"; message: string }
  | { kind: "analyzing"; sessionId: string }
  | { kind: "ending"; sessionId: string };

const FLUSH_INTERVAL_MS = 3000;
const HIGHLIGHT_TTL_MS = 1500;
/** Upload defaults to muted: voice cues mid-playback are noise, since
 *  the rep already happened. The user can flip this on if they want
 *  the static cue to fire during analysis. Persists separately from
 *  the live-capture mute pref so a "muted on uploads" choice doesn't
 *  silently mute live capture too. */
const MUTE_STORAGE_KEY = "vela.voice.muted.upload";
const PER_RULE_CUE_COOLDOWN_MS = 5000;

/** Hard cap on accepted upload size. MediaPipe is happy with anything
 *  the browser can decode, but a 1 GB phone video is an awful UX —
 *  the page would freeze on `createObjectURL` and the analysis would
 *  take longer than the rest of the demo combined. 200 MB covers
 *  ~3 min of 1080p H.264 at typical phone bitrates. */
const MAX_FILE_BYTES = 200 * 1024 * 1024;

const ACCEPTED_MIME = "video/mp4,video/quicktime,video/webm,video/*";

export function LiftUpload({ lift }: { lift: Lift }) {
  const api = useApi();
  const router = useRouter();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const engineRef = useRef<RulesEngine | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameCounterRef = useRef(0);
  const highlightsRef = useRef<Map<number, number>>(new Map());
  const lastCueAtRef = useRef<Map<string, number>>(new Map());
  /** Set inside the `ended` handler so the frame loop knows to stop
   *  scheduling itself even if RVFC fires one more time after the
   *  video has technically ended (it sometimes does). */
  const endingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [eventLog, setEventLog] = useState<RiskEvent[]>([]);
  const [repCount, setRepCount] = useState(0);
  const [phaseLabel, setPhaseLabel] = useState<string>("idle");
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(true);
  const mutedRef = useRef(true);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MUTE_STORAGE_KEY);
      // For uploads we *invert* the live-capture default: muted unless
      // the user has explicitly opted into audio for this surface.
      if (stored === "0") {
        setMuted(false);
        mutedRef.current = false;
      }
    } catch {
      // localStorage blocked — defaults stand.
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      try {
        window.localStorage.setItem(MUTE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      if (next) cancelSpeech();
      return next;
    });
  }, []);

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    if (rafIdRef.current !== null && videoRef.current) {
      videoRef.current.cancelVideoFrameCallback?.(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (flushTimerRef.current !== null) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    engineRef.current = null;
    sessionIdRef.current = null;
    frameCounterRef.current = 0;
    endingRef.current = false;
    highlightsRef.current.clear();
    lastCueAtRef.current.clear();
    const canvas = canvasRef.current;
    if (canvas) {
      canvas
        .getContext("2d")
        ?.clearRect(0, 0, canvas.width, canvas.height);
    }
    cancelSpeech();
  }, []);

  useEffect(
    () => () => {
      cleanup();
      revokeObjectUrl();
    },
    [cleanup, revokeObjectUrl],
  );

  const onPickFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      if (!file.type.startsWith("video/")) {
        setPhase({ kind: "error", message: "Please choose a video file." });
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        const mb = (file.size / 1024 / 1024).toFixed(0);
        setPhase({
          kind: "error",
          message: `File is ${mb} MB. Max 200 MB — try a shorter clip.`,
        });
        return;
      }
      // Wipe any prior session state so picking a second file after a
      // failed run starts from a clean slate. We don't post anything
      // to the BE here; that happens on Analyze.
      cleanup();
      revokeObjectUrl();
      setEventLog([]);
      setRepCount(0);
      setPhaseLabel("idle");
      setProgress(0);

      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      const video = videoRef.current;
      if (video) {
        video.srcObject = null;
        video.src = url;
        video.load();
      }
      setPhase({ kind: "ready", file });
    },
    [cleanup, revokeObjectUrl],
  );

  const onClearFile = useCallback(() => {
    cleanup();
    revokeObjectUrl();
    const video = videoRef.current;
    if (video) {
      video.removeAttribute("src");
      video.load();
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    setEventLog([]);
    setRepCount(0);
    setPhaseLabel("idle");
    setProgress(0);
    setPhase({ kind: "idle" });
  }, [cleanup, revokeObjectUrl]);

  const start = useCallback(async () => {
    if (phase.kind !== "ready") return;
    setEventLog([]);
    setRepCount(0);
    setPhaseLabel("idle");
    setProgress(0);

    // Same speech warm-up dance as live: must be inside the user
    // gesture so Safari and Chrome both flip the engine on. No-op if
    // the user kept the default (muted), but cheap and idempotent.
    warmUpSpeech();
    resetSpeechCooldown();
    lastCueAtRef.current.clear();
    endingRef.current = false;

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
        const expiresAt = performance.now() + HIGHLIGHT_TTL_MS;
        for (const idx of landmarksForRule(event.rule_id, event.side)) {
          highlightsRef.current.set(idx, expiresAt);
        }
        // Static-only voice path. Upload doesn't open the WS cue stream
        // because cues are too late to act on once the rep is recorded;
        // the default cue is fine as a "name what went wrong" beep when
        // the user explicitly turns audio on.
        if (!mutedRef.current) {
          const now = performance.now();
          const lastAt = lastCueAtRef.current.get(event.rule_id) ?? 0;
          if (now - lastAt >= PER_RULE_CUE_COOLDOWN_MS) {
            const cue = getDefaultCue(event.rule_id, event.side);
            if (cue && speak(cue)) {
              lastCueAtRef.current.set(event.rule_id, now);
            }
          }
        }
      },
    });
    engineRef.current = engine;

    const video = videoRef.current;
    if (!video) {
      cleanup();
      setPhase({ kind: "error", message: "video element missing" });
      return;
    }
    // Always start from the top, even if the user scrubbed before
    // clicking Analyze. Without this, a partial-replay analysis would
    // skip the first reps and miscount.
    try {
      video.currentTime = 0;
    } catch {
      // Some browsers throw if the metadata isn't ready yet. We'll
      // just play from wherever; the rep counter is robust to that.
    }

    setPhase({ kind: "analyzing", sessionId: session.session_id });

    const tickFrame: VideoFrameRequestCallback = () => {
      const v = videoRef.current;
      if (!engineRef.current || !v || endingRef.current) return;

      // Use the **media** clock, not wall time, for the detector
      // timestamp. MediaPipe only requires a monotonically advancing
      // value; aligning to `currentTime` means timestamps stay
      // meaningful if we ever scrub or loop.
      const mediaTimeMs = v.currentTime * 1000;
      const result = landmarker.detectForVideo(v, mediaTimeMs);
      const lms = result.landmarks?.[0];
      if (lms) {
        const frame: PoseFrame = {
          index: frameCounterRef.current++,
          timestampMs: Math.round(mediaTimeMs),
          landmarks: lms,
          worldLandmarks: result.worldLandmarks?.[0],
        };
        const repState = engineRef.current.ingest(frame);
        setRepCount(repState.repIndex);
        setPhaseLabel(repState.phase);

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

      // Update progress bar from the media clock. Duration can be
      // Infinity for streaming / fragmented files; guard that or the
      // bar stays at NaN%.
      if (Number.isFinite(v.duration) && v.duration > 0) {
        setProgress(Math.min(1, v.currentTime / v.duration));
      }

      if (videoRef.current && engineRef.current && !endingRef.current) {
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
        console.error("[LiftUpload] flush failed", err);
      });
    }, FLUSH_INTERVAL_MS);

    try {
      await video.play();
    } catch (err) {
      cleanup();
      setPhase({ kind: "error", message: `playback: ${toMessage(err)}` });
    }
  }, [api, lift, phase, cleanup]);

  const finish = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || endingRef.current) return;
    endingRef.current = true;
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
        console.error("[LiftUpload] final flush failed", err);
      }
    }

    try {
      await endSession(api, sessionId);
    } catch (err) {
      console.error("[LiftUpload] end session failed", err);
    }

    cleanup();
    revokeObjectUrl();
    router.push(`/sessions/${sessionId}`);
  }, [api, cleanup, revokeObjectUrl, router]);

  // The video element calls us back when playback hits the end. This
  // is the equivalent of "End Set" for live capture — we use the
  // `ended` event instead of a button so the user doesn't have to
  // babysit a 60 s analysis.
  const onVideoEnded = useCallback(() => {
    if (phase.kind === "analyzing") void finish();
  }, [phase, finish]);

  // Manual cancel, e.g. user picked the wrong file mid-analysis. We
  // still post whatever events have already been buffered and end the
  // session; the report will just be sparse.
  const onCancel = useCallback(() => {
    if (phase.kind === "analyzing") void finish();
  }, [phase, finish]);

  const isReady = phase.kind === "ready";
  const isAnalyzing = phase.kind === "analyzing";
  const isPreparing = phase.kind === "preparing";
  const isEnding = phase.kind === "ending";
  const showVideo = isReady || isAnalyzing || isEnding;

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400/90">
            Upload &amp; analyze
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Browser-side pose detection — your video never leaves your device.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Stat label="rep" value={String(repCount)} />
          <Stat label="phase" value={phaseLabel} />
          <Stat label="events" value={String(eventLog.length)} />
          <button
            type="button"
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label={muted ? "Unmute voice cues" : "Mute voice cues"}
            title={muted ? "Voice cues muted" : "Voice cues on"}
            className={
              "ml-1 inline-flex size-7 items-center justify-center rounded-md border transition " +
              (muted
                ? "border-white/10 bg-zinc-950/60 text-zinc-500 hover:text-zinc-300"
                : "border-sky-400/30 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20")
            }
          >
            {muted ? (
              <VolumeX className="size-3.5" />
            ) : (
              <Volume2 className="size-3.5" />
            )}
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black">
          <video
            ref={videoRef}
            playsInline
            // Stay muted as a media element. Voice cues come from the
            // Web Speech API, not the video's audio track. We also
            // don't autoplay — playback is gated on the Analyze click,
            // which carries the user gesture browsers want.
            muted
            preload="metadata"
            onEnded={onVideoEnded}
            className={
              "size-full object-contain " + (showVideo ? "" : "hidden")
            }
          />
          {/* Skeleton overlay. Not mirrored: an uploaded video already
              encodes the lifter's actual orientation, so flipping it
              would put the "left" leg label on the right side of the
              image. */}
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className={
              "pointer-events-none absolute inset-0 size-full object-contain " +
              (showVideo ? "" : "hidden")
            }
          />

          {phase.kind === "idle" && (
            <DropZone
              onPick={onPickFile}
              fileInputRef={fileInputRef}
            />
          )}
          {phase.kind === "error" && (
            <Overlay icon={<FileVideo className="size-6 text-red-300" />}>
              <p>{phase.message}</p>
              <button
                type="button"
                onClick={onClearFile}
                className="mt-3 rounded-md border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200 hover:bg-white/10"
              >
                Try again
              </button>
            </Overlay>
          )}
          {isPreparing && (
            <Overlay icon={<Loader2 className="size-6 animate-spin text-sky-300" />}>
              {phase.step === "model" && "Loading pose model (~3 MB)…"}
              {phase.step === "session" && "Creating session…"}
            </Overlay>
          )}

          {isAnalyzing && (
            <ProgressBar value={progress} />
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-zinc-950/40 p-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            event log
          </p>
          {eventLog.length === 0 ? (
            <p className="text-sm text-zinc-500">
              {phase.kind === "idle"
                ? "Pick a video to get started."
                : "No events yet — analysis is running."}
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

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-zinc-500">
          {isReady && phase.file && (
            <span className="font-mono">
              {phase.file.name} · {(phase.file.size / 1024 / 1024).toFixed(1)} MB
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isReady && (
            <button
              type="button"
              onClick={onClearFile}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-zinc-950/60 px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-zinc-900"
            >
              <X className="size-3.5" />
              Clear
            </button>
          )}
          {isReady && (
            <button
              type="button"
              onClick={start}
              className="inline-flex items-center gap-1.5 rounded-md border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-sm font-medium text-sky-200 transition hover:bg-sky-400/20"
            >
              <Play className="size-3.5" />
              Analyze
            </button>
          )}
          {isPreparing && (
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-300"
            >
              <Loader2 className="size-3.5 animate-spin" />
              Preparing…
            </button>
          )}
          {isAnalyzing && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-sm font-medium text-red-200 transition hover:bg-red-400/20"
            >
              <Square className="size-3.5" />
              Stop &amp; finish
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
        </div>
      </footer>
    </section>
  );
}

function DropZone({
  onPick,
  fileInputRef,
}: {
  onPick: (file: File | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <label
      htmlFor="lift-upload-file"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0] ?? null;
        onPick(file);
      }}
      className={
        "absolute inset-0 grid cursor-pointer place-items-center bg-zinc-950/80 text-center text-sm text-zinc-200 backdrop-blur-sm transition " +
        (dragOver ? "ring-2 ring-sky-400/60 ring-offset-0" : "")
      }
    >
      <input
        id="lift-upload-file"
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_MIME}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="sr-only"
      />
      <div className="flex max-w-sm flex-col items-center gap-2 px-6">
        <Upload className="size-6 text-sky-300" />
        <p className="font-medium text-zinc-100">
          Drop a video here, or click to choose
        </p>
        <p className="text-[11px] text-zinc-500">
          .mp4 / .mov / .webm — up to 200 MB. Stays on your device.
        </p>
      </div>
    </label>
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
    <div className="absolute inset-0 grid place-items-center bg-zinc-950/80 text-center text-sm text-zinc-200 backdrop-blur-sm">
      <div className="flex max-w-sm flex-col items-center gap-2 px-6">
        {icon}
        {children}
      </div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-md border border-white/10 bg-zinc-950/70 px-3 py-1.5 backdrop-blur-sm">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-sky-400/80 transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-[10px] text-zinc-300">{pct}%</span>
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
