from datetime import datetime

from pydantic import BaseModel, Field


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
    user_id: str = Field(..., description="Temporary stub until Clerk auth lands.")
    value: float
    justification: str | None = None
    source_session_id: str | None = None
