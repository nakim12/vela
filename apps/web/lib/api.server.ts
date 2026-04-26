/**
 * Server-side counterpart to ``lib/api.ts``.
 *
 * Use from React Server Components, route handlers, and server actions.
 * Pulls the current user's Clerk session token via ``auth()`` and attaches
 * it as a Bearer token so the FastAPI ``get_current_user_id`` dep can
 * resolve the caller.
 *
 * Separate file (not a branch inside ``lib/api.ts``) because that module
 * is marked ``"use client"`` — importing ``@clerk/nextjs/server`` from a
 * client module fails the Next.js boundary check.
 */
import "server-only";

import { auth } from "@clerk/nextjs/server";

import { ApiError } from "./api-shared";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

export async function apiFetchServer<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { getToken } = await auth();
  const token = await getToken();

  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    // Don't let Next.js cache authenticated API responses at the fetch layer.
    cache: "no-store",
  });
  return handle<T>(res);
}
