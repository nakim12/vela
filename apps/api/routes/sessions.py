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
)
from store import (
    add_events,
    count_events,
    create_session,
    end_session,
    get_events,
    get_session,
    list_sessions,
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
    """List the user's most-recent sessions (newest first, with event counts).

    Powers the `/sessions` history page on the frontend.
    """
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
    return SessionReport(
        session=SessionOut(**session),
        events=events,
        event_count=len(events),
    )
