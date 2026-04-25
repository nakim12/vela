/**
 * Shared types consumed by both `apps/web` (frontend) and (indirectly)
 * `apps/api` (FastAPI). The Python pydantic models in `apps/api/models/` are
 * the source of truth; update those first, then mirror here.
 *
 * Matthew (BE-A) owns this file per §17 of the project plan. FE/agent teams
 * file PRs that touch *only* this file when they need a new shape.
 */

// ---------------------------------------------------------------------------
// Enums / primitives
// ---------------------------------------------------------------------------

export type Lift = "squat" | "bench" | "deadlift";

export type RiskSeverity = "info" | "warn" | "high";

export type RiskSide = "left" | "right" | "both";

/** ISO-8601 timestamp (UTC). pydantic serializes `datetime` as this string. */
export type IsoDateTime = string;

// ---------------------------------------------------------------------------
// Rules engine output (§3.3)
// ---------------------------------------------------------------------------

/** Structured output from the in-browser rules engine. */
export type RiskEvent = {
  rule_id: string;
  lift: Lift;
  rep_index: number;
  severity: RiskSeverity;
  measured: number;
  threshold: number;
  frame_range: [number, number];
  confidence: number;
  side?: RiskSide;
};

// ---------------------------------------------------------------------------
// POST /api/sessions
// ---------------------------------------------------------------------------

export type SessionCreate = {
  /** Temporary stub until Clerk auth lands. */
  user_id: string;
  lift: Lift;
};

export type SessionOut = {
  session_id: string;
  user_id: string;
  lift: Lift;
  started_at: IsoDateTime;
  ended_at: IsoDateTime | null;
  bb_thread_id: string;
  /** Markdown post-set report written by the agent (null until write_session_summary fires). */
  summary_md: string | null;
};

// ---------------------------------------------------------------------------
// POST /api/sessions/:id/events
// ---------------------------------------------------------------------------

export type EventsIn = {
  events: RiskEvent[];
};

export type EventsAccepted = {
  accepted: number;
  total_for_session: number;
};

// ---------------------------------------------------------------------------
// POST /api/sessions/:id/end
// ---------------------------------------------------------------------------

export type SessionEndOut = {
  session_id: string;
  ended_at: IsoDateTime;
  event_count: number;
};

// ---------------------------------------------------------------------------
// GET /api/sessions/:id/report
// ---------------------------------------------------------------------------

export type SessionReport = {
  session: SessionOut;
  events: RiskEvent[];
  event_count: number;
};

// ---------------------------------------------------------------------------
// GET / PUT /api/user/thresholds
// ---------------------------------------------------------------------------

export type ThresholdOut = {
  user_id: string;
  rule_id: string;
  value: number;
  justification: string | null;
  source_session_id: string | null;
  created_at: IsoDateTime;
};

export type ThresholdsResponse = {
  user_id: string;
  thresholds: ThresholdOut[];
};

export type ThresholdUpsert = {
  /** Temporary stub until Clerk auth lands. */
  user_id: string;
  value: number;
  justification?: string | null;
  source_session_id?: string | null;
};
