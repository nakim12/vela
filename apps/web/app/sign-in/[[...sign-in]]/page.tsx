import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-16">
      <SignIn />
    </main>
  );
}
