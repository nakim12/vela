from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

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
def create(body: SessionCreate, db: Session = Depends(get_db)) -> SessionOut:
    record = create_session(db, body.user_id, body.lift)
    return SessionOut(**record)


@router.get("", response_model=SessionListResponse)
def list_for_user(
    user_id: str,
    lift: Literal["squat", "bench", "deadlift"] | None = None,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> SessionListResponse:
    """List the user's most-recent sessions (newest first)."""
    rows = list_sessions(db, user_id, lift=lift, limit=limit)
    return SessionListResponse(
        user_id=user_id,
        sessions=[SessionListItem(**r) for r in rows],
    )


@router.post("/{session_id}/events", response_model=EventsAccepted)
def post_events(
    session_id: str, body: EventsIn, db: Session = Depends(get_db)
) -> EventsAccepted:
    total = add_events(db, session_id, body.events)
    if total is None:
        raise HTTPException(status_code=404, detail="session not found")
    return EventsAccepted(accepted=len(body.events), total_for_session=total)


@router.post("/{session_id}/end", response_model=SessionEndOut)
def end(session_id: str, db: Session = Depends(get_db)) -> SessionEndOut:
    session = end_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session not found")
    return SessionEndOut(
        session_id=session["session_id"],
        ended_at=session["ended_at"],
        event_count=count_events(db, session_id),
    )


@router.get("/{session_id}/report", response_model=SessionReport)
def report(session_id: str, db: Session = Depends(get_db)) -> SessionReport:
    session = get_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session not found")
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
    session_id: str, body: SetCreate, db: Session = Depends(get_db)
) -> SetOut:
    """Persist a completed working set and its per-rep telemetry.

    Called by the browser at end-of-set (no rep detected for 6s — see §6.3).
    When ``reps`` are provided, their length must match ``rep_count`` so the
    stored aggregate can't drift from the per-rep detail.
    """
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
    if record is None:
        raise HTTPException(status_code=404, detail="session not found")
    return SetOut(**record)


@router.get("/{session_id}/sets", response_model=SetsResponse)
def get_sets(
    session_id: str, db: Session = Depends(get_db)
) -> SetsResponse:
    """List this session's sets (with nested reps) in chronological order."""
    if get_session(db, session_id) is None:
        raise HTTPException(status_code=404, detail="session not found")
    rows = list_sets(db, session_id)
    return SetsResponse(
        session_id=session_id,
        sets=[SetOut(**s) for s in rows],
    )
