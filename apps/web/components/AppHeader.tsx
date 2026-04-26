"use client";

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

        <UserButton
          appearance={{
            elements: {
              avatarBox: "size-8",
            },
          }}
        />
      </div>
    </header>
  );
}
