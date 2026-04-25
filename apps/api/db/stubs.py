"""TEMPORARY in-memory fixtures so BE-B (agent layer) can build before BE-A
(real DB / Clerk) lands. BE-A will replace this module with real SQLAlchemy
queries; the public interface (get_user, get_session, ...) should match.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from models.risk_event import Lift


@dataclass
class StubUser:
    id: str
    email: str
    backboard_assistant_id: str | None = None
    anthropometrics: dict = field(default_factory=dict)


@dataclass
class StubSession:
    id: str
    user_id: str
    lift: Lift
    bb_thread_id: str | None = None
    summary_md: str | None = None


_USERS: dict[str, StubUser] = {
    "demo-user-1": StubUser(
        id="demo-user-1",
        email="[email protected]",
        anthropometrics={"height_in": 70, "femur_torso_ratio": 1.0},
    ),
}

_SESSIONS: dict[str, StubSession] = {
    "demo-session-1": StubSession(
        id="demo-session-1",
        user_id="demo-user-1",
        lift="squat",
    ),
}

_THRESHOLDS: dict[str, dict[str, float]] = {}
_SUMMARIES: dict[str, str] = {}


def get_user(user_id: str) -> StubUser:
    if user_id not in _USERS:
        raise KeyError(f"unknown user: {user_id}")
    return _USERS[user_id]


def set_user_assistant_id(user_id: str, assistant_id: str) -> None:
    _USERS[user_id].backboard_assistant_id = assistant_id


def get_session(session_id: str) -> StubSession:
    if session_id not in _SESSIONS:
        raise KeyError(f"unknown session: {session_id}")
    return _SESSIONS[session_id]


def set_session_thread_id(session_id: str, thread_id: str) -> None:
    _SESSIONS[session_id].bb_thread_id = thread_id


def upsert_threshold(
    user_id: str, rule_id: str, value: float, justification: str
) -> None:
    _THRESHOLDS.setdefault(user_id, {})[rule_id] = value


def get_thresholds(user_id: str) -> dict[str, float]:
    return dict(_THRESHOLDS.get(user_id, {}))


def write_session_summary(session_id: str, summary_md: str) -> None:
    _SUMMARIES[session_id] = summary_md
    _SESSIONS[session_id].summary_md = summary_md


def get_session_summary(session_id: str) -> str | None:
    return _SUMMARIES.get(session_id)
