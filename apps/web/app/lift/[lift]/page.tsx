import Link from "next/link";
import type { Lift } from "@romus/shared-types";

import { AppHeader } from "@/components/AppHeader";
import { TodayPlanBanner } from "@/components/TodayPlanBanner";

const lifts: Lift[] = ["squat", "bench", "deadlift"];

function isLift(s: string): s is Lift {
  return lifts.includes(s as Lift);
}

export default async function LiftPage({
  params,
}: {
  params: Promise<{ lift: string }>;
}) {
  const { lift } = await params;
  if (!isLift(lift)) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <AppHeader />
        <main className="mx-auto max-w-lg p-8">
          <p>Unknown lift. Use squat, bench, or deadlift.</p>
          <Link href="/" className="mt-4 inline-block text-sky-400 underline">
            Home
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400/90">
            Lift
          </p>
          <h1 className="mt-1 text-3xl font-semibold capitalize tracking-tight">
            {lift}
          </h1>
        </div>

        <TodayPlanBanner lift={lift} />

        <section className="rounded-2xl border border-dashed border-white/10 bg-zinc-900/30 p-6 text-sm text-zinc-500">
          Live capture — MediaPipe overlay and rules engine land here next.
        </section>
      </main>
    </div>
  );
}
