import Link from "next/link";

export default function OnboardingPage() {
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold">Onboarding</h1>
      <p className="mt-2 text-neutral-600">
        Mobility and injury seed for the knowledge graph (Milestone 4).
      </p>
      <Link href="/" className="mt-6 inline-block text-blue-600 underline">
        Home
      </Link>
    </main>
  );
}
