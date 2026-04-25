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


class SessionEndOut(BaseModel):
    session_id: str
    ended_at: datetime
    event_count: int


class EventsIn(BaseModel):
    events: list[RiskEvent]


class EventsAccepted(BaseModel):
    accepted: int
    total_for_session: int


class SessionReport(BaseModel):
    session: SessionOut
    events: list[RiskEvent]
    event_count: int
