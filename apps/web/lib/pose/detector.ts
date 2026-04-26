/**
 * MediaPipe Pose Landmarker singleton wrapper.
 *
 * The model itself is ~3 MB and the WASM runtime is ~1.5 MB; both load
 * lazily on first call to {@link getPoseLandmarker}. Subsequent calls
 * return the same instance.
 *
 * The model task and WASM bundle are pulled from jsdelivr to avoid
 * having to vendor them into `apps/web/public`. If we end up wanting
 * fully-offline operation (e.g. for the demo over a flaky network),
 * mirror them under `/public/models/` and switch the URLs.
 */

import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

/** Pinned to a CDN-mirrored version even though the npm package is on
 *  0.10.22. jsdelivr never picked up 0.10.22 (404s on
 *  `vision_wasm_internal.js`); 0.10.21 has the same JS API surface so
 *  the small skew between npm bindings and CDN-served WASM is safe.
 *  If we ever bump npm and the same gap reappears, just point this at
 *  the latest tag that returns 200 on the CDN. */
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";

/** Pinned to version `1` rather than `latest` because Google's CDN
 *  occasionally 404s the floating "latest" alias for the lite model. */
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/" +
  "pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

let _landmarkerPromise: Promise<PoseLandmarker> | null = null;

/** Stringify whatever MediaPipe threw at us. The WASM layer sometimes
 *  rejects with raw Emscripten ints / non-Error objects, so the usual
 *  `err.message` is unreliable. Always emit something useful for the
 *  inline UI and the browser console. */
function describeError(prefix: string, err: unknown): Error {
  if (err instanceof Error) return new Error(`${prefix}: ${err.message}`);
  if (typeof err === "string") return new Error(`${prefix}: ${err}`);
  if (typeof err === "number") return new Error(`${prefix}: WASM exit ${err}`);
  try {
    return new Error(`${prefix}: ${JSON.stringify(err)}`);
  } catch {
    return new Error(`${prefix}: ${String(err)}`);
  }
}

async function buildLandmarker(): Promise<PoseLandmarker> {
  let fileset;
  try {
    fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  } catch (err) {
    console.error("[pose] FilesetResolver failed:", err);
    throw describeError("wasm load failed", err);
  }

  // Try GPU first; if the runtime can't initialize a GL/WebGPU context
  // (common on Safari and on machines without proper drivers), fall back
  // to CPU. CPU is ~5x slower per inference but tracks fine at 30fps for
  // the lite model.
  for (const delegate of ["GPU", "CPU"] as const) {
    try {
      const landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate,
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });
      console.info(`[pose] landmarker ready on ${delegate}`);
      return landmarker;
    } catch (err) {
      console.warn(`[pose] ${delegate} delegate failed:`, err);
      if (delegate === "CPU") throw describeError("model init failed", err);
    }
  }
  throw new Error("model init failed: unreachable");
}

/** Lazy-load and memoize the pose landmarker. Safe to call from multiple
 *  components — every caller awaits the same in-flight promise. */
export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!_landmarkerPromise) {
    _landmarkerPromise = buildLandmarker();
    // If the load fails, drop the promise so the next call retries. Without
    // this a transient CDN hiccup would brick the app for the session.
    _landmarkerPromise.catch(() => {
      _landmarkerPromise = null;
    });
  }
  return _landmarkerPromise;
}

export type { PoseLandmarkerResult };

/** A single 33-point body skeleton from MediaPipe in [0, 1] image-normalized
 *  space (origin top-left, x grows right, y grows down). `worldLandmarks`
 *  are the same points but in metric world space relative to the hips. */
export type PoseFrame = {
  /** Monotonic frame counter, set by the capture loop. */
  index: number;
  /** Capture timestamp in ms since epoch. */
  timestampMs: number;
  /** 33 image-space landmarks (BlazePose topology). */
  landmarks: PoseLandmarkerResult["landmarks"][number];
  /** 33 world-space landmarks if the model emitted them. */
  worldLandmarks?: PoseLandmarkerResult["worldLandmarks"][number];
};

/** BlazePose landmark indices we care about for the rules engine.
 *  See https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
 *  for the full topology. */
export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;
