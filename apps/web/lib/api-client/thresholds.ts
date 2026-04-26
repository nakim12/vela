import type {
  ThresholdOut,
  ThresholdsResponse,
  ThresholdUpsert,
} from "@vela/shared-types";

import type { ApiFetch } from "./client";

/** GET /api/user/thresholds — current user's per-rule threshold overrides.
 *  The browser rules engine merges these on top of population defaults. */
export function getThresholds(api: ApiFetch): Promise<ThresholdsResponse> {
  return api<ThresholdsResponse>("/api/user/thresholds");
}

/** PUT /api/user/thresholds/{rule_id} — upsert a single override.
 *  Server resolves the user from the Clerk JWT; only the value (and
 *  optional metadata) goes in the body. */
export function putThreshold(
  api: ApiFetch,
  ruleId: string,
  body: ThresholdUpsert,
): Promise<ThresholdOut> {
  return api<ThresholdOut>(
    `/api/user/thresholds/${encodeURIComponent(ruleId)}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
}
