import type { Lift, TrendsResponse } from "@vela/shared-types";

import type { ApiFetch } from "./client";

/** GET /api/user/trends — per-session risk-event counts grouped by rule_id.
 *  Newest-first; reverse client-side for a left-to-right chronological chart. */
export function getTrends(
  api: ApiFetch,
  opts?: { lift?: Lift; limit?: number },
): Promise<TrendsResponse> {
  return api<TrendsResponse>("/api/user/trends", {
    query: { lift: opts?.lift, limit: opts?.limit ?? 20 },
  });
}
