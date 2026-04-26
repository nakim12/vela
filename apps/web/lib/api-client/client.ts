/**
 * Thin fetch wrapper for the FastAPI backend (pre-Clerk demo path).
 *
 * Every per-domain module in `lib/api-client/*` calls `api<T>()` so error
 * handling, URL prefixing, and JSON parsing live in one place. Components
 * never call `fetch` directly — they import a typed function (e.g.
 * `postOnboarding`) and let the type system enforce the request/response
 * shape.
 *
 * Lives next to (not inside) `lib/api.ts` and `lib/api.server.ts`, which
 * are Matthew's Clerk-aware fetch helpers (`useApiFetch` hook +
 * `apiFetchServer`). Once the demo flips onto real Clerk auth, the four
 * pages that import from `@/lib/api-client` should be migrated to
 * `useApiFetch` and this directory can be deleted. Until then, the
 * Zustand-based user picker in `lib/store/user.ts` passes `?user_id=…`
 * through this client and the FastAPI `get_effective_user_id` dep
 * resolves it (Clerk bypass mode).
 */
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

/** Throw a typed ApiError on non-2xx so call sites can catch and surface
 *  the message instead of the generic "fetch failed". */
export async function api<T>(
  path: string,
  init?: RequestInit & { query?: Record<string, string | number | undefined> },
): Promise<T> {
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

  const res = await fetch(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });

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

  // 204 No Content for DELETEs and similar.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
