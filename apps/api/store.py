"""Data access layer for the Vela API.

Session CRUD is persisted to the DB (see apps/api/db/).
Risk events are still held in-memory — the next increment moves them to
a real `risk_events` table.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session as DBSession

from db.models import User, WorkoutSession
from models.risk_event import RiskEvent

_events: dict[str, list[RiskEvent]] = {}


def _serialize_session(s: WorkoutSession) -> dict[str, Any]:
    return {
        "session_id": s.id,
        "user_id": s.user_id,
        "lift": s.lift,
        "started_at": s.started_at,
        "ended_at": s.ended_at,
        "bb_thread_id": s.bb_thread_id,
    }


def _ensure_user(db: DBSession, user_id: str) -> User:
    user = db.get(User, user_id)
    if user is None:
        user = User(id=user_id)
        db.add(user)
        db.flush()
    return user


def create_session(db: DBSession, user_id: str, lift: str) -> dict[str, Any]:
    _ensure_user(db, user_id)
    session = WorkoutSession(
        id=str(uuid4()),
        user_id=user_id,
        lift=lift,
        bb_thread_id=f"thread_placeholder_{uuid4().hex[:12]}",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    _events.setdefault(session.id, [])
    return _serialize_session(session)


def get_session(db: DBSession, session_id: str) -> dict[str, Any] | None:
    s = db.get(WorkoutSession, session_id)
    return _serialize_session(s) if s else None


def end_session(db: DBSession, session_id: str) -> dict[str, Any] | None:
    s = db.get(WorkoutSession, session_id)
    if s is None:
        return None
    if s.ended_at is None:
        s.ended_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(s)
    return _serialize_session(s)


def add_events(
    db: DBSession, session_id: str, events: list[RiskEvent]
) -> int | None:
    s = db.get(WorkoutSession, session_id)
    if s is None:
        return None
    bucket = _events.setdefault(session_id, [])
    bucket.extend(events)
    return len(bucket)


def get_events(session_id: str) -> list[RiskEvent]:
    return list(_events.get(session_id, []))
