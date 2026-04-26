"use client";

/**
 * `/settings/programs` — working weight × reps × sets per lift.
 *
 * The post-set agent's `recommend_load` tool writes to the `programs`
 * table at the end of every session. This page surfaces those decisions
 * and lets the user override them directly when they want to push a
 * specific weight or reset progression.
 *
 * Backend: Matthew's GET/PUT /api/user/programs. There's at most one
 * row per (user, lift), and at most three lifts (squat, bench,
 * deadlift), so the UX is a fixed grid of three cards rather than a
 * dynamic list.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, Save } from "lucide-react";
import type { Lift, ProgramOut } from "@vela/shared-types";

import { AppHeader } from "@/components/AppHeader";
import { ApiError, getPrograms, putProgram, useApi } from "@/lib/api-client";

const LIFTS: Lift[] = ["squat", "bench", "deadlift"];

export default function ProgramsPage() {
  const api = useApi();
  const [programs, setPrograms] = useState<Record<Lift, ProgramOut | null>>({
    squat: null,
    bench: null,
    deadlift: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const r = await getPrograms(api);
      const next: Record<Lift, ProgramOut | null> = {
        squat: null,
        bench: null,
        deadlift: null,
      };
      for (const p of r.programs) {
        next[p.lift] = p;
      }
      setPrograms(next);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(
    lift: Lift,
    body: { weight_lb: number; reps: number; sets: number },
  ) {
    const prev = programs[lift];
    const optimistic: ProgramOut = {
      user_id: prev?.user_id ?? "self",
      lift,
      weight_lb: body.weight_lb,
      reps: body.reps,
      sets: body.sets,
      source_session_id: null,
      created_at: new Date().toISOString(),
    };
    setPrograms((p) => ({ ...p, [lift]: optimistic }));
    try {
      const saved = await putProgram(api, lift, body);
      setPrograms((p) => ({ ...p, [lift]: saved }));
    } catch (err) {
      setPrograms((p) => ({ ...p, [lift]: prev }));
      alert(`Save failed for ${lift}: ${toMessage(err)}`);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link
          href="/settings"
          className="mb-6 inline-flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-200"
        >
          <ArrowLeft className="size-3.5" />
          back to settings
        </Link>

        <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">
              Settings · Programs
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Standing program targets
            </h1>
            <p className="mt-2 max-w-prose text-sm text-zinc-500">
              One target per lift. Your coach updates these via{" "}
              <code className="font-mono text-xs text-zinc-300">
                recommend_load
              </code>{" "}
              after every session; override here to set the bar yourself.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-white/10 disabled:opacity-40"
          >
            <RefreshCw
              className={"size-3 " + (loading ? "animate-spin" : "")}
            />
            Refresh
          </button>
        </header>

        {error && (
          <div className="mb-6 rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          {LIFTS.map((lift) => (
            <ProgramCard
              key={lift}
              lift={lift}
              program={programs[lift]}
              loading={loading && !programs[lift]}
              onSave={handleSave}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function ProgramCard({
  lift,
  program,
  loading,
  onSave,
}: {
  lift: Lift;
  program: ProgramOut | null;
  loading: boolean;
  onSave: (
    lift: Lift,
    body: { weight_lb: number; reps: number; sets: number },
  ) => Promise<void>;
}) {
  const [weight, setWeight] = useState(program ? String(program.weight_lb) : "");
  const [reps, setReps] = useState(program ? String(program.reps) : "");
  const [sets, setSets] = useState(program ? String(program.sets) : "");
  const [saving, setSaving] = useState(false);

  // Re-sync local form state if the backing program changes (refresh / save).
  useEffect(() => {
    setWeight(program ? String(program.weight_lb) : "");
    setReps(program ? String(program.reps) : "");
    setSets(program ? String(program.sets) : "");
  }, [program?.weight_lb, program?.reps, program?.sets, program]);

  const dirty =
    !program ||
    weight.trim() !== String(program.weight_lb) ||
    reps.trim() !== String(program.reps) ||
    sets.trim() !== String(program.sets);

  async function handleSubmit() {
    const w = Number(weight);
    const r = Number(reps);
    const s = Number(sets);
    if (![w, r, s].every(Number.isFinite) || r < 1 || s < 1) {
      alert("Weight must be numeric; reps and sets must be positive integers.");
      return;
    }
    setSaving(true);
    try {
      await onSave(lift, {
        weight_lb: w,
        reps: Math.round(r),
        sets: Math.round(s),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">
          {lift}
        </p>
        {program ? (
          <p className="mt-1 font-mono text-[10px] text-zinc-600">
            updated {new Date(program.created_at).toLocaleString()}
            {program.source_session_id && (
              <>
                {" · "}
                <Link
                  href={`/sessions/${program.source_session_id}`}
                  className="text-zinc-300 hover:text-zinc-300"
                >
                  source session
                </Link>
              </>
            )}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-zinc-500">
            {loading ? "Loading…" : "No target on file yet."}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <NumField label="weight (lb)" value={weight} onChange={setWeight} />
        <NumField label="reps" value={reps} onChange={setReps} integer />
        <NumField label="sets" value={sets} onChange={setSets} integer />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!dirty || saving}
        className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/15 disabled:opacity-40"
      >
        {saving ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Save className="size-3" />
        )}
        {program ? "Save" : "Set initial target"}
      </button>
    </section>
  );
}

function NumField({
  label,
  value,
  onChange,
  integer = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  integer?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      <input
        type="number"
        step={integer ? "1" : "any"}
        min={integer ? "1" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-white/10 bg-zinc-950/60 px-2 py-1.5 font-mono text-sm text-zinc-100 focus:border-white/35 focus:outline-none"
      />
    </label>
  );
}

function toMessage(err: unknown): string {
  if (err instanceof ApiError) return err.detail;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
