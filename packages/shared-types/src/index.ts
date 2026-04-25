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
// POST / GET /api/sessions/:id/sets
// ---------------------------------------------------------------------------

/** Per-rep telemetry batched from the browser at end-of-set. */
export type RepIn = {
  rep_index: number;
  depth_cm?: number | null;
  /** Ascent duration in ms. */
  time_to_lift_ms?: number | null;
  low_confidence?: boolean;
};

export type RepOut = {
  rep_id: number;
  set_id: number;
  rep_index: number;
  depth_cm: number | null;
  time_to_lift_ms: number | null;
  low_confidence: boolean;
};

/** Posted by the browser when a working set ends (6s of no reps, §6.3).
 *  If ``reps`` is provided, its length must equal ``rep_count``. */
export type SetCreate = {
  weight_lb: number;
  rep_count: number;
  started_at?: IsoDateTime | null;
  ended_at?: IsoDateTime | null;
  reps?: RepIn[];
};

export type SetOut = {
  set_id: number;
  session_id: string;
  /** 1-based within the parent session. Assigned server-side. */
  set_index: number;
  weight_lb: number;
  rep_count: number;
  started_at: IsoDateTime;
  ended_at: IsoDateTime | null;
  reps: RepOut[];
};

export type SetsResponse = {
  session_id: string;
  sets: SetOut[];
};

// ---------------------------------------------------------------------------
// GET /api/sessions/:id/report
// ---------------------------------------------------------------------------

export type SessionReport = {
  session: SessionOut;
  events: RiskEvent[];
  event_count: number;
  sets: SetOut[];
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

// ---------------------------------------------------------------------------
// GET / PUT /api/user/programs
// ---------------------------------------------------------------------------

/** Agent-prescribed working target for one (user, lift). Written by the
 *  `recommend_load` tool at the end of a session; read pre-session to
 *  pre-fill the lift page and power the "today's watch list" banner. */
export type ProgramOut = {
  user_id: string;
  lift: Lift;
  weight_lb: number;
  reps: number;
  sets: number;
  source_session_id: string | null;
  created_at: IsoDateTime;
};

export type ProgramsResponse = {
  user_id: string;
  programs: ProgramOut[];
};

export type ProgramUpsert = {
  /** Temporary stub until Clerk auth lands. */
  user_id: string;
  weight_lb: number;
  reps: number;
  sets: number;
  source_session_id?: string | null;
};

// ---------------------------------------------------------------------------
// GET /api/sessions/:id/pre  (agent-driven, owned by BE-B)
// ---------------------------------------------------------------------------

/** Two-line "today's watch list" banner returned by the pre-session loop.
 *  Line 1 covers injury / regression notes; line 2 covers mobility /
 *  anthropometry. Either line may be `"No notable history."` when nothing
 *  applies. The frontend should render `lines[0]` and `lines[1]` directly. */
export type PreSessionBanner = {
  session_id: string;
  lift: Lift;
  /** Raw 2-line markdown returned by the agent. */
  banner: string;
  /** `banner` split on newline, blank lines stripped. Always length 2 in
   *  the happy path; may be shorter if the agent misformats. */
  lines: string[];
};

// ---------------------------------------------------------------------------
// GET /api/sessions/:id/memory_updates  (agent-driven, owned by BE-B)
// ---------------------------------------------------------------------------

/** A single Backboard memory the agent wrote during this session via the
 *  `log_observation` tool (filtered by `metadata.session_id == session_id`).
 *  Powers the "what I learned about you today" collapsible in the post-set
 *  report (§6.3 §5 of the project plan). */
export type MemoryUpdate = {
  /** Backboard memory id. Stable across reads, useful for delete UX. */
  id: string;
  /** Tag from the agent's log_observation call (anthropometry, mobility,
   *  injuries, sensitivity, lift_history, cue_preferences, threshold). May
   *  be null if the agent forgot to set it. */
  category: string | null;
  content: string;
  created_at: IsoDateTime;
};

export type MemoryUpdatesResponse = {
  session_id: string;
  /** Newest first. Empty when the agent didn't log anything this session. */
  memory_updates: MemoryUpdate[];
};

// ---------------------------------------------------------------------------
// GET /api/user/trends  (analytics, owned by BE-B)
// ---------------------------------------------------------------------------

/** One session's worth of risk-event counts grouped by `rule_id`.
 *  Sessions with zero flagged events appear with an empty `event_counts`. */
export type TrendSession = {
  session_id: string;
  started_at: IsoDateTime;
  ended_at: IsoDateTime | null;
  lift: Lift;
  /** rule_id -> count of risk events flagged in this session.
   *  Keys match `RiskEvent.rule_id` (e.g. KNEE_CAVE, FORWARD_DUMP, BUTT_WINK). */
  event_counts: Record<string, number>;
};

/** Powers the §6.3 §4 long-term trend chart and the `/sessions` history view.
 *  `sessions` is newest-first; the frontend should reverse for a left-to-right
 *  chronological chart. */
export type TrendsResponse = {
  user_id: string;
  /** Filter that was applied (`null` = all lifts). */
  lift: Lift | null;
  sessions: TrendSession[];
};

// ---------------------------------------------------------------------------
// POST /api/coach/message  (agent-driven, owned by BE-B)
// ---------------------------------------------------------------------------

export type CoachMessageIn = {
  /** Temporary stub until Clerk auth lands. */
  user_id: string;
  message: string;
};

export type CoachMessageOut = {
  user_id: string;
  /** Markdown body of the agent's reply. Render through any markdown lib. */
  reply: string;
};

// ---------------------------------------------------------------------------
// WebSocket /ws/sessions/:id  (in-set live cues, owned by BE-B)
// ---------------------------------------------------------------------------

/** Lifecycle for one set's WS connection:
 *    1. Open the socket.
 *    2. Wait for `{type: "ready"}` from the server.
 *    3. Send `{type: "events", events: RiskEvent[]}` whenever the rules
 *       engine flags something. Server replies `{type: "cue", text}`.
 *    4. Optionally send `{type: "ping"}` for liveness; server replies
 *       `{type: "pong"}`.
 *    5. Close the socket when the set ends. */

export type WsClientPing = { type: "ping" };
export type WsClientEvents = { type: "events"; events: RiskEvent[] };
export type WsClientFrame = WsClientPing | WsClientEvents;

export type WsServerReady = { type: "ready"; session_id: string };
export type WsServerCue = { type: "cue"; text: string };
export type WsServerPong = { type: "pong" };
export type WsServerError = { type: "error"; message: string };
export type WsServerFrame =
  | WsServerReady
  | WsServerCue
  | WsServerPong
  | WsServerError;
