/**
 * `RiskBadge` — severity-aware pill for risk events.
 *
 * Encodes severity in color so a glance at a long event log carries
 * the same information a careful read would: red = stop now, amber =
 * fix on the next rep, sky = nice to know. Stays readable on the
 * `bg-zinc-950` shell the app uses everywhere; no white-on-white at
 * any severity.
 *
 * The rule id is rendered with the underscore swapped for a space so
 * an accidental "KNEE_CAVE" doesn't shoehorn the line height in
 * narrow columns. Severity goes in a separate slot so screen readers
 * announce both fields cleanly.
 */
import type { RiskEvent, RiskSeverity } from "@vela/shared-types";

const SEVERITY_TONE: Record<
  RiskSeverity,
  { wrap: string; dot: string; sev: string }
> = {
  info: {
    wrap: "border-sky-400/30 bg-sky-400/10 text-sky-200",
    dot: "bg-sky-400",
    sev: "text-sky-300/80",
  },
  warn: {
    wrap: "border-amber-400/40 bg-amber-400/10 text-amber-100",
    dot: "bg-amber-400",
    sev: "text-amber-300/90",
  },
  high: {
    wrap: "border-red-400/40 bg-red-400/15 text-red-100",
    dot: "bg-red-400",
    sev: "text-red-300/90",
  },
};

export function RiskBadge({ event }: { event: RiskEvent }) {
  const tone = SEVERITY_TONE[event.severity];
  const label = event.rule_id.replace(/_/g, " ").toLowerCase();
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide " +
        tone.wrap
      }
    >
      <span className={"size-1.5 rounded-full " + tone.dot} aria-hidden />
      <span className="capitalize">{label}</span>
      <span className={"font-mono text-[10px] uppercase tracking-widest " + tone.sev}>
        {event.severity}
      </span>
    </span>
  );
}
