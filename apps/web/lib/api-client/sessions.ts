import type {
  Lift,
  MemoryUpdatesResponse,
  PostSetSummaryResponse,
  PreSessionBanner,
  SessionCreate,
  SessionEndOut,
  SessionListResponse,
  SessionOut,
  SessionReport,
} from "@vela/shared-types";

import type { ApiFetch } from "./client";

// ---- Matthew's CRUD --------------------------------------------------------

export function listSessions(
  api: ApiFetch,
  opts?: { lift?: Lift; limit?: number },
): Promise<SessionListResponse> {
  return api<SessionListResponse>("/api/sessions", {
    query: { lift: opts?.lift, limit: opts?.limit ?? 20 },
  });
}

export function createSession(
  api: ApiFetch,
  body: SessionCreate,
): Promise<SessionOut> {
  return api<SessionOut>("/api/sessions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function endSession(
  api: ApiFetch,
  session_id: string,
): Promise<SessionEndOut> {
  return api<SessionEndOut>(`/api/sessions/${session_id}/end`, {
    method: "POST",
  });
}

export function getSessionReport(
  api: ApiFetch,
  session_id: string,
): Promise<SessionReport> {
  return api<SessionReport>(`/api/sessions/${session_id}/report`);
}

// ---- Nathan's agent endpoints ---------------------------------------------

/** GET /api/sessions/{id}/pre — agent banner + deterministic target read. */
export function getPreSessionBanner(
  api: ApiFetch,
  session_id: string,
): Promise<PreSessionBanner> {
  return api<PreSessionBanner>(`/api/sessions/${session_id}/pre`);
}

/** POST /api/sessions/{id}/post_set_summary — runs the agent loop (or
 *  returns cached markdown). Pass `force: true` to re-roll. */
export function postSummary(
  api: ApiFetch,
  session_id: string,
  opts?: { force?: boolean },
): Promise<PostSetSummaryResponse> {
  return api<PostSetSummaryResponse>(
    `/api/sessions/${session_id}/post_set_summary`,
    {
      method: "POST",
      query: { force: opts?.force ? "true" : undefined },
    },
  );
}

/** GET /api/sessions/{id}/memory_updates — what the agent learned this
 *  session (filtered by metadata.session_id). */
export function getMemoryUpdates(
  api: ApiFetch,
  session_id: string,
): Promise<MemoryUpdatesResponse> {
  return api<MemoryUpdatesResponse>(
    `/api/sessions/${session_id}/memory_updates`,
  );
}

/** DELETE /api/sessions/{id}/memory_updates/{memory_id} — prune one
 *  agent observation. Cross-session deletes are refused server-side. */
export function deleteMemoryUpdate(
  api: ApiFetch,
  session_id: string,
  memory_id: string,
): Promise<void> {
  return api<void>(
    `/api/sessions/${session_id}/memory_updates/${memory_id}`,
    { method: "DELETE" },
  );
}
