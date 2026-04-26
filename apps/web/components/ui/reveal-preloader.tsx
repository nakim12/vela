"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

export function RevealPreloader({
  show,
  text = "Rommus",
}: {
  show: boolean;
  text?: string;
}) {
  useEffect(() => {
    if (!show) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [show]);

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          className="fixed inset-0 z-[120] bg-black"
          initial={{ y: 0, filter: "blur(0px)" }}
          animate={{ y: 0, filter: "blur(0px)" }}
          exit={{
            y: "-110%",
            filter: "blur(8px)",
            transition: {
              delay: 0.05,
              duration: 0.9,
              ease: [0.96, -0.02, 0.38, 1.01],
            },
          }}
        >
          <div className="flex h-full items-center justify-center">
            <motion.p
              initial="hidden"
              animate="visible"
              className="font-sans text-5xl font-semibold tracking-tight text-white sm:text-6xl"
            >
              {text.split("").map((char, idx) => (
                <motion.span
                  key={`${char}-${idx}`}
                  className="inline-block"
                  variants={{
                    hidden: { opacity: 0, y: 70, filter: "blur(8px)" },
                    visible: {
                      opacity: 1,
                      y: 0,
                      filter: "blur(0px)",
                      transition: {
                        duration: 0.45,
                        delay: idx * 0.07,
                        ease: [0.22, 1, 0.36, 1],
                      },
                    },
                  }}
                >
                  {char === " " ? "\u00A0" : char}
                </motion.span>
              ))}
            </motion.p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
