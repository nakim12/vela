import Link from "next/link";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold">Session {id}</h1>
      <p className="mt-2 text-neutral-600">Replay and report (Milestone 2+).</p>
      <Link href="/sessions" className="mt-6 inline-block text-blue-600 underline">
        All sessions
      </Link>
    </main>
  );
}
