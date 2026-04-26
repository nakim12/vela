import type { CoachMessageIn, CoachMessageOut } from "@vela/shared-types";

import { api } from "./client";

/** POST /api/coach/message — single-turn chat against the user's persistent
 *  Backboard assistant. The thread is cached server-side so multi-turn
 *  context is preserved within one uvicorn lifetime. */
export function postCoachMessage(
  body: CoachMessageIn,
): Promise<CoachMessageOut> {
  return api<CoachMessageOut>("/api/coach/message", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
