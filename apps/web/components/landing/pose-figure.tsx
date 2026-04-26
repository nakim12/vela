 "use client";

import { useEffect, useMemo, useState } from "react";

type Severity = "ok" | "warn" | "high";
type JointId = "head" | "shoulder" | "elbow" | "wrist" | "hip" | "knee" | "ankle";

type JointMeta = { id: JointId; severity?: Severity };
type PoseFrame = Record<JointId, { x: number; y: number }>;
type Point = { x: number; y: number };

const CYCLE_MS = 4200;

const joints: JointMeta[] = [
  { id: "head" },
  { id: "shoulder", severity: "ok" },
  { id: "elbow" },
  { id: "wrist" },
  { id: "hip", severity: "ok" },
  { id: "knee", severity: "high" },
  { id: "ankle" },
];

const bones: [JointId, JointId][] = [
  ["head", "shoulder"],
  ["shoulder", "elbow"],
  ["elbow", "wrist"],
  ["shoulder", "hip"],
  ["hip", "knee"],
  ["knee", "ankle"],
];

const BODY = {
  shank: 86,
  thigh: 88,
  torso: 96,
  neck: 54,
  upperArm: 56,
  forearm: 54,
} as const;

const ANKLE_ANCHOR: Point = { x: 224, y: 404 };

const severityColor: Record<Severity, string> = {
  ok: "#a3e635",
  warn: "#facc15",
  high: "#f87171",
};
const nonCardJointColor = "#d4d4d8";

type CardTone = {
  fill: string;
  stroke: string;
  text: string;
};

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function mix(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

function toRgba(r: number, g: number, b: number, a: number) {
  return `rgba(${r},${g},${b},${a})`;
}

function mixColor(
  start: [number, number, number],
  mid: [number, number, number],
  end: [number, number, number],
  t: number,
) {
  const clamped = clamp01(t);
  if (clamped <= 0.5) {
    const local = clamped * 2;
    return [
      mix(start[0], mid[0], local),
      mix(start[1], mid[1], local),
      mix(start[2], mid[2], local),
    ] as const;
  }
  const local = (clamped - 0.5) * 2;
  return [
    mix(mid[0], end[0], local),
    mix(mid[1], end[1], local),
    mix(mid[2], end[2], local),
  ] as const;
}

function toneFromSeverity(severity: number): CardTone {
  // good -> warning -> risk (green -> yellow -> red)
  const [r, g, b] = mixColor([163, 230, 53], [250, 204, 21], [248, 113, 113], severity);
  return {
    fill: toRgba(r, g, b, 0.08),
    stroke: toRgba(r, g, b, 0.42),
    text: toRgba(r, g, b, 1),
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function pointFrom(origin: Point, length: number, angleDeg: number): Point {
  const r = degToRad(angleDeg);
  return {
    x: origin.x + Math.cos(r) * length,
    y: origin.y + Math.sin(r) * length,
  };
}

function phaseDepth(progress: number) {
  // 0 -> 1 -> 0 over each rep, smooth at the ends.
  return 0.5 - 0.5 * Math.cos(progress * 2 * Math.PI);
}

function angleBetweenDeg(a: Point, b: Point, c: Point) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAb = Math.hypot(ab.x, ab.y);
  const magCb = Math.hypot(cb.x, cb.y);
  const cosine = Math.max(-1, Math.min(1, dot / (magAb * magCb)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

function samplePose(progress: number): PoseFrame {
  const depth = phaseDepth(progress);

  // Fixed-length kinematics, anchored foot.
  const shinAngle = lerp(-86, -72, depth);
  const thighAngle = lerp(-100, -132, depth);
  const torsoAngle = lerp(-83, -60, depth);
  const neckAngle = lerp(-83, -70, depth);
  const upperArmAngle = lerp(63, 50, depth);
  const forearmAngle = lerp(70, 58, depth);

  const ankle = ANKLE_ANCHOR;
  const knee = pointFrom(ankle, BODY.shank, shinAngle);
  const hip = pointFrom(knee, BODY.thigh, thighAngle);
  const shoulder = pointFrom(hip, BODY.torso, torsoAngle);
  const head = pointFrom(shoulder, BODY.neck, neckAngle);
  const elbow = pointFrom(shoulder, BODY.upperArm, upperArmAngle);
  const wrist = pointFrom(elbow, BODY.forearm, forearmAngle);

  return {
    head,
    shoulder,
    elbow,
    wrist,
    hip,
    knee,
    ankle,
  };
}

export function PoseFigure() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let rafId = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = (now - start) % CYCLE_MS;
      setProgress(elapsed / CYCLE_MS);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const pose = useMemo(() => samplePose(progress), [progress]);
  const kneeAngle = Math.round(angleBetweenDeg(pose.hip, pose.knee, pose.ankle));
  const torsoLean = Math.round(Math.abs(90 + (Math.atan2(pose.shoulder.y - pose.hip.y, pose.shoulder.x - pose.hip.x) * 180) / Math.PI));
  const hipFlexion = Math.round(angleBetweenDeg(pose.shoulder, pose.hip, pose.knee));
  const pulse = (Math.sin((progress * Math.PI * 2 * CYCLE_MS) / 800) + 1) / 2;
  const highRadius = 8 + pulse * 5;
  const highOpacity = 0.05 + pulse * 0.12;

  const kneeSeverity = clamp01((160 - kneeAngle) / 40);
  const torsoSeverity = clamp01((torsoLean - 24) / 16);
  const hipSeverity = clamp01((hipFlexion - 100) / 24);

  const kneeTone = toneFromSeverity(kneeSeverity);
  const torsoTone = toneFromSeverity(torsoSeverity);
  const hipTone = toneFromSeverity(hipSeverity);

  return (
    <svg
      viewBox="0 0 400 460"
      role="img"
      aria-label="Animated side-view squat skeleton demo"
      className="h-full w-full"
    >
      <g stroke="rgba(244,244,245,0.06)" strokeWidth="1">
        {Array.from({ length: 9 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 50} y1="0" x2={i * 50} y2="460" />
        ))}
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 50} x2="400" y2={i * 50} />
        ))}
      </g>

      <g
        stroke="rgba(228,228,231,0.28)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.9"
      >
        {bones.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={pose[a].x}
            y1={pose[a].y}
            x2={pose[b].x}
            y2={pose[b].y}
          />
        ))}
      </g>

      {joints.map((j) => {
        const c = j.severity ? severityColor[j.severity] : nonCardJointColor;
        return (
          <g key={j.id}>
            {j.severity === "high" ? (
              <circle
                cx={pose[j.id].x}
                cy={pose[j.id].y}
                r={highRadius}
                fill={c}
                opacity={highOpacity}
              />
            ) : null}
            <circle cx={pose[j.id].x} cy={pose[j.id].y} r="5" fill={c} />
            <circle
              cx={pose[j.id].x}
              cy={pose[j.id].y}
              r="2"
              fill="#0a0a0a"
              opacity="0.7"
            />
          </g>
        );
      })}

      <g
        fontFamily="ui-sans-serif, system-ui"
        fontSize="10"
        fontWeight="500"
      >
        <g transform={`translate(${pose.knee.x - 164} ${pose.knee.y - 12})`}>
          <rect
            width="138"
            height="26"
            rx="6"
            fill={kneeTone.fill}
            stroke={kneeTone.stroke}
          />
          <text x="10" y="17" fill={kneeTone.text}>knee_track</text>
          <text x="92" y="17" fill={kneeTone.text}>{kneeAngle}°</text>
        </g>
        <g transform={`translate(${pose.shoulder.x + 34} ${pose.shoulder.y - 30})`}>
          <rect
            width="132"
            height="26"
            rx="6"
            fill={torsoTone.fill}
            stroke={torsoTone.stroke}
          />
          <text x="10" y="17" fill={torsoTone.text}>torso_stack</text>
          <text x="88" y="17" fill={torsoTone.text}>{torsoLean}°</text>
        </g>
        <g transform={`translate(${pose.hip.x - 166} ${pose.hip.y - 26})`}>
          <rect
            width="140"
            height="26"
            rx="6"
            fill={hipTone.fill}
            stroke={hipTone.stroke}
          />
          <text x="10" y="17" fill={hipTone.text}>hip_depth</text>
          <text x="90" y="17" fill={hipTone.text}>{hipFlexion}°</text>
        </g>
      </g>
    </svg>
  );
}
