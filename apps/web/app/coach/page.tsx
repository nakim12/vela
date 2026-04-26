"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Loader2, Send } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { ApiError, postCoachMessage, useApi } from "@/lib/api-client";

type Turn = {
  role: "user" | "coach";
  content: string;
  /** Backend doesn't echo a per-turn id, so we generate one for React keys. */
  id: number;
};

const SUGGESTIONS = [
  "How should I approach my next squat session?",
  "What did you learn about my form last session?",
  "Why did my knee cave more on the left side?",
  "What's the difference between internal and external cues for me?",
] as const;

export default function CoachPage() {
  const api = useApi();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns, pending]);

  async function send(message: string) {
    const text = message.trim();
    if (!text || pending) return;
    setError(null);
    setDraft("");
    setTurns((t) => [
      ...t,
      { role: "user", content: text, id: nextId.current++ },
    ]);
    setPending(true);
    try {
      const res = await postCoachMessage(api, { message: text });
      setTurns((t) => [
        ...t,
        { role: "coach", content: res.reply, id: nextId.current++ },
      ]);
    } catch (err) {
      const detail =
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : "Unknown error";
      setError(detail);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400/90">
            Coach
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Chat outside a workout
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Backed by the same Backboard assistant that runs in-set. The
            agent can call <code className="font-mono text-xs text-zinc-400">query_user_kg</code> and{" "}
            <code className="font-mono text-xs text-zinc-400">search_research</code> mid-conversation,
            so questions about <em>your</em> history get personalized answers.
          </p>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.015] p-5"
          style={{ minHeight: "400px", maxHeight: "calc(100vh - 360px)" }}
        >
          {turns.length === 0 && !pending && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-sm text-zinc-500">
                Say hello, or try one of these:
              </p>
              <div className="mt-4 grid w-full max-w-lg gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-zinc-300 transition hover:border-sky-400/30 hover:bg-sky-400/[0.04] hover:text-sky-100"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn) => (
            <Bubble key={turn.id} turn={turn} />
          ))}

          {pending && (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="size-3.5 animate-spin text-sky-400/80" />
              Coach is thinking…
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
            <span className="font-mono text-[10px] uppercase tracking-wider text-red-300">
              error
            </span>{" "}
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="mt-4 flex gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask anything about your training…"
            disabled={pending}
            className="flex-1 rounded-md border border-white/10 bg-zinc-900/80 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-sky-400/40 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-400 px-4 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-sky-300 disabled:opacity-50"
          >
            <Send className="size-4" />
            Send
          </button>
        </form>
      </main>
    </div>
  );
}

function Bubble({ turn }: { turn: Turn }) {
  const isUser = turn.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          "max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed " +
          (isUser
            ? "border border-sky-400/30 bg-sky-400/[0.08] text-sky-50"
            : "border border-white/10 bg-zinc-900/60 text-zinc-100")
        }
      >
        {isUser ? (
          turn.content
        ) : (
          <div className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-headings:text-zinc-100 prose-strong:text-sky-200 prose-code:text-sky-300 prose-a:text-sky-400">
            <ReactMarkdown>{turn.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
