import Link from "next/link";

export default function SessionsPage() {
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold">Sessions</h1>
      <p className="mt-2 text-neutral-600">History and charts (Milestone 2+).</p>
      <Link href="/" className="mt-6 inline-block text-blue-600 underline">
        Home
      </Link>
    </main>
  );
}
