"use client";

/**
 * Coach chat page.
 *
 * The same Backboard assistant that runs in-set is exposed here for
 * conversational follow-up — "why did my knee cave more on the left?"
 * "what should I focus on next session?" — between workouts. The
 * agent has access to the user's knowledge graph and the corpus, so
 * answers are personalized.
 *
 * The page is presentational; the heavy lifting (memory pulls,
 * corpus search, prompt construction) lives behind
 * `POST /api/coach/message`. We render markdown replies with the
 * same prose treatment the session report uses, so the coach's
 * voice feels consistent across surfaces.
 *
 * State machine:
 *   idle → user submits → optimistic user bubble → loading bubble →
 *   coach bubble (or error banner) → idle.
 *
 * The "thinking" state is rendered as a coach bubble of its own —
 * with three pulsing dots — so the UI never collapses to a thin
 * inline loader; the chat geometry stays steady.
 */

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useUser } from "@clerk/nextjs";
import { Loader2, Send, Sparkles, Trash2, User as UserIcon } from "lucide-react";

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
  const { user } = useUser();
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

  function clearConversation() {
    if (turns.length === 0) return;
    if (!confirm("Clear this conversation?")) return;
    setTurns([]);
    setError(null);
  }

  const userInitial = (
    user?.firstName?.[0] ??
    user?.username?.[0] ??
    user?.primaryEmailAddress?.emailAddress?.[0] ??
    "Y"
  ).toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">
              Coach
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Chat outside a workout
            </h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-500">
              Backed by the same Backboard assistant that runs in-set. It can
              pull your training memory and the research corpus mid-reply,
              so questions about <em>your</em> history get personalized
              answers.
            </p>
          </div>
          {turns.length > 0 && (
            <button
              type="button"
              onClick={clearConversation}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-zinc-400 transition hover:border-red-400/30 hover:text-red-300"
            >
              <Trash2 className="size-3" />
              Clear
            </button>
          )}
        </div>

        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.015] p-5 min-h-[420px] max-h-[calc(100vh-360px)]"
        >
          {turns.length === 0 && !pending ? (
            <EmptyState onPick={send} />
          ) : null}

          {turns.map((turn) => (
            <Bubble
              key={turn.id}
              turn={turn}
              userInitial={userInitial}
            />
          ))}

          {pending && <ThinkingBubble />}
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
            className="flex-1 rounded-md border border-white/10 bg-zinc-900/80 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-white/35 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            aria-label="Send message"
            className="inline-flex items-center gap-1.5 rounded-md bg-white px-4 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Send
          </button>
        </form>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bubbles
// ---------------------------------------------------------------------------

function Bubble({
  turn,
  userInitial,
}: {
  turn: Turn;
  userInitial: string;
}) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end gap-2.5">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm border border-white/25 bg-white/[0.08] px-4 py-3 text-sm leading-relaxed text-zinc-50">
          {turn.content}
        </div>
        <Avatar variant="user">{userInitial}</Avatar>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-2.5">
      <Avatar variant="coach" />
      <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm leading-relaxed text-zinc-100">
        {/* Markdown styles deliberately mirror the session report page so
            the coach's "voice" feels consistent across surfaces. */}
        <div className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-headings:text-zinc-100 prose-strong:text-zinc-100 prose-code:text-zinc-200 prose-a:text-zinc-300 prose-li:my-1">
          <ReactMarkdown>{turn.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

/**
 * Three pulsing dots inside a coach-styled bubble. Matches the
 * geometry of a real coach turn so the conversation doesn't visually
 * "jump" between the loader and the eventual reply.
 */
function ThinkingBubble() {
  return (
    <div
      className="flex justify-start gap-2.5"
      aria-live="polite"
      aria-label="Coach is thinking"
    >
      <Avatar variant="coach" />
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-white/10 bg-zinc-900/60 px-4 py-3.5">
        <span className="size-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-pulse rounded-full bg-zinc-400" />
      </div>
    </div>
  );
}

function Avatar({
  variant,
  children,
}: {
  variant: "coach" | "user";
  children?: React.ReactNode;
}) {
  if (variant === "coach") {
    return (
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-md border border-white/20 bg-white/10 text-zinc-200"
      >
        <Sparkles className="size-3.5" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-md border border-white/15 bg-white/[0.06] font-mono text-xs font-semibold text-zinc-200"
    >
      {children ?? <UserIcon className="size-3.5" />}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <span className="grid size-10 place-items-center rounded-xl border border-white/20 bg-white/10 text-zinc-200">
        <Sparkles className="size-4" />
      </span>
      <p className="mt-3 text-sm font-medium text-zinc-200">
        Ask the coach
      </p>
      <p className="mt-1 max-w-md text-xs text-zinc-500">
        I can read your training memory and the research corpus to ground my
        answers. Try one of these to get started:
      </p>
      <div className="mt-5 grid w-full max-w-lg gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="group flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-100"
          >
            <span>{s}</span>
            <Send className="size-3 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-300" />
          </button>
        ))}
      </div>
    </div>
  );
}
