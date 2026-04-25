from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.session import get_db
from models.user import (
    ProgramOut,
    ProgramsResponse,
    ProgramUpsert,
    ThresholdOut,
    ThresholdsResponse,
    ThresholdUpsert,
)
from store import list_programs, list_thresholds, upsert_program, upsert_threshold

router = APIRouter(prefix="/user", tags=["user"])


@router.get("/thresholds", response_model=ThresholdsResponse)
def get_thresholds(
    user_id: str, db: Session = Depends(get_db)
) -> ThresholdsResponse:
    """Return this user's per-rule threshold overrides.

    The browser rules engine merges these on top of the population defaults
    (see §3.4 of the plan).
    """
    rows = list_thresholds(db, user_id)
    return ThresholdsResponse(
        user_id=user_id,
        thresholds=[ThresholdOut(**r) for r in rows],
    )


@router.put("/thresholds/{rule_id}", response_model=ThresholdOut)
def put_threshold(
    rule_id: str, body: ThresholdUpsert, db: Session = Depends(get_db)
) -> ThresholdOut:
    """Upsert a user-specific threshold override.

    Called by the coaching agent's `update_threshold` tool (see §5.2).
    """
    row = upsert_threshold(
        db,
        user_id=body.user_id,
        rule_id=rule_id,
        value=body.value,
        justification=body.justification,
        source_session_id=body.source_session_id,
    )
    return ThresholdOut(**row)


@router.get("/programs", response_model=ProgramsResponse)
def get_programs(
    user_id: str, db: Session = Depends(get_db)
) -> ProgramsResponse:
    """Return this user's agent-prescribed next-session targets, one per lift.

    Used by the pre-session watch-list banner (§5.3) and the lift page to
    pre-fill the weight/reps/sets inputs.
    """
    rows = list_programs(db, user_id)
    return ProgramsResponse(
        user_id=user_id,
        programs=[ProgramOut(**r) for r in rows],
    )


@router.put("/programs/{lift}", response_model=ProgramOut)
def put_program(
    lift: Literal["squat", "bench", "deadlift"],
    body: ProgramUpsert,
    db: Session = Depends(get_db),
) -> ProgramOut:
    """Upsert the next-session prescription for one lift.

    Called by the coaching agent's `recommend_load` tool at the end of a
    session (see §5.2). Overwrites any existing prescription for the same
    (user_id, lift) pair — Backboard memory holds the narrative of *why*
    we changed it.
    """
    row = upsert_program(
        db,
        user_id=body.user_id,
        lift=lift,
        weight_lb=body.weight_lb,
        reps=body.reps,
        sets=body.sets,
        source_session_id=body.source_session_id,
    )
    return ProgramOut(**row)
