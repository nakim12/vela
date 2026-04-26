"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DEMO_USERS, useUserStore } from "@/lib/store/user";

const NAV = [
  { href: "/onboarding", label: "Onboarding" },
  { href: "/sessions", label: "Sessions" },
  { href: "/coach", label: "Coach" },
  { href: "/lift/squat", label: "Live capture" },
] as const;

/**
 * Header used on every "app" page (onboarding, sessions, coach). Shows the
 * route nav plus the active-user picker. The picker writes through Zustand
 * + localStorage, so every API call downstream reads `useUserStore().userId`.
 *
 * Intentionally NOT used on `/` — the landing page has its own marketing
 * nav and doesn't need the picker.
 */
export function AppHeader() {
  const pathname = usePathname();
  const userId = useUserStore((s) => s.userId);
  const setUserId = useUserStore((s) => s.setUserId);

  const isCustom = !DEMO_USERS.some((u) => u.id === userId);

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-zinc-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-md border border-sky-400/30 bg-sky-400/10 text-sky-300">
              <span className="size-1.5 rounded-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.5)]" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Vela</span>
          </Link>
          <nav className="hidden items-center gap-5 text-sm text-zinc-400 md:flex">
            {NAV.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    "transition " +
                    (active ? "text-sky-300" : "hover:text-zinc-100")
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500">acting as</span>
          <select
            value={isCustom ? "__custom__" : userId}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                const next = window.prompt(
                  "Enter a user_id (e.g. an email-like string):",
                  isCustom ? userId : "",
                );
                if (next) setUserId(next);
                return;
              }
              setUserId(e.target.value);
            }}
            className="rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-zinc-100 outline-none focus:border-sky-400/40"
          >
            {DEMO_USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
            <option value="__custom__">
              {isCustom ? `Custom · ${userId}` : "Custom user_id…"}
            </option>
          </select>
        </div>
      </div>
    </header>
  );
}
