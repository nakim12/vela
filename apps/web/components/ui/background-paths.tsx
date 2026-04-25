"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

function FloatingPaths({ position }: { position: number }) {
  const paths = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
          380 - i * 5 * position
        } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
          152 - i * 5 * position
        } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
          684 - i * 5 * position
        } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
        width: 0.28 + i * 0.018,
        duration: 12 + i * 0.2,
      })),
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
            strokeOpacity={0.18 + path.id * 0.012}
            initial={{ pathLength: 0.2, opacity: 0.34 }}
            animate={{
              pathLength: [0.2, 0.9, 0.2],
              opacity: [0.3, 0.58, 0.3],
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
      className="pointer-events-none absolute inset-0 overflow-hidden opacity-52"
    >
      <FloatingPaths position={1} />
      <FloatingPaths position={-1} />
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/12 via-zinc-950/32 to-zinc-950/82" />
    </div>
  );
}
