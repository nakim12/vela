"use client";

/**
 * `/settings/thresholds` — CRUD over per-rule sensitivity overrides.
 *
 * The agent's `update_threshold` tool writes here automatically as it
 * learns the user's tolerances (e.g. "this lifter has knock knees from
 * an old ACL — relax KNEE_CAVE warn threshold"). This page lets the
 * user inspect those decisions, see the agent's justification, and
 * tweak the numbers directly.
 *
 * Backend: Matthew's GET/PUT /api/user/thresholds (no DELETE — to remove
 * an override you'd PUT it back to the population default once those are
 * exposed). The browser rules engine merges these on top of defaults at
 * runtime.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus, RefreshCw, Save } from "lucide-react";
import type { ThresholdOut } from "@vela/shared-types";

import { AppHeader } from "@/components/AppHeader";
import { ApiError, getThresholds, putThreshold, useApi } from "@/lib/api-client";

/** Rules the in-browser engine knows about. Until the rules engine ships
 *  its own registry, this is the single source of truth for which rule_ids
 *  the dropdown lets you target. New rules just get added here. Rule IDs
 *  must match exactly what the in-browser rules in `lib/rules/*` emit —
 *  the agent's `update_threshold` writes are keyed by these strings.
 *  Roadmap items (FORWARD_DUMP, BUTT_WINK, ROUND_BACK, HIPS_RISE_FIRST)
 *  are kept in the dropdown so the UI is forward-compatible with rules
 *  the engine will gain in later milestones. */
const KNOWN_RULES: { id: string; label: string }[] = [
  { id: "KNEE_CAVE", label: "Knee cave · squat" },
  { id: "HEEL_LIFT", label: "Heel lift · squat" },
  { id: "DEPTH_ASYMMETRY", label: "Depth asymmetry · squat" },
  { id: "FORWARD_DUMP", label: "Forward dump · squat" },
  { id: "BUTT_WINK", label: "Butt wink · squat" },
  { id: "UNEVEN_PRESS", label: "Uneven press · bench" },
  { id: "BAR_PATH_DRIFT", label: "Bar path drift · bench" },
  { id: "ROUND_BACK", label: "Round back · deadlift" },
  { id: "HIPS_RISE_FIRST", label: "Hips rise first · deadlift" },
];

export default function ThresholdsPage() {
  const api = useApi();
  const [items, setItems] = useState<ThresholdOut[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const r = await getThresholds(api);
      setItems(r.thresholds);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // refresh is stable enough for an initial load; api is captured.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpsert(
    ruleId: string,
    value: number,
    justification: string | null,
  ) {
    const optimistic: ThresholdOut = {
      user_id: items?.[0]?.user_id ?? "self",
      rule_id: ruleId,
      value,
      justification,
      source_session_id: null,
      created_at: new Date().toISOString(),
    };
    const prev = items ?? [];
    const without = prev.filter((t) => t.rule_id !== ruleId);
    setItems([optimistic, ...without]);
    try {
      const saved = await putThreshold(api, ruleId, {
        value,
        justification,
      });
      setItems((curr) => {
        const c = curr ?? [];
        const w = c.filter((t) => t.rule_id !== ruleId);
        return [saved, ...w];
      });
    } catch (err) {
      // Roll back to whatever was there before.
      setItems(prev);
      alert(`Save failed for ${ruleId}: ${toMessage(err)}`);
    }
  }

  const usedRuleIds = useMemo(
    () => new Set((items ?? []).map((t) => t.rule_id)),
    [items],
  );

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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400/90">
              Settings · Thresholds
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Rule sensitivity overrides
            </h1>
            <p className="mt-2 max-w-prose text-sm text-zinc-500">
              Each entry replaces the population default for one rule. The
              browser rules engine merges these at runtime. Your coach also
              writes here as it learns your patterns.
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

        <div className="space-y-3">
          {loading && !items && (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="size-4 animate-spin" />
              Loading overrides…
            </div>
          )}

          {items && items.length === 0 && (
            <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-zinc-400">
              No overrides yet. Either run a few sessions and let your coach
              write here, or add one below.
            </p>
          )}

          {items?.map((t) => (
            <ThresholdRow key={t.rule_id} item={t} onSave={handleUpsert} />
          ))}

          <AddOverrideForm
            disabledRuleIds={usedRuleIds}
            onSave={handleUpsert}
          />
        </div>
      </main>
    </div>
  );
}

function ThresholdRow({
  item,
  onSave,
}: {
  item: ThresholdOut;
  onSave: (
    ruleId: string,
    value: number,
    justification: string | null,
  ) => Promise<void>;
}) {
  const [value, setValue] = useState(String(item.value));
  const [justification, setJustification] = useState(item.justification ?? "");
  const [saving, setSaving] = useState(false);

  // Re-sync local form state if the row gets refreshed externally.
  useEffect(() => {
    setValue(String(item.value));
    setJustification(item.justification ?? "");
  }, [item.value, item.justification]);

  const dirty =
    value.trim() !== String(item.value) ||
    (justification.trim() || null) !== (item.justification ?? null);

  async function handleSave() {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      alert("Threshold must be a number.");
      return;
    }
    setSaving(true);
    try {
      await onSave(item.rule_id, parsed, justification.trim() || null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-sky-300">
            {item.rule_id}
          </p>
          <p className="mt-1 font-mono text-[10px] text-zinc-600">
            updated {new Date(item.created_at).toLocaleString()}
            {item.source_session_id && (
              <>
                {" · "}
                <Link
                  href={`/sessions/${item.source_session_id}`}
                  className="text-sky-400 hover:text-sky-300"
                >
                  source session
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="font-mono uppercase tracking-widest text-zinc-500">
              value
            </span>
            <input
              type="number"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-24 rounded-md border border-white/10 bg-zinc-950/60 px-2 py-1 font-mono text-sm text-zinc-100 focus:border-sky-400/60 focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 rounded-md border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-xs font-medium text-sky-200 hover:bg-sky-400/20 disabled:opacity-40"
          >
            {saving ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Save className="size-3" />
            )}
            Save
          </button>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          justification
        </span>
        <textarea
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          rows={2}
          placeholder="Why this override? (optional — agent fills this when it writes)"
          className="mt-1 w-full resize-none rounded-md border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-sky-400/40 focus:outline-none"
        />
      </label>
    </section>
  );
}

function AddOverrideForm({
  disabledRuleIds,
  onSave,
}: {
  disabledRuleIds: Set<string>;
  onSave: (
    ruleId: string,
    value: number,
    justification: string | null,
  ) => Promise<void>;
}) {
  const firstAvailable =
    KNOWN_RULES.find((r) => !disabledRuleIds.has(r.id))?.id ?? "";
  const [ruleId, setRuleId] = useState(firstAvailable);
  const [value, setValue] = useState("");
  const [justification, setJustification] = useState("");
  const [saving, setSaving] = useState(false);

  // If the user adds an override to the rule we had selected, jump to the
  // next available one so the form stays usable.
  useEffect(() => {
    if (!ruleId || disabledRuleIds.has(ruleId)) {
      const next =
        KNOWN_RULES.find((r) => !disabledRuleIds.has(r.id))?.id ?? "";
      setRuleId(next);
    }
  }, [disabledRuleIds, ruleId]);

  const allTaken = KNOWN_RULES.every((r) => disabledRuleIds.has(r.id));

  async function handleAdd() {
    const parsed = Number(value);
    if (!ruleId || !Number.isFinite(parsed)) {
      alert("Pick a rule and enter a numeric value.");
      return;
    }
    setSaving(true);
    try {
      await onSave(ruleId, parsed, justification.trim() || null);
      setValue("");
      setJustification("");
    } finally {
      setSaving(false);
    }
  }

  if (allTaken) {
    return (
      <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-4 text-center text-xs text-zinc-500">
        All known rules already have overrides. Edit them above.
      </p>
    );
  }

  return (
    <section className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-5">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
        <Plus className="size-3.5" />
        Add an override
      </div>
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            rule
          </span>
          <select
            value={ruleId}
            onChange={(e) => setRuleId(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/10 bg-zinc-950/60 px-2 py-1.5 text-sm text-zinc-100 focus:border-sky-400/60 focus:outline-none"
          >
            {KNOWN_RULES.map((r) => (
              <option
                key={r.id}
                value={r.id}
                disabled={disabledRuleIds.has(r.id)}
              >
                {r.label} {disabledRuleIds.has(r.id) ? "(set)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            value
          </span>
          <input
            type="number"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 8.5"
            className="mt-1 w-full rounded-md border border-white/10 bg-zinc-950/60 px-2 py-1.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-400/60 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || !value.trim()}
          className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-md border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-400/20 disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Plus className="size-3" />
          )}
          Add
        </button>
      </div>
      <label className="mt-3 block">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          justification (optional)
        </span>
        <input
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          placeholder="Why are you overriding the default?"
          className="mt-1 w-full rounded-md border border-white/10 bg-zinc-950/60 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-sky-400/40 focus:outline-none"
        />
      </label>
    </section>
  );
}

function toMessage(err: unknown): string {
  if (err instanceof ApiError) return err.detail;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
