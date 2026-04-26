"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { motion } from "framer-motion";

const NAV = [
  { href: "/onboarding", label: "Onboarding" },
  { href: "/sessions", label: "Sessions" },
  { href: "/coach", label: "Coach" },
  { href: "/lift/squat", label: "Live capture" },
  { href: "/upload", label: "Upload" },
  { href: "/settings", label: "Settings" },
] as const;

/**
 * Header used on every "app" page (onboarding, sessions, coach). Shows the
 * route nav plus a Clerk `<UserButton>` for sign-out / account management.
 *
 * Identity for every API call comes from the Clerk session token attached
 * by the `useApi()` hook in `lib/api-client/`. There's no per-page user
 * picker anymore — all routes resolve `current_user_id` from the JWT.
 *
 * Intentionally NOT used on `/` — the landing page has its own marketing
 * nav (with its own `<UserButton>`) and doesn't need this shell.
 */
export function AppHeader() {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header
        className={
          "fixed inset-x-0 top-0 z-50 transition-all duration-500 " +
          (isScrolled ? "px-3 pt-2" : "px-0 pt-0")
        }
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
      <div
        role="presentation"
        className={
          "mx-auto border bg-zinc-900/70 backdrop-blur-xl transition-[width,border-radius,transform,box-shadow,background-color,border-color] duration-700 " +
          (isScrolled
            ? "translate-y-0 border-white/15 shadow-[0_14px_34px_-18px_rgba(0,0,0,0.78)]"
            : "border-white/10 shadow-none")
        }
        style={{
          width: isScrolled ? "min(72rem, calc(100% - 1.5rem))" : "100%",
          borderRadius: isScrolled ? "1rem" : "0rem",
          transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
          transitionProperty:
            "width, border-radius, transform, box-shadow, background-color, border-color",
          transitionDuration: isScrolled
            ? "700ms, 700ms, 700ms, 700ms, 700ms, 700ms"
            : "700ms, 180ms, 700ms, 700ms, 700ms, 700ms",
          transitionDelay: isScrolled
            ? "0ms, 0ms, 0ms, 0ms, 0ms, 0ms"
            : "0ms, 520ms, 0ms, 0ms, 0ms, 0ms",
        }}
      >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="inline-flex h-10 items-center p-2">
            <img
              src="/romus-logo.svg"
              alt="Romus"
              className="h-auto w-[72px] bg-transparent object-contain invert"
              draggable={false}
            />
          </Link>
          <nav className="hidden items-center gap-5 text-sm text-zinc-300 md:flex">
            {NAV.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    "relative isolate inline-flex h-10 items-center justify-center rounded-md px-3 leading-none transition-colors duration-300 " +
                    (active
                      ? "text-white"
                      : "text-zinc-300 hover:bg-white/[0.04] hover:text-zinc-100")
                  }
                >
                  {active && (
                    <motion.span
                      layoutId="app-nav-active-pill"
                      className="absolute inset-0 rounded-md border border-white/20 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_24px_-18px_rgba(255,255,255,0.75)]"
                      initial={false}
                      style={{ willChange: "transform" }}
                      transition={{
                        type: "spring",
                        stiffness: 320,
                        damping: 36,
                        mass: 0.9,
                        bounce: 0.18,
                      }}
                    />
                  )}
                  <span
                    className={
                      "relative z-10 " +
                      (active ? "[text-shadow:0_0_9px_rgba(255,255,255,0.4)]" : "")
                    }
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>

        <UserButton
          appearance={{
            elements: {
              avatarBox: "size-8",
            },
          }}
        />
      </div>
      </div>
      </header>
      <div className="h-[76px]" aria-hidden />
    </>
  );
}
