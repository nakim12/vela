import type {
  CoachMessageIn,
  CoachMessageOut,
} from "@vela/shared-types";

import type { ApiFetch } from "./client";

/** POST /api/coach/message — multi-turn chat with the user's coach
 *  assistant. The agent has access to the user's KG, threshold history,
 *  and the corpus, so substantive questions return grounded markdown
 *  rather than generic LLM advice. User identity comes from the Clerk JWT. */
export function postCoachMessage(
  api: ApiFetch,
  body: CoachMessageIn,
): Promise<CoachMessageOut> {
  return api<CoachMessageOut>("/api/coach/message", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
