/**
 * Typed fetch wrapper around the FastAPI backend.
 *
 * Two variants:
 *
 *   1. ``apiFetchServer(path, init)`` — server-side. Imports ``auth()``
 *      from ``@clerk/nextjs/server`` and forwards the Clerk JWT so the
 *      FastAPI ``get_current_user_id`` dep can verify it. Use from
 *      server components, route handlers, and server actions.
 *
 *   2. ``useApiFetch()`` — client-side hook. Uses Clerk's browser
 *      ``useAuth()`` to get a fresh session token on every call (Clerk
 *      rotates tokens every ~60s; don't cache them).
 *
 * ``NEXT_PUBLIC_API_URL`` defaults to ``http://localhost:8000`` for
 * local dev against ``uvicorn`` on port 8000. Set it to the deployed
 * backend URL in prod. Never hardcode session tokens here; Clerk's
 * helpers always know the current user.
 */
"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback } from "react";

import { ApiError } from "./api-shared";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export { ApiError };

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Client-side API hook. Returns a function with the same shape as ``fetch``
 *  but bound to the API base URL and pre-authenticated with the current
 *  Clerk session. */
export function useApiFetch() {
  const { getToken } = useAuth();

  return useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const token = await getToken();
      const headers = new Headers(init.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
      return handle<T>(res);
    },
    [getToken],
  );
}
