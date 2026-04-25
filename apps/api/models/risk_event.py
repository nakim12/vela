from typing import Literal

from pydantic import BaseModel, Field

Lift = Literal["squat", "bench", "deadlift"]
RiskSeverity = Literal["info", "warn", "high"]
RiskSide = Literal["left", "right", "both"]


class RiskEvent(BaseModel):
    rule_id: str
    lift: Lift
    rep_index: int
    severity: RiskSeverity
    measured: float
    threshold: float
    frame_range: tuple[int, int] = Field(..., description="Start/end frame indices")
    confidence: float = Field(..., ge=0, le=1)
    side: RiskSide | None = None
