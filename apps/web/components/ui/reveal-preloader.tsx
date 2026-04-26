"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

export function RevealPreloader({
  show,
  text = "lift smarter",
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
            <motion.div
              initial="hidden"
              animate="visible"
              className="flex flex-col items-center"
            >
              <motion.div
                variants={{
                  hidden: { opacity: 0, y: 40, filter: "blur(10px)" },
                  visible: {
                    opacity: 1,
                    y: 0,
                    filter: "blur(0px)",
                    transition: {
                      duration: 0.45,
                      delay: 0.06,
                      ease: [0.22, 1, 0.36, 1],
                    },
                  },
                }}
              >
                <img
                  src="/romus-logo.svg"
                  alt="Romus"
                  className="h-auto w-[148px] bg-transparent object-contain [filter:invert(1)_brightness(1.9)_contrast(1.15)]"
                  draggable={false}
                />
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
