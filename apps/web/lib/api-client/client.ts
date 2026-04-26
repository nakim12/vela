/**
 * Auth-aware fetch hook for the FastAPI backend.
 *
 * Wraps the browser `fetch` with three things our domain modules need:
 *   1. URL prefixing against `NEXT_PUBLIC_API_URL`.
 *   2. Optional `query` arg, since `URLSearchParams` is awkward inline.
 *   3. The current Clerk session token attached as `Authorization: Bearer …`,
 *      so the FastAPI `get_current_user_id` / `get_effective_user_id` deps
 *      resolve the caller without us threading user_id through the API.
 *
 * Why a hook (and not a free function): Clerk rotates session tokens every
 * ~60s. The only reliable way to grab a fresh one is `useAuth().getToken()`,
 * which has to be called from a component context. Pages call `useApi()`
 * once at the top, then pass the returned function into typed helpers like
 * `postOnboarding(api, body)`.
 *
 * For server components / route handlers / server actions, use Matthew's
 * `apiFetchServer` from `@/lib/api.server` instead — it pulls the Clerk
 * token from the server-side `auth()` helper.
 */
"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`${status} ${detail}`);
    this.status = status;
    this.detail = detail;
  }
}

export type ApiInit = RequestInit & {
  query?: Record<string, string | number | boolean | undefined | null>;
};

export type ApiFetch = <T>(path: string, init?: ApiInit) => Promise<T>;

/** Hook that returns a typed, Clerk-authenticated fetch function bound to
 *  `NEXT_PUBLIC_API_URL`. Call once per component; pass the returned
 *  function into per-domain helpers. */
export function useApi(): ApiFetch {
  const { getToken } = useAuth();

  return useCallback(
    async <T,>(path: string, init?: ApiInit): Promise<T> => {
      const { query, headers, ...rest } = init ?? {};

      let url = `${API_BASE}${path}`;
      if (query) {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(query)) {
          if (v !== undefined && v !== null) params.append(k, String(v));
        }
        const qs = params.toString();
        if (qs) url += `?${qs}`;
      }

      const token = await getToken();
      const finalHeaders = new Headers(headers);
      if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
      if (rest.body && !finalHeaders.has("Content-Type")) {
        finalHeaders.set("Content-Type", "application/json");
      }

      const res = await fetch(url, { ...rest, headers: finalHeaders });

      if (!res.ok) {
        let detail = res.statusText;
        try {
          const body = await res.json();
          detail =
            typeof body?.detail === "string"
              ? body.detail
              : JSON.stringify(body?.detail ?? body);
        } catch {
          // body wasn't JSON, fall back to statusText
        }
        throw new ApiError(res.status, detail);
      }

      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    },
    [getToken],
  );
}
