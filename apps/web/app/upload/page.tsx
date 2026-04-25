import Link from "next/link";

export default function UploadPage() {
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold">Upload</h1>
      <p className="mt-2 text-neutral-600">
        Video upload and annotated playback (Milestone 3).
      </p>
      <Link href="/" className="mt-6 inline-block text-blue-600 underline">
        Home
      </Link>
    </main>
  );
}
