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

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/" +
  "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

let _landmarkerPromise: Promise<PoseLandmarker> | null = null;

/** Lazy-load and memoize the pose landmarker. Safe to call from multiple
 *  components — every caller awaits the same in-flight promise. */
export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!_landmarkerPromise) {
    _landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });
      return landmarker;
    })();
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
