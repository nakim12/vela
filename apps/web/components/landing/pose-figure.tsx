type Joint = { id: string; x: number; y: number; label?: string; severity?: "ok" | "warn" | "high" };

const joints: Joint[] = [
  { id: "head", x: 198, y: 60 },
  { id: "lShoulder", x: 168, y: 110, severity: "ok" },
  { id: "rShoulder", x: 228, y: 110, severity: "ok" },
  { id: "lElbow", x: 138, y: 168 },
  { id: "rElbow", x: 258, y: 168 },
  { id: "lWrist", x: 118, y: 220 },
  { id: "rWrist", x: 278, y: 220 },
  { id: "lHip", x: 178, y: 220, severity: "ok" },
  { id: "rHip", x: 218, y: 220, severity: "ok" },
  { id: "lKnee", x: 158, y: 312, severity: "high", label: "knee_cave  +8.4°" },
  { id: "rKnee", x: 238, y: 312, severity: "warn" },
  { id: "lAnkle", x: 168, y: 400, severity: "ok" },
  { id: "rAnkle", x: 228, y: 400, severity: "ok" },
];

const bones: [string, string][] = [
  ["head", "lShoulder"],
  ["head", "rShoulder"],
  ["lShoulder", "rShoulder"],
  ["lShoulder", "lElbow"],
  ["lElbow", "lWrist"],
  ["rShoulder", "rElbow"],
  ["rElbow", "rWrist"],
  ["lShoulder", "lHip"],
  ["rShoulder", "rHip"],
  ["lHip", "rHip"],
  ["lHip", "lKnee"],
  ["lKnee", "lAnkle"],
  ["rHip", "rKnee"],
  ["rKnee", "rAnkle"],
];

const severityColor: Record<NonNullable<Joint["severity"]>, string> = {
  ok: "#a3e635",
  warn: "#facc15",
  high: "#f87171",
};

export function PoseFigure() {
  const byId = Object.fromEntries(joints.map((j) => [j.id, j]));
  return (
    <svg
      viewBox="0 0 400 460"
      role="img"
      aria-label="Annotated pose skeleton mid-squat"
      className="h-full w-full"
    >
      <defs>
        <radialGradient id="poseGlow" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="rgba(163,230,53,0.20)" />
          <stop offset="100%" stopColor="rgba(163,230,53,0)" />
        </radialGradient>
        <linearGradient id="boneGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a3e635" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.85" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="400" height="460" fill="url(#poseGlow)" />

      <g stroke="rgba(244,244,245,0.06)" strokeWidth="1">
        {Array.from({ length: 9 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 50} y1="0" x2={i * 50} y2="460" />
        ))}
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 50} x2="400" y2={i * 50} />
        ))}
      </g>

      <g
        stroke="url(#boneGrad)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.95"
      >
        {bones.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={byId[a].x}
            y1={byId[a].y}
            x2={byId[b].x}
            y2={byId[b].y}
          />
        ))}
      </g>

      {joints.map((j) => {
        const c = j.severity ? severityColor[j.severity] : "#e4e4e7";
        return (
          <g key={j.id}>
            {j.severity === "high" ? (
              <circle cx={j.x} cy={j.y} r="14" fill={c} opacity="0.18">
                <animate
                  attributeName="r"
                  values="10;18;10"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.35;0.05;0.35"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
              </circle>
            ) : null}
            <circle cx={j.x} cy={j.y} r="5" fill={c} />
            <circle
              cx={j.x}
              cy={j.y}
              r="2"
              fill="#0a0a0a"
              opacity="0.7"
            />
          </g>
        );
      })}

      <g
        fontFamily="ui-sans-serif, system-ui"
        fontSize="11"
        fontWeight="500"
      >
        <g transform="translate(36 296)">
          <rect
            width="120"
            height="26"
            rx="6"
            fill="rgba(248,113,113,0.12)"
            stroke="rgba(248,113,113,0.5)"
          />
          <text x="10" y="17" fill="#fca5a5">
            knee_cave  +8.4°
          </text>
        </g>
        <g transform="translate(252 102)">
          <rect
            width="124"
            height="26"
            rx="6"
            fill="rgba(163,230,53,0.10)"
            stroke="rgba(163,230,53,0.45)"
          />
          <text x="10" y="17" fill="#bef264">
            torso_angle  42°
          </text>
        </g>
        <g transform="translate(38 196)">
          <rect
            width="118"
            height="26"
            rx="6"
            fill="rgba(34,211,238,0.08)"
            stroke="rgba(34,211,238,0.45)"
          />
          <text x="10" y="17" fill="#67e8f9">
            hip_depth  −38 cm
          </text>
        </g>
      </g>
    </svg>
  );
}
