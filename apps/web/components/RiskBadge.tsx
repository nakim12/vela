import type { RiskEvent } from "@vela/shared-types";

export function RiskBadge({ event }: { event: RiskEvent }) {
  return (
    <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-900">
      {event.rule_id} ({event.severity})
    </span>
  );
}
