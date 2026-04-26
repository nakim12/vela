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
// GET /api/sessions  (list user's sessions, owned by BE-A)
// ---------------------------------------------------------------------------

/** Lightweight summary row for the `/sessions` history view. Omits the
 *  full event/set payloads — fetch the per-session report for those. */
export type SessionListItem = {
  session_id: string;
  user_id: string;
  lift: Lift;
  started_at: IsoDateTime;
  ended_at: IsoDateTime | null;
  /** Total RiskEvent rows persisted for this session. */
  event_count: number;
};

export type SessionListResponse = {
  user_id: string;
  sessions: SessionListItem[];
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

/** Body for `PUT /api/user/thresholds/{rule_id}`.
 *  `user_id` is resolved from the Clerk session token, not the body. */
export type ThresholdUpsert = {
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

/** Body for `PUT /api/user/programs/{lift}`.
 *  `user_id` is resolved from the Clerk session token, not the body. */
export type ProgramUpsert = {
  weight_lb: number;
  reps: number;
  sets: number;
  source_session_id?: string | null;
};

// ---------------------------------------------------------------------------
// GET /api/sessions/:id/pre  (agent-driven, owned by BE-B)
// ---------------------------------------------------------------------------

/** Today's prescribed top set for this lift. Persisted by the agent's
 *  `recommend_load` tool at the end of the prior session and read straight
 *  from the `programs` table — no LLM in the loop, so the numbers are
 *  exact. `null` when the user has no prior prescription on file. */
export type PreSessionTarget = {
  weight_lb: number;
  reps: number;
  sets: number;
  /** Session whose post-set agent run produced this target. Useful for a
   *  "why is this my target?" affordance in the FE. */
  source_session_id?: string | null;
};

/** Two-line "today's watch list" banner returned by the pre-session loop.
 *  Line 1 covers injury / regression notes; line 2 covers mobility /
 *  anthropometry. Either line may be `"No notable history."` when nothing
 *  applies. The frontend should render `lines[0]` and `lines[1]` directly.
 *
 *  `target` is appended separately so the FE can render a "Today: 150x5x3"
 *  pill alongside the agent banner. It comes from the deterministic DB
 *  read, not the LLM. */
export type PreSessionBanner = {
  session_id: string;
  lift: Lift;
  /** Raw 2-line markdown returned by the agent. */
  banner: string;
  /** `banner` split on newline, blank lines stripped. Always length 2 in
   *  the happy path; may be shorter if the agent misformats. */
  lines: string[];
  /** `null` for fresh users with no `recommend_load` prescription yet. */
  target?: PreSessionTarget | null;
};

// ---------------------------------------------------------------------------
// GET /api/user/pre  (agent-driven, owned by BE-B)
// ---------------------------------------------------------------------------

/** Session-less twin of `PreSessionBanner.target`. Powers the "Today's plan"
 *  banner on `/lift/[lift]` *before* a session exists. Skips the LLM
 *  watch-list lines on purpose — calling the pre-session loop on every page
 *  load would be slow and wasteful, and the prescription number is the part
 *  the lifter actually wants to see. The narrative justification lives on
 *  the source session's report; deep-link to it via `target.source_session_id`. */
export type UserPreSessionResponse = {
  lift: Lift;
  /** Latest prescription written by the post-set agent's `recommend_load`
   *  call for this `(user, lift)` pair. `null` when the user is new to
   *  this lift (no session has finished yet). */
  target: PreSessionTarget | null;
};

// ---------------------------------------------------------------------------
// POST /api/onboarding  (owned by BE-B)
// ---------------------------------------------------------------------------

/** Anthropometry blob from the onboarding form. All fields optional —
 *  partial submissions are valid. */
export type Anthropometrics = {
  height_in?: number;
  weight_lb?: number;
  /** Femur:torso length ratio. >=1.0 means long femurs (more forward lean
   *  expected); <1.0 means short femurs (can squat upright). */
  femur_torso_ratio?: number;
};

/** Body for `POST /api/onboarding`. Mirrors the §5.3 onboarding form.
 *  User id comes from the Clerk session (or `?user_id=` in local dev
 *  without Clerk). */
export type OnboardingIn = {
  email?: string | null;
  anthropometrics?: Anthropometrics;
  /** Free-text injury / regression notes; one Backboard memory per item. */
  injuries?: string[];
  /** Free-text mobility limitations (e.g. "limited right ankle dorsiflexion"). */
  mobility_flags?: string[];
  /** Biases the in-set cue style. Coach can override later. */
  cue_preference?: "internal" | "external" | null;
};

export type OnboardingResponse = {
  user_id: string;
  assistant_id: string;
  /** Total Backboard memories seeded from this submission. */
  memories_written: number;
};

// ---------------------------------------------------------------------------
// POST /api/sessions/:id/post_set_summary  (agent-driven, owned by BE-B)
// ---------------------------------------------------------------------------

/** Response from `POST /api/sessions/:id/post_set_summary`.
 *  Idempotent by default: once `summary_md` is persisted on the session,
 *  subsequent calls return it without re-running the agent. Pass
 *  `?force=true` in the request to re-roll a fresh summary. */
export type PostSetSummaryResponse = {
  session_id: string;
  /** Markdown body of the agent's report. Render through any markdown lib.
   *  Always includes a "Sources" section listing corpus filenames the
   *  agent cited (see post_set_loop's prompt contract). */
  summary_md: string;
  /** How many risk events the agent reasoned over for this report. */
  event_count: number;
  /** True when the agent ran on this call; false when we returned cache. */
  generated: boolean;
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

/** Body for `POST /api/coach/message`. User identity comes from the
 *  Clerk session token, not the body. */
export type CoachMessageIn = {
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
