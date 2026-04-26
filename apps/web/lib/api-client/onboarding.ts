import type {
  OnboardingIn,
  OnboardingResponse,
} from "@vela/shared-types";

import { api } from "./client";

/** POST /api/onboarding — creates / refreshes the user's profile and seeds
 *  their Backboard knowledge graph. Idempotent on `user_id` (re-running
 *  overwrites anthropometrics; new injuries / mobility flags are appended
 *  as additional memories).
 *
 *  `userId` is sent as a query param so the server's
 *  `get_effective_user_id` dep picks it up in Clerk-bypass mode. When
 *  Clerk is configured the param is ignored and the JWT `sub` wins. */
export function postOnboarding(
  userId: string,
  body: OnboardingIn,
): Promise<OnboardingResponse> {
  return api<OnboardingResponse>("/api/onboarding", {
    method: "POST",
    body: JSON.stringify(body),
    query: { user_id: userId },
  });
}
