from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.session import get_db
from models.user import ThresholdOut, ThresholdsResponse, ThresholdUpsert
from store import list_thresholds, upsert_threshold

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
