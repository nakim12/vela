"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

const NAV = [
  { href: "/onboarding", label: "Onboarding" },
  { href: "/sessions", label: "Sessions" },
  { href: "/coach", label: "Coach" },
  { href: "/lift/squat", label: "Live capture" },
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
          <Link href="/" className="inline-flex items-center gap-2.5 p-2">
            <span className="grid size-7 place-items-center rounded-md border border-white/30 bg-white/10 text-white">
              <span className="size-1.5 rounded-full bg-white" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Vela</span>
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
                    "transition " +
                    (active ? "text-white" : "hover:text-zinc-100")
                  }
                >
                  {item.label}
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
