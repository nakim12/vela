import Link from "next/link";
import { ArrowRight, Gauge, Target } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";

const SECTIONS = [
  {
    href: "/settings/thresholds",
    icon: Gauge,
    title: "Rule thresholds",
    blurb:
      "Per-rule sensitivity overrides for the in-set rules engine. Your coach " +
      "writes here automatically as it learns your tolerances; tweak them " +
      "directly when needed.",
  },
  {
    href: "/settings/programs",
    icon: Target,
    title: "Program targets",
    blurb:
      "Working weight × reps × sets per lift. The post-set agent updates " +
      "these via recommend_load; override here if you want to set the bar " +
      "yourself for a session.",
  },
] as const;

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">
            Settings
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Your coaching configuration
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Most of this is written by your coach as part of normal sessions.
            Use these screens to inspect or override what the agent decided.
          </p>
        </header>

        <ul className="space-y-3">
          {SECTIONS.map(({ href, icon: Icon, title, blurb }) => (
            <li key={href}>
              <Link
                href={href}
                className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-white/30 hover:bg-white/[0.04]"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-white/20 bg-white/10 text-zinc-300">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-zinc-100">
                      {title}
                    </h2>
                    <ArrowRight className="size-4 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-300" />
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                    {blurb}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
