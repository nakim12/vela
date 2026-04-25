import Link from "next/link";

export default function CoachPage() {
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold">Coach</h1>
      <p className="mt-2 text-neutral-600">
        Chat with your Backboard assistant outside a workout (Milestone 2+).
      </p>
      <Link href="/" className="mt-6 inline-block text-blue-600 underline">
        Home
      </Link>
    </main>
  );
}
