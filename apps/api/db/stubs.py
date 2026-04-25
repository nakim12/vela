"""Agent-side data access shim (was an in-memory stub module).

Nathan's agent code imports this module to read/write user + session fields
without needing to know about SQLAlchemy or FastAPI dependency injection. Each
function opens its own short-lived session and returns detached dataclass
snapshots so callers don't have to worry about lifecycle.

The module is still called ``stubs`` to avoid churn across the agent code;
keeping the filename also keeps the import graph in git blame-able. A rename
to ``agent_bridge.py`` (or similar) is fine for a follow-up.

Interface kept intact from the in-memory version:
    - get_user(user_id) -> StubUser
    - set_user_assistant_id(user_id, assistant_id) -> None
    - get_session(session_id) -> StubSession
    - set_session_thread_id(session_id, thread_id) -> None
    - upsert_threshold(user_id, rule_id, value, justification) -> None
    - get_thresholds(user_id) -> dict[str, float]
    - write_session_summary(session_id, summary_md) -> None
    - get_session_summary(session_id) -> str | None
    - upsert_program(user_id, lift, weight_lb, reps, sets, source_session_id?) -> None
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from models.risk_event import Lift

from .models import Program as ProgramRow
from .models import User as UserRow
from .models import UserThreshold as UserThresholdRow
from .models import WorkoutSession as SessionRow
from .session import SessionLocal


# -- Detached snapshot dataclasses ------------------------------------------
# Kept as ``StubUser`` / ``StubSession`` so agent-side imports don't need to
# change. They're read-only records; mutate via the explicit ``set_*`` helpers.


@dataclass
class StubUser:
    id: str
    email: str
    backboard_assistant_id: str | None = None
    anthropometrics: dict[str, Any] = field(default_factory=dict)


@dataclass
class StubSession:
    id: str
    user_id: str
    lift: Lift
    bb_thread_id: str | None = None
    summary_md: str | None = None


def _user_from_row(row: UserRow) -> StubUser:
    return StubUser(
        id=row.id,
        email=row.email or "",
        backboard_assistant_id=row.backboard_assistant_id,
        anthropometrics=dict(row.anthropometrics or {}),
    )


def _session_from_row(row: SessionRow) -> StubSession:
    return StubSession(
        id=row.id,
        user_id=row.user_id,
        lift=row.lift,  # type: ignore[arg-type]
        bb_thread_id=row.bb_thread_id or None,
        summary_md=row.summary_md,
    )


# -- Public API --------------------------------------------------------------


def get_user(user_id: str) -> StubUser:
    """Raises ``KeyError`` if the user doesn't exist — matches prior behavior."""
    with SessionLocal() as db:
        row = db.get(UserRow, user_id)
        if row is None:
            raise KeyError(f"unknown user: {user_id}")
        return _user_from_row(row)


def set_user_assistant_id(user_id: str, assistant_id: Any) -> None:
    # Coerce to str defensively: the Backboard SDK returns UUID objects (not
    # strings), and SQLAlchemy refuses to bind UUIDs to a VARCHAR column.
    # The in-memory stubs swallowed it silently; the DB-backed version doesn't.
    with SessionLocal() as db:
        row = db.get(UserRow, user_id)
        if row is None:
            raise KeyError(f"unknown user: {user_id}")
        row.backboard_assistant_id = str(assistant_id)
        db.commit()


def get_session(session_id: str) -> StubSession:
    """Raises ``KeyError`` if the session doesn't exist."""
    with SessionLocal() as db:
        row = db.get(SessionRow, session_id)
        if row is None:
            raise KeyError(f"unknown session: {session_id}")
        return _session_from_row(row)


def set_session_thread_id(session_id: str, thread_id: Any) -> None:
    # Same UUID-vs-str defensive coercion as set_user_assistant_id: Backboard
    # Thread.thread_id is a UUID object, SQLAlchemy's VARCHAR binding rejects it.
    with SessionLocal() as db:
        row = db.get(SessionRow, session_id)
        if row is None:
            raise KeyError(f"unknown session: {session_id}")
        row.bb_thread_id = str(thread_id)
        db.commit()


def upsert_threshold(
    user_id: str,
    rule_id: str,
    value: float,
    justification: str,
    source_session_id: str | None = None,
) -> None:
    with SessionLocal() as db:
        existing = db.get(UserThresholdRow, (user_id, rule_id))
        if existing is None:
            db.add(
                UserThresholdRow(
                    user_id=user_id,
                    rule_id=rule_id,
                    value=value,
                    justification=justification,
                    source_session_id=source_session_id,
                )
            )
        else:
            existing.value = value
            existing.justification = justification
            existing.source_session_id = source_session_id
            existing.created_at = datetime.now(timezone.utc)
        db.commit()


def get_thresholds(user_id: str) -> dict[str, float]:
    with SessionLocal() as db:
        rows = (
            db.query(UserThresholdRow)
            .filter(UserThresholdRow.user_id == user_id)
            .all()
        )
        return {r.rule_id: r.value for r in rows}


def write_session_summary(session_id: str, summary_md: str) -> None:
    with SessionLocal() as db:
        row = db.get(SessionRow, session_id)
        if row is None:
            raise KeyError(f"unknown session: {session_id}")
        row.summary_md = summary_md
        db.commit()


def get_session_summary(session_id: str) -> str | None:
    with SessionLocal() as db:
        row = db.get(SessionRow, session_id)
        if row is None:
            return None
        return row.summary_md


def upsert_program(
    user_id: str,
    lift: Lift,
    weight_lb: float,
    reps: int,
    sets: int,
    source_session_id: str | None = None,
) -> None:
    """Upsert the agent's prescribed next-session target for (user, lift).

    Backing for the ``recommend_load`` agent tool. The user row must
    already exist (the agent only prescribes for a known lifter). Same
    overwrite semantics as ``store.upsert_program``.
    """
    with SessionLocal() as db:
        if db.get(UserRow, user_id) is None:
            raise KeyError(f"unknown user: {user_id}")
        existing = db.get(ProgramRow, (user_id, lift))
        if existing is None:
            db.add(
                ProgramRow(
                    user_id=user_id,
                    lift=lift,
                    weight_lb=float(weight_lb),
                    reps=int(reps),
                    sets=int(sets),
                    source_session_id=source_session_id,
                )
            )
        else:
            existing.weight_lb = float(weight_lb)
            existing.reps = int(reps)
            existing.sets = int(sets)
            existing.source_session_id = source_session_id
            existing.created_at = datetime.now(timezone.utc)
        db.commit()


# -- Demo fixture seeding ---------------------------------------------------


DEMO_USER_ID = "demo-user-1"
DEMO_SESSION_ID = "demo-session-1"


def seed_demo_fixtures() -> None:
    """Idempotently create the hardcoded demo user + session.

    Nathan's smoke scripts (``scripts/smoke_*.py``) all reference these ids.
    Called once from the FastAPI lifespan hook so they're always present.
    """
    with SessionLocal() as db:
        user = db.get(UserRow, DEMO_USER_ID)
        if user is None:
            db.add(
                UserRow(
                    id=DEMO_USER_ID,
                    email="[email protected]",
                    anthropometrics={"height_in": 70, "femur_torso_ratio": 1.0},
                )
            )
            db.flush()

        session = db.get(SessionRow, DEMO_SESSION_ID)
        if session is None:
            db.add(
                SessionRow(
                    id=DEMO_SESSION_ID,
                    user_id=DEMO_USER_ID,
                    lift="squat",
                    bb_thread_id="",
                )
            )

        db.commit()
