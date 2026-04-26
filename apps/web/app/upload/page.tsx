"use client";

/**
 * `/upload` — analyze a pre-recorded lift video without ever touching
 * the camera.
 *
 * Lift selection lives on this page (not in the URL) because most
 * users land here from the marketing CTA on `/`, where we don't yet
 * know what they recorded. Picking the lift before clicking Analyze
 * keeps the rules engine pointing at the right rule set
 * (`createEngine({ lift, ... })`).
 *
 * The actual analysis lives in `<LiftUpload />`. This page is mostly
 * a layout shell + lift picker; we re-mount the component when the
 * lift changes so any in-flight state is dropped cleanly.
 */

import { useState } from "react";
import type { Lift } from "@vela/shared-types";

import { AppHeader } from "@/components/AppHeader";
import { LiftUpload } from "@/components/LiftUpload";

const LIFTS: Lift[] = ["squat", "bench", "deadlift"];

export default function UploadPage() {
  const [lift, setLift] = useState<Lift>("squat");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">
              Upload
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Analyze a recorded lift
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Drop in a video of a set you already filmed. We&rsquo;ll run the
              same rules engine the live view uses — events, rep count,
              and a coach&rsquo;s report at the end.
            </p>
          </div>
          <LiftPicker value={lift} onChange={setLift} />
        </div>

        {/* Re-mount on lift change so refs / state from a half-finished
            analysis can't bleed across into a new lift's rules. */}
        <LiftUpload key={lift} lift={lift} />
      </main>
    </div>
  );
}

function LiftPicker({
  value,
  onChange,
}: {
  value: Lift;
  onChange: (next: Lift) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900/40 p-1">
      {LIFTS.map((l) => {
        const active = l === value;
        return (
          <button
            key={l}
            type="button"
            onClick={() => onChange(l)}
            aria-pressed={active}
            className={
              "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition " +
              (active
                ? "bg-sky-400/15 text-sky-100 shadow-inner shadow-sky-400/10"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200")
            }
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
