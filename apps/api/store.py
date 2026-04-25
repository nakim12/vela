"""Data access layer for the Vela API.

Sessions and risk events are persisted via SQLAlchemy (see apps/api/db/).
Route handlers call these functions and pass in a `DBSession`, so the
route layer is ignorant of the DB backend.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from db.models import RiskEventRow, User, UserThreshold, WorkoutSession
from models.risk_event import RiskEvent


def _serialize_session(s: WorkoutSession) -> dict[str, Any]:
    return {
        "session_id": s.id,
        "user_id": s.user_id,
        "lift": s.lift,
        "started_at": s.started_at,
        "ended_at": s.ended_at,
        "bb_thread_id": s.bb_thread_id,
        "summary_md": s.summary_md,
    }


def _row_to_event(row: RiskEventRow) -> RiskEvent:
    return RiskEvent(
        rule_id=row.rule_id,
        lift=row.lift,  # type: ignore[arg-type]
        rep_index=row.rep_index,
        severity=row.severity,  # type: ignore[arg-type]
        measured=row.measured,
        threshold=row.threshold,
        frame_range=(row.frame_start, row.frame_end),
        confidence=row.confidence,
        side=row.side,  # type: ignore[arg-type]
    )


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
    return _serialize_session(session)


def get_session(db: DBSession, session_id: str) -> dict[str, Any] | None:
    s = db.get(WorkoutSession, session_id)
    return _serialize_session(s) if s else None


def list_sessions(
    db: DBSession,
    user_id: str,
    lift: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Return the user's most-recent sessions with an attached `event_count`.

    Newest first (by `started_at`). Optionally filter by lift.
    """
    event_count_col = func.count(RiskEventRow.id).label("event_count")
    stmt = (
        select(WorkoutSession, event_count_col)
        .outerjoin(RiskEventRow, RiskEventRow.session_id == WorkoutSession.id)
        .where(WorkoutSession.user_id == user_id)
        .group_by(WorkoutSession.id)
        .order_by(WorkoutSession.started_at.desc())
        .limit(limit)
    )
    if lift is not None:
        stmt = stmt.where(WorkoutSession.lift == lift)

    results: list[dict[str, Any]] = []
    for session_row, event_count in db.execute(stmt).all():
        results.append(
            {
                "session_id": session_row.id,
                "user_id": session_row.user_id,
                "lift": session_row.lift,
                "started_at": session_row.started_at,
                "ended_at": session_row.ended_at,
                "event_count": int(event_count),
            }
        )
    return results


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
    for e in events:
        db.add(
            RiskEventRow(
                session_id=session_id,
                rule_id=e.rule_id,
                lift=e.lift,
                rep_index=e.rep_index,
                severity=e.severity,
                measured=e.measured,
                threshold=e.threshold,
                frame_start=e.frame_range[0],
                frame_end=e.frame_range[1],
                confidence=e.confidence,
                side=e.side,
            )
        )
    db.commit()
    return count_events(db, session_id)


def get_events(db: DBSession, session_id: str) -> list[RiskEvent]:
    stmt = (
        select(RiskEventRow)
        .where(RiskEventRow.session_id == session_id)
        .order_by(RiskEventRow.id.asc())
    )
    rows = db.execute(stmt).scalars().all()
    return [_row_to_event(r) for r in rows]


def count_events(db: DBSession, session_id: str) -> int:
    stmt = select(RiskEventRow).where(RiskEventRow.session_id == session_id)
    return len(db.execute(stmt).scalars().all())


def list_sessions(
    db: DBSession,
    user_id: str,
    lift: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Return this user's sessions (newest first) with risk-event counts.

    Single query with a LEFT JOIN + GROUP BY so we don't N+1 the event count.
    """
    event_count = func.count(RiskEventRow.id).label("event_count")
    stmt = (
        select(WorkoutSession, event_count)
        .join(
            RiskEventRow,
            RiskEventRow.session_id == WorkoutSession.id,
            isouter=True,
        )
        .where(WorkoutSession.user_id == user_id)
        .group_by(WorkoutSession.id)
        .order_by(WorkoutSession.started_at.desc())
        .limit(limit)
    )
    if lift is not None:
        stmt = stmt.where(WorkoutSession.lift == lift)

    rows = db.execute(stmt).all()
    return [
        {
            "session_id": s.id,
            "lift": s.lift,
            "started_at": s.started_at,
            "ended_at": s.ended_at,
            "event_count": int(count),
        }
        for s, count in rows
    ]


def _serialize_threshold(t: UserThreshold) -> dict[str, Any]:
    return {
        "user_id": t.user_id,
        "rule_id": t.rule_id,
        "value": t.value,
        "justification": t.justification,
        "source_session_id": t.source_session_id,
        "created_at": t.created_at,
    }


def list_thresholds(db: DBSession, user_id: str) -> list[dict[str, Any]]:
    stmt = (
        select(UserThreshold)
        .where(UserThreshold.user_id == user_id)
        .order_by(UserThreshold.rule_id.asc())
    )
    rows = db.execute(stmt).scalars().all()
    return [_serialize_threshold(t) for t in rows]


def upsert_threshold(
    db: DBSession,
    user_id: str,
    rule_id: str,
    value: float,
    justification: str | None,
    source_session_id: str | None,
) -> dict[str, Any]:
    _ensure_user(db, user_id)
    existing = db.get(UserThreshold, (user_id, rule_id))
    if existing is None:
        row = UserThreshold(
            user_id=user_id,
            rule_id=rule_id,
            value=value,
            justification=justification,
            source_session_id=source_session_id,
        )
        db.add(row)
    else:
        existing.value = value
        existing.justification = justification
        existing.source_session_id = source_session_id
        existing.created_at = datetime.now(timezone.utc)
        row = existing
    db.commit()
    db.refresh(row)
    return _serialize_threshold(row)
