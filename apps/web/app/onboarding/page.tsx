"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { ApiError, postOnboarding, useApi } from "@/lib/api-client";

type CuePref = "internal" | "external" | "";

export default function OnboardingPage() {
  const router = useRouter();
  const api = useApi();

  const [email, setEmail] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [weightLb, setWeightLb] = useState("");
  const [femurRatio, setFemurRatio] = useState("");
  const [injuries, setInjuries] = useState<string[]>([]);
  const [mobility, setMobility] = useState<string[]>([]);
  const [cuePref, setCuePref] = useState<CuePref>("");
  const [injuryDraft, setInjuryDraft] = useState("");
  const [mobilityDraft, setMobilityDraft] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    { memories_written: number; assistant_id: string } | null
  >(null);

  function addTag(value: string, list: string[], setList: (xs: string[]) => void, clear: () => void) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (list.includes(trimmed)) {
      clear();
      return;
    }
    setList([...list, trimmed]);
    clear();
  }

  function removeTag(idx: number, list: string[], setList: (xs: string[]) => void) {
    setList(list.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await postOnboarding(api, {
        email: email.trim() || null,
        anthropometrics: {
          height_in: heightIn ? Number(heightIn) : undefined,
          weight_lb: weightLb ? Number(weightLb) : undefined,
          femur_torso_ratio: femurRatio ? Number(femurRatio) : undefined,
        },
        injuries,
        mobility_flags: mobility,
        cue_preference: cuePref || null,
      });
      setResult({
        memories_written: res.memories_written,
        assistant_id: res.assistant_id,
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : "Unknown error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">
            Step 1
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Seed your knowledge graph
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Each answer becomes one Backboard memory the agent can recall
            during your sets. You can skip anything — partial submissions
            are valid. Re-running overwrites your anthropometrics and
            appends new injuries / mobility flags.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <Section title="Email" subtitle="Optional. Mostly for our records — your identity comes from your sign-in.">
            <Field label="email">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="lifter@example.com"
                type="email"
              />
            </Field>
          </Section>

          <Section title="Anthropometrics" subtitle="All optional. Femur:torso ratio drives the agent's forward-lean expectations.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Height (in)">
                <input
                  value={heightIn}
                  onChange={(e) => setHeightIn(e.target.value)}
                  className="input"
                  type="number"
                  min={36}
                  max={96}
                  step={0.5}
                  placeholder="69"
                />
              </Field>
              <Field label="Weight (lb)">
                <input
                  value={weightLb}
                  onChange={(e) => setWeightLb(e.target.value)}
                  className="input"
                  type="number"
                  min={60}
                  max={600}
                  step={1}
                  placeholder="180"
                />
              </Field>
              <Field
                label="Femur:torso"
                hint=">= 1.0 long femurs"
              >
                <input
                  value={femurRatio}
                  onChange={(e) => setFemurRatio(e.target.value)}
                  className="input"
                  type="number"
                  min={0.6}
                  max={1.5}
                  step={0.01}
                  placeholder="1.05"
                />
              </Field>
            </div>
          </Section>

          <Section title="Injuries / regressions" subtitle="One memory per item. Press Enter to add.">
            <TagEditor
              tags={injuries}
              draft={injuryDraft}
              setDraft={setInjuryDraft}
              onAdd={() =>
                addTag(injuryDraft, injuries, setInjuries, () =>
                  setInjuryDraft(""),
                )
              }
              onRemove={(i) => removeTag(i, injuries, setInjuries)}
              placeholder="Low back tweak Sept 2024 from heavy good morning"
            />
          </Section>

          <Section title="Mobility flags" subtitle="Free text. Press Enter to add.">
            <TagEditor
              tags={mobility}
              draft={mobilityDraft}
              setDraft={setMobilityDraft}
              onAdd={() =>
                addTag(mobilityDraft, mobility, setMobility, () =>
                  setMobilityDraft(""),
                )
              }
              onRemove={(i) => removeTag(i, mobility, setMobility)}
              placeholder="Limited right ankle dorsiflexion (~20 deg)"
            />
          </Section>

          <Section title="Cue preference" subtitle="Biases in-set cue style. Coach can override later.">
            <div className="grid grid-cols-3 gap-2 text-sm">
              {(
                [
                  ["", "Not sure"],
                  ["internal", "Internal"],
                  ["external", "External"],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setCuePref(val)}
                  className={
                    "rounded-md border px-3 py-2 transition " +
                    (cuePref === val
                      ? "border-white/35 bg-white/10 text-white"
                      : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/20")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Internal: &ldquo;brace ribs down&rdquo; · External:
              &ldquo;push the floor away&rdquo;
            </p>
          </Section>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              type="submit"
              disabled={submitting}
              className="bg-white text-zinc-950 hover:bg-zinc-200"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Seeding…
                </span>
              ) : (
                "Seed knowledge graph"
              )}
            </Button>
            {result && (
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/sessions")}
                className="border-white/15 text-zinc-100 hover:bg-white/10"
              >
                See your sessions →
              </Button>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
              <p className="font-mono text-xs uppercase tracking-wider text-red-300">
                error
              </p>
              <p className="mt-1">{error}</p>
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-white/20 bg-white/[0.06] p-4 text-sm text-zinc-100">
              <p className="font-mono text-xs uppercase tracking-wider text-zinc-300">
                seeded
              </p>
              <p className="mt-1">
                Wrote{" "}
                <span className="font-semibold text-zinc-100">
                  {result.memories_written}
                </span>{" "}
                memories to assistant{" "}
                <span className="font-mono text-xs text-zinc-400">
                  {result.assistant_id.slice(0, 8)}…
                </span>
              </p>
            </div>
          )}
        </form>
      </main>

      <style jsx global>{`
        .input {
          width: 100%;
          background: rgba(24, 24, 27, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 0.375rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(244, 244, 245);
          outline: none;
          transition: border-color 150ms;
        }
        .input:focus {
          border-color: rgba(255, 255, 255, 0.35);
        }
        .input::placeholder {
          color: rgb(82, 82, 91);
        }
      `}</style>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
      {subtitle && (
        <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
      )}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-xs font-medium text-zinc-400">
        {label}
        {hint && <span className="text-zinc-600">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function TagEditor({
  tags,
  draft,
  setDraft,
  onAdd,
  onRemove,
  placeholder,
}: {
  tags: string[];
  draft: string;
  setDraft: (s: string) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  placeholder: string;
}) {
  return (
    <div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          className="input"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-white/20"
        >
          <Plus className="size-3.5" />
          Add
        </button>
      </div>
      {tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {tags.map((t, i) => (
            <li
              key={`${t}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-zinc-900/60 px-2 py-1 text-xs text-zinc-200"
            >
              {t}
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Remove ${t}`}
                className="text-zinc-500 transition hover:text-red-300"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
