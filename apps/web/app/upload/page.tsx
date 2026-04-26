import Link from "next/link";

export default function UploadPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-lg p-8">
        <h1 className="text-2xl font-semibold">Upload</h1>
        <p className="mt-2 text-zinc-400">
          Video upload and annotated playback (Milestone 3).
        </p>
        <Link href="/" className="mt-6 inline-block text-zinc-200 underline">
          Home
        </Link>
      </div>
    </main>
  );
}
