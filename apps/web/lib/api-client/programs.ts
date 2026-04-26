import type {
  Lift,
  ProgramOut,
  ProgramsResponse,
  ProgramUpsert,
} from "@vela/shared-types";

import type { ApiFetch } from "./client";

/** GET /api/user/programs — every standing program for the current user.
 *  At most one per (user, lift); often empty for fresh users until the
 *  post-set agent calls recommend_load. */
export function getPrograms(api: ApiFetch): Promise<ProgramsResponse> {
  return api<ProgramsResponse>("/api/user/programs");
}

/** PUT /api/user/programs/{lift} — overwrite the standing program for
 *  one lift. Server resolves the user from the Clerk JWT. */
export function putProgram(
  api: ApiFetch,
  lift: Lift,
  body: ProgramUpsert,
): Promise<ProgramOut> {
  return api<ProgramOut>(`/api/user/programs/${lift}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
