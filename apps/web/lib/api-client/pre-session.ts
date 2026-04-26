import type { Lift, UserPreSessionResponse } from "@vela/shared-types";

import type { ApiFetch } from "./client";

/** GET /api/user/pre — today's prescription for one lift, with no LLM in
 *  the loop. Read straight from the `programs` table that the post-set
 *  agent's `recommend_load` tool writes to. Returns `target: null` when
 *  the user has never finished a session of this lift. */
export function getUserPre(
  api: ApiFetch,
  lift: Lift,
): Promise<UserPreSessionResponse> {
  return api<UserPreSessionResponse>("/api/user/pre", {
    query: { lift },
  });
}
