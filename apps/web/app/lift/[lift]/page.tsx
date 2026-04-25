import Link from "next/link";
import type { Lift } from "@vela/shared-types";

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
      <main className="mx-auto max-w-lg p-8">
        <p>Unknown lift. Use squat, bench, or deadlift.</p>
        <Link href="/">Home</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold capitalize">{lift}</h1>
      <p className="mt-2 text-neutral-600">
        Live capture — MediaPipe overlay and rules land here (Milestone 0–1).
      </p>
      <Link href="/" className="mt-6 inline-block text-blue-600 underline">
        Home
      </Link>
    </main>
  );
}
