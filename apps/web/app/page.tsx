import Link from "next/link";

const nav = [
  { href: "/lift/squat", label: "Try squat demo" },
  { href: "/upload", label: "Upload video" },
  { href: "/sessions", label: "Sessions" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/coach", label: "Coach" },
] as const;

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex max-w-2xl flex-col gap-10 px-6 py-16 sm:py-24">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Hackathon build
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
            Vela
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-zinc-600">
            Personalized form analysis for the Big 3: MediaPipe in the browser,
            a deterministic rules layer, and a Claude + Backboard coach grounded
            in your long-term movement profile.
          </p>
        </div>
        <ul className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {nav.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className="inline-flex rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-sm text-zinc-500">
          Run the web app from the repo root:{" "}
          <code className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-zinc-800">
            npm run dev
          </code>
          . API:{" "}
          <code className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-zinc-800">
            cd apps/api && uvicorn main:app --reload
          </code>
          .
        </p>
      </main>
    </div>
  );
}
