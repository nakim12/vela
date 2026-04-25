"""ORM models for the Vela API.

Named to match the project plan's Postgres schema (§7.2). The ORM class for
a workout session is called `WorkoutSession` to avoid clashing with
SQLAlchemy's `Session` type; the table name is still `sessions`.
"""
from __future__ import annotations

from datetime import datetime, timezone

from typing import Any

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    backboard_assistant_id: Mapped[str | None] = mapped_column(
        String, nullable=True
    )
    anthropometrics: Mapped[dict[str, Any] | None] = mapped_column(
        JSON, nullable=True
    )


class WorkoutSession(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), index=True
    )
    lift: Mapped[str] = mapped_column(String)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    bb_thread_id: Mapped[str] = mapped_column(String)
    summary_md: Mapped[str | None] = mapped_column(Text, nullable=True)


class UserThreshold(Base):
    __tablename__ = "user_thresholds"

    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), primary_key=True
    )
    rule_id: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[float] = mapped_column(Float)
    justification: Mapped[str | None] = mapped_column(String, nullable=True)
    source_session_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("sessions.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class Program(Base):
    """Agent-prescribed "next session" target for one (user, lift) pair.

    Written by the agent's ``recommend_load`` tool at the end of a session;
    read by the pre-session watch-list banner and the lift page. Semantics
    match ``user_thresholds``: upsert on (user_id, lift), overwrite each
    time — we don't keep history here because Backboard memory already has
    the narrative ("we dropped squat 10lb this week because...").
    """

    __tablename__ = "programs"

    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), primary_key=True
    )
    lift: Mapped[str] = mapped_column(String, primary_key=True)
    weight_lb: Mapped[float] = mapped_column(Float)
    reps: Mapped[int] = mapped_column(Integer)
    sets: Mapped[int] = mapped_column(Integer)
    source_session_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("sessions.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class RiskEventRow(Base):
    __tablename__ = "risk_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String, ForeignKey("sessions.id"), index=True
    )
    rule_id: Mapped[str] = mapped_column(String)
    lift: Mapped[str] = mapped_column(String)
    rep_index: Mapped[int] = mapped_column(Integer)
    severity: Mapped[str] = mapped_column(String)
    measured: Mapped[float] = mapped_column(Float)
    threshold: Mapped[float] = mapped_column(Float)
    frame_start: Mapped[int] = mapped_column(Integer)
    frame_end: Mapped[int] = mapped_column(Integer)
    confidence: Mapped[float] = mapped_column(Float)
    side: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
