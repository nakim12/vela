import type {
  OnboardingIn,
  OnboardingResponse,
} from "@vela/shared-types";

import type { ApiFetch } from "./client";

/** POST /api/onboarding — creates / refreshes the user's profile and seeds
 *  their Backboard knowledge graph. Idempotent (re-running overwrites
 *  anthropometrics; new injuries / mobility flags are appended as
 *  additional memories). User identity comes from the Clerk JWT. */
export function postOnboarding(
  api: ApiFetch,
  body: OnboardingIn,
): Promise<OnboardingResponse> {
  return api<OnboardingResponse>("/api/onboarding", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
