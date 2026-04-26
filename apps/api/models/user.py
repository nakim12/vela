from datetime import datetime

from pydantic import BaseModel, Field

from .risk_event import Lift


class ThresholdOut(BaseModel):
    user_id: str
    rule_id: str
    value: float
    justification: str | None = None
    source_session_id: str | None = None
    created_at: datetime


class ThresholdsResponse(BaseModel):
    user_id: str
    thresholds: list[ThresholdOut]


class ThresholdUpsert(BaseModel):
    """Body for ``PUT /api/user/thresholds/{rule_id}``.

    ``user_id`` is resolved from the Clerk session token, not the body.
    """

    value: float
    justification: str | None = None
    source_session_id: str | None = None


class ProgramOut(BaseModel):
    """Agent's prescribed next-session target for one (user, lift) pair."""

    user_id: str
    lift: Lift
    weight_lb: float = Field(..., ge=0, description="Working-set weight in pounds.")
    reps: int = Field(..., ge=1)
    sets: int = Field(..., ge=1)
    source_session_id: str | None = None
    created_at: datetime


class ProgramsResponse(BaseModel):
    user_id: str
    programs: list[ProgramOut]


class ProgramUpsert(BaseModel):
    """Body for ``PUT /api/user/programs/{lift}``.

    The lift is carried in the path, not the body, to match the
    ``PUT /api/user/thresholds/{rule_id}`` convention. ``user_id`` is
    resolved from the Clerk session token, not the body.
    """

    weight_lb: float = Field(..., ge=0)
    reps: int = Field(..., ge=1)
    sets: int = Field(..., ge=1)
    source_session_id: str | None = None
