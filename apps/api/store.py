"""In-memory store for the Vela API (MVP).

TODO(BE-A): replace with SQLAlchemy models + Alembic migrations backed by
Postgres. Route handlers import only the functions in this module, so the
DB swap is contained to a single file.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from models.risk_event import RiskEvent

_sessions: dict[str, dict[str, Any]] = {}
_events: dict[str, list[RiskEvent]] = {}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def create_session(user_id: str, lift: str) -> dict[str, Any]:
    session_id = str(uuid4())
    record: dict[str, Any] = {
        "session_id": session_id,
        "user_id": user_id,
        "lift": lift,
        "started_at": _utcnow(),
        "ended_at": None,
        "bb_thread_id": f"thread_placeholder_{uuid4().hex[:12]}",
    }
    _sessions[session_id] = record
    _events[session_id] = []
    return record


def get_session(session_id: str) -> dict[str, Any] | None:
    return _sessions.get(session_id)


def end_session(session_id: str) -> dict[str, Any] | None:
    session = _sessions.get(session_id)
    if session is None:
        return None
    if session["ended_at"] is None:
        session["ended_at"] = _utcnow()
    return session


def add_events(session_id: str, events: list[RiskEvent]) -> int | None:
    if session_id not in _events:
        return None
    _events[session_id].extend(events)
    return len(_events[session_id])


def get_events(session_id: str) -> list[RiskEvent]:
    return list(_events.get(session_id, []))
