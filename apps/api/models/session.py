from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from .risk_event import RiskEvent

Lift = Literal["squat", "bench", "deadlift"]


class SessionCreate(BaseModel):
    user_id: str = Field(..., description="Temporary stub until Clerk auth lands.")
    lift: Lift


class SessionOut(BaseModel):
    session_id: str
    user_id: str
    lift: Lift
    started_at: datetime
    ended_at: datetime | None = None
    bb_thread_id: str
    summary_md: str | None = None


class SessionEndOut(BaseModel):
    session_id: str
    ended_at: datetime
    event_count: int


class EventsIn(BaseModel):
    events: list[RiskEvent]


class EventsAccepted(BaseModel):
    accepted: int
    total_for_session: int


class RepIn(BaseModel):
    """Per-rep telemetry batched from the browser at end-of-set."""

    rep_index: int = Field(..., ge=1)
    depth_cm: float | None = None
    time_to_lift_ms: int | None = Field(None, ge=0, description="Ascent duration ms")
    low_confidence: bool = False


class RepOut(BaseModel):
    rep_id: int
    set_id: int
    rep_index: int
    depth_cm: float | None = None
    time_to_lift_ms: int | None = None
    low_confidence: bool


class SetCreate(BaseModel):
    """Body for ``POST /api/sessions/{id}/sets``.

    The browser posts a completed set (detected by "no rep for 6s" — see
    §6.3) together with its nested per-rep telemetry. ``weight_lb`` is
    user-entered on the lift page; ``rep_count`` must match ``len(reps)``
    when reps are provided.
    """

    weight_lb: float = Field(..., ge=0)
    rep_count: int = Field(..., ge=0)
    started_at: datetime | None = None
    ended_at: datetime | None = None
    reps: list[RepIn] = Field(default_factory=list)


class SetOut(BaseModel):
    set_id: int
    session_id: str
    set_index: int
    weight_lb: float
    rep_count: int
    started_at: datetime
    ended_at: datetime | None = None
    reps: list[RepOut] = Field(default_factory=list)


class SetsResponse(BaseModel):
    session_id: str
    sets: list[SetOut]


class SessionReport(BaseModel):
    session: SessionOut
    events: list[RiskEvent]
    event_count: int
    sets: list[SetOut] = Field(default_factory=list)


class SessionListItem(BaseModel):
    session_id: str
    user_id: str
    lift: Lift
    started_at: datetime
    ended_at: datetime | None = None
    event_count: int


class SessionListResponse(BaseModel):
    user_id: str
    sessions: list[SessionListItem]
