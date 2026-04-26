/**
 * Shared types / errors used by both ``lib/api.ts`` (client hook) and
 * ``lib/api.server.ts`` (server helper). No ``"use client"`` or
 * ``server-only`` directive — safe to import from either environment.
 */

/** Thrown by both client and server API helpers when the backend
 *  responds with a non-2xx status. ``body`` is the parsed JSON error
 *  detail (typically `{ detail: "..." }`) or the raw text if parsing
 *  failed. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API ${status}: ${JSON.stringify(body)}`);
    this.name = "ApiError";
  }
}
