"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

function FloatingPaths({ position }: { position: number }) {
  const paths = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => {
        const offsetX = i * 5 * position;
        const offsetY = i * 6;

        const startX = -(380 - offsetX);
        const startY = -(189 + offsetY);
        const midX = 152 - offsetX;
        const midY = 343 - offsetY;
        const endX = 684 - offsetX;
        const endY = 875 - offsetY;

        // Preserve the original composition, but enforce smooth tangent
        // continuity through the midpoint to remove visible kinks.
        const c1x = startX;
        const c1y = startY;
        const c2x = -(312 - offsetX);
        const c2y = 216 - offsetY;
        const c3x = 2 * midX - c2x;
        const c3y = 2 * midY - c2y;
        const c4x = endX;
        const c4y = endY;

        return {
          id: i,
          d: `M${startX} ${startY} C${c1x} ${c1y}, ${c2x} ${c2y}, ${midX} ${midY} C${c3x} ${c3y}, ${c4x} ${c4y}, ${endX} ${endY}`,
          width: 0.2 + i * 0.014,
          duration: 10 + i * 0.18,
        };
      }),
    [position],
  );

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        className="h-full w-full text-slate-950 dark:text-white"
        viewBox="0 0 696 316"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        <title>Background Paths</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.12 + path.id * 0.01}
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={{ pathLength: 0.2, opacity: 0.24 }}
            animate={{
              pathLength: [0.2, 0.9, 0.2],
              opacity: [0.2, 0.44, 0.2],
            }}
            transition={{
              duration: path.duration,
              repeat: Number.POSITIVE_INFINITY,
              repeatType: "mirror",
              ease: "linear",
            }}
          />
        ))}
      </svg>
    </div>
  );
}

export function BackgroundPaths() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden opacity-44"
    >
      <FloatingPaths position={1} />
      <FloatingPaths position={-1} />
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/18 via-zinc-950/40 to-zinc-950/86" />
    </div>
  );
}
