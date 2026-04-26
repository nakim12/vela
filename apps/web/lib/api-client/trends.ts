import type { Lift, TrendsResponse } from "@vela/shared-types";

import { api } from "./client";

/** GET /api/user/trends — per-session risk-event counts grouped by rule_id.
 *  Newest-first; reverse client-side for a left-to-right chronological chart. */
export function getTrends(
  user_id: string,
  opts?: { lift?: Lift; limit?: number },
): Promise<TrendsResponse> {
  return api<TrendsResponse>("/api/user/trends", {
    query: { user_id, lift: opts?.lift, limit: opts?.limit ?? 20 },
  });
}
