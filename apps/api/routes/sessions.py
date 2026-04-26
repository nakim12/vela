from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from auth import get_effective_user_id, require_session_owner
from db.session import get_db
from models.session import (
    EventsAccepted,
    EventsIn,
    SessionCreate,
    SessionEndOut,
    SessionListItem,
    SessionListResponse,
    SessionOut,
    SessionReport,
    SetCreate,
    SetOut,
    SetsResponse,
)
from store import (
    add_events,
    count_events,
    create_session,
    create_set,
    end_session,
    get_events,
    get_session,
    list_sessions,
    list_sets,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionOut, status_code=201)
def create(
    body: SessionCreate,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_effective_user_id),
) -> SessionOut:
    record = create_session(db, current_user_id, body.lift)
    return SessionOut(**record)


@router.get("", response_model=SessionListResponse)
def list_for_user(
    lift: Literal["squat", "bench", "deadlift"] | None = None,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_effective_user_id),
) -> SessionListResponse:
    """List the current user's most-recent sessions (newest first)."""
    rows = list_sessions(db, current_user_id, lift=lift, limit=limit)
    return SessionListResponse(
        user_id=current_user_id,
        sessions=[SessionListItem(**r) for r in rows],
    )


@router.post("/{session_id}/events", response_model=EventsAccepted)
def post_events(
    session_id: str,
    body: EventsIn,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_effective_user_id),
) -> EventsAccepted:
    require_session_owner(session_id, current_user_id, db)
    total = add_events(db, session_id, body.events)
    # require_session_owner already 404'd if missing, so total is non-None.
    assert total is not None
    return EventsAccepted(accepted=len(body.events), total_for_session=total)


@router.post("/{session_id}/end", response_model=SessionEndOut)
def end(
    session_id: str,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_effective_user_id),
) -> SessionEndOut:
    require_session_owner(session_id, current_user_id, db)
    session = end_session(db, session_id)
    assert session is not None
    return SessionEndOut(
        session_id=session["session_id"],
        ended_at=session["ended_at"],
        event_count=count_events(db, session_id),
    )


@router.get("/{session_id}/report", response_model=SessionReport)
def report(
    session_id: str,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_effective_user_id),
) -> SessionReport:
    require_session_owner(session_id, current_user_id, db)
    session = get_session(db, session_id)
    assert session is not None
    events = get_events(db, session_id)
    sets = list_sets(db, session_id)
    return SessionReport(
        session=SessionOut(**session),
        events=events,
        event_count=len(events),
        sets=[SetOut(**s) for s in sets],
    )


@router.post("/{session_id}/sets", response_model=SetOut, status_code=201)
def post_set(
    session_id: str,
    body: SetCreate,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_effective_user_id),
) -> SetOut:
    """Persist a completed working set and its per-rep telemetry.

    Called by the browser at end-of-set (no rep detected for 6s — see §6.3).
    When ``reps`` are provided, their length must match ``rep_count`` so the
    stored aggregate can't drift from the per-rep detail.
    """
    require_session_owner(session_id, current_user_id, db)
    if body.reps and len(body.reps) != body.rep_count:
        raise HTTPException(
            status_code=422,
            detail=(
                f"rep_count ({body.rep_count}) must match len(reps) "
                f"({len(body.reps)}) when reps are provided"
            ),
        )
    record = create_set(
        db,
        session_id=session_id,
        weight_lb=body.weight_lb,
        rep_count=body.rep_count,
        started_at=body.started_at,
        ended_at=body.ended_at,
        reps=body.reps,
    )
    assert record is not None
    return SetOut(**record)


@router.get("/{session_id}/sets", response_model=SetsResponse)
def get_sets(
    session_id: str,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_effective_user_id),
) -> SetsResponse:
    """List this session's sets (with nested reps) in chronological order."""
    require_session_owner(session_id, current_user_id, db)
    rows = list_sets(db, session_id)
    return SetsResponse(
        session_id=session_id,
        sets=[SetOut(**s) for s in rows],
    )
