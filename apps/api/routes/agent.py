"""Agent-driven HTTP endpoints.

These wrap the high-level agent loops in ``agents/loops.py`` so the frontend
can trigger them over plain HTTP. The actual LLM / tool dispatch logic lives
in ``agents/``; this module just translates HTTP request -> loop call ->
JSON response.

Owned by BE-B (Nathan). Kept in its own router so changes here don't collide
with BE-A's CRUD routes in ``routes/sessions.py``.
"""
from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from pydantic import BaseModel, Field

from agents.loops import coach_chat_loop, post_set_loop, pre_session_loop
from auth import get_effective_user_id, require_session_owner
from bb import get_client
from db import stubs as db_stubs
from db.models import RiskEventRow, WorkoutSession
from db.session import get_db
from store import get_events as store_get_events

log = logging.getLogger(__name__)

router = APIRouter(tags=["agent"])


# How many memories to pull per page when filtering for session-tagged
# updates. The Backboard SDK has no server-side metadata filter, so we page
# through all memories for the assistant and filter client-side. Demo
# personas have <30 memories total today, so a single page is plenty;
# kept paginated so this still works once Backboard memories grow.
_MEMORY_PAGE_SIZE = 100
_MEMORY_MAX_PAGES = 10


class PreSessionBanner(BaseModel):
    session_id: str
    lift: str
    banner: str = Field(
        description="Raw 2-line watch list as returned by the agent."
    )
    lines: list[str] = Field(
        description="Banner split on newlines (empty lines stripped).",
    )


@router.get(
    "/sessions/{session_id}/pre",
    response_model=PreSessionBanner,
    summary="Pre-session watch list (2 lines: injuries / mobility)",
)
async def pre_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_effective_user_id),
) -> PreSessionBanner:
    """Generate today's watch list for the lifter starting this session.

    Returns 2 lines pulled from the agent's per-user knowledge graph:
      * line 1: relevant injury notes / recent regressions
      * line 2: mobility flags / anthropometry considerations
    Either line may be ``"No notable history."`` if nothing applies.
    """
    require_session_owner(session_id, current_user_id, db)
    try:
        session = db_stubs.get_session(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="session not found")

    client = get_client()
    try:
        banner = await pre_session_loop(
            client,
            user_id=session.user_id,
            session_id=session_id,
            lift=session.lift,
        )
    except Exception as e:
        log.exception("pre_session_loop failed for session %s", session_id)
        raise HTTPException(
            status_code=502, detail=f"agent_failed: {e}"
        ) from e

    cleaned = banner.strip()
    lines = [ln for ln in cleaned.splitlines() if ln.strip()]
    return PreSessionBanner(
        session_id=session_id,
        lift=session.lift,
        banner=cleaned,
        lines=lines,
    )


class MemoryUpdate(BaseModel):
    id: str
    category: str | None = Field(
        default=None,
        description="Tag from log_observation's metadata.category, when present.",
    )
    content: str
    created_at: datetime


class MemoryUpdatesResponse(BaseModel):
    session_id: str
    memory_updates: list[MemoryUpdate] = Field(
        description="Newest first. Empty when the agent didn't log_observation."
    )


def _memory_session_id(meta: Any) -> str | None:
    """Pull a stringly-typed session_id out of a Memory.metadata blob."""
    if not isinstance(meta, dict):
        return None
    raw = meta.get("session_id")
    return str(raw) if raw is not None else None


def _memory_category(meta: Any) -> str | None:
    if not isinstance(meta, dict):
        return None
    raw = meta.get("category")
    return str(raw) if raw is not None else None


@router.get(
    "/sessions/{session_id}/memory_updates",
    response_model=MemoryUpdatesResponse,
    summary="Memories the agent wrote during this session (log_observation)",
)
async def memory_updates(
    session_id: str,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_effective_user_id),
) -> MemoryUpdatesResponse:
    """List Backboard memories tagged with this ``session_id``.

    Powers the §6.3 "memory updates" collapsible: a transparent record of
    everything the agent decided to remember about the lifter from this
    session's telemetry. The agent writes these via the ``log_observation``
    tool, which always stamps ``metadata.session_id`` onto the memory
    (see ``agents/tools.py``).

    The Backboard SDK has no server-side metadata filter, so we page
    through ``get_memories`` and filter client-side. Memories are returned
    newest-first to match the rest of the report timelines.

    Returns an empty list (200, not 404) when no observations were logged —
    that's a valid demo state ("nothing worth remembering this set").
    """
    require_session_owner(session_id, current_user_id, db)
    try:
        session = db_stubs.get_session(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="session not found")

    user = db_stubs.get_user(session.user_id)
    assistant_id = user.backboard_assistant_id
    if not assistant_id:
        # User hasn't talked to the agent yet; no assistant means no memories.
        return MemoryUpdatesResponse(session_id=session_id, memory_updates=[])

    client = get_client()
    matched: list[MemoryUpdate] = []
    try:
        for page in range(1, _MEMORY_MAX_PAGES + 1):
            res = await client.get_memories(
                assistant_id, page=page, page_size=_MEMORY_PAGE_SIZE
            )
            for mem in res.memories or []:
                if _memory_session_id(mem.metadata) != session_id:
                    continue
                matched.append(
                    MemoryUpdate(
                        id=str(mem.id),
                        category=_memory_category(mem.metadata),
                        content=mem.content,
                        created_at=mem.created_at,
                    )
                )
            total_pages = getattr(res, "total_pages", 1) or 1
            if page >= total_pages:
                break
    except Exception as e:
        log.exception(
            "memory_updates failed for session=%s assistant=%s",
            session_id, assistant_id,
        )
        raise HTTPException(
            status_code=502, detail=f"backboard_failed: {e}"
        ) from e

    matched.sort(key=lambda m: m.created_at, reverse=True)
    return MemoryUpdatesResponse(session_id=session_id, memory_updates=matched)


class PostSetSummaryResponse(BaseModel):
    session_id: str
    summary_md: str = Field(
        description="Markdown report from the agent. Same content the "
        "write_session_summary tool persisted to sessions.summary_md."
    )
    event_count: int = Field(
        description="How many risk events the agent reasoned over."
    )
    generated: bool = Field(
        description="True if we ran the agent on this call, False if we "
        "returned the previously-cached summary."
    )


@router.post(
    "/sessions/{session_id}/post_set_summary",
    response_model=PostSetSummaryResponse,
    summary="Run the post-set agent loop and return the markdown report",
)
async def post_set_summary(
    session_id: str,
    force: bool = Query(
        default=False,
        description="If true, re-run the agent even when a summary is cached. "
        "Costs LLM credits; mainly useful for re-rolling cues during demos.",
    ),
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_effective_user_id),
) -> PostSetSummaryResponse:
    """Generate (or return cached) the post-set markdown report for a session.

    Closes the §13 demo loop: after the browser finishes uploading a video
    and POSTing all detected risk events, FE calls this endpoint to get the
    markdown that powers the post-set report card. By default this is
    idempotent — once ``sessions.summary_md`` is set, subsequent calls
    return it without re-running the agent. Pass ``?force=true`` to re-roll.

    The agent loop itself (``post_set_loop``) handles tool dispatch,
    persistence, and ``recommend_load`` — this route just gathers the
    inputs and returns the output. See ``agents/loops.py`` for the prompt
    + workflow contract.
    """
    require_session_owner(session_id, current_user_id, db)
    session = db.get(WorkoutSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session not found")

    events = store_get_events(db, session_id)

    if session.summary_md and not force:
        return PostSetSummaryResponse(
            session_id=session_id,
            summary_md=session.summary_md,
            event_count=len(events),
            generated=False,
        )

    client = get_client()
    try:
        await post_set_loop(
            client,
            user_id=session.user_id,
            session_id=session_id,
            events=events,
        )
    except Exception as e:
        log.exception("post_set_loop failed for session %s", session_id)
        raise HTTPException(
            status_code=502, detail=f"agent_failed: {e}"
        ) from e

    # ``write_session_summary`` (one of the agent's required tools) persists
    # the markdown to sessions.summary_md before the loop returns. We re-read
    # from disk rather than trusting the loop's return value so the response
    # matches what /sessions/{id}/report would later show.
    summary = db_stubs.get_session_summary(session_id)
    if not summary:
        # Agent skipped write_session_summary somehow. Surface this loudly so
        # we notice in smoke tests / the demo rather than returning silence.
        raise HTTPException(
            status_code=502,
            detail="agent_failed: post_set_loop did not persist a summary",
        )
    return PostSetSummaryResponse(
        session_id=session_id,
        summary_md=summary,
        event_count=len(events),
        generated=True,
    )


class TrendSession(BaseModel):
    """One session's risk-event counts grouped by rule_id."""

    session_id: str
    started_at: datetime
    ended_at: datetime | None = None
    lift: str
    event_counts: dict[str, int] = Field(
        description="rule_id -> count of risk events flagged in this session.",
    )


class TrendsResponse(BaseModel):
    user_id: str
    lift: str | None = Field(
        default=None,
        description="Filter applied (None = all lifts mixed).",
    )
    sessions: list[TrendSession] = Field(
        description=(
            "Newest first. Powers the §6.3 long-term trend chart "
            "('knee cave events down 40% over last 6 sessions'). "
            "Frontend should reverse for left-to-right chronological display."
        )
    )


@router.get(
    "/user/trends",
    response_model=TrendsResponse,
    summary="Per-session rule-event counts for the trend chart",
)
def user_trends(
    lift: Literal["squat", "bench", "deadlift"] | None = None,
    limit: int = Query(default=8, ge=1, le=50),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_effective_user_id),
) -> TrendsResponse:
    """Return up to ``limit`` recent sessions with risk-event counts per rule.

    Powers the §6.3 §4 "long-term trend" panel of the post-set report and
    the same chart on the ``/sessions`` history page. Two-step query so the
    counts come from a single round trip:

      1. Pick the user's most-recent N sessions (optionally filter by lift).
      2. Bulk-fetch all their risk events, group counts by (session, rule).

    Sessions with zero flagged events still appear in the response (with an
    empty ``event_counts`` dict) — those are the "clean session" wins worth
    showing on the chart.

    With Clerk, the subject is the JWT ``sub``. During local dev without
    Clerk, ``?user_id=demo-user-2`` (optional) targets a second stub user
    for multi-persona smoke tests.
    """
    sess_stmt = (
        select(WorkoutSession)
        .where(WorkoutSession.user_id == user_id)
        .order_by(WorkoutSession.started_at.desc())
        .limit(limit)
    )
    if lift is not None:
        sess_stmt = sess_stmt.where(WorkoutSession.lift == lift)

    sessions = db.execute(sess_stmt).scalars().all()
    if not sessions:
        return TrendsResponse(user_id=user_id, lift=lift, sessions=[])

    session_ids = [s.id for s in sessions]
    evt_stmt = select(
        RiskEventRow.session_id, RiskEventRow.rule_id
    ).where(RiskEventRow.session_id.in_(session_ids))
    counts: dict[str, Counter[str]] = {sid: Counter() for sid in session_ids}
    for sid, rule in db.execute(evt_stmt).all():
        counts[sid][rule] += 1

    return TrendsResponse(
        user_id=user_id,
        lift=lift,
        sessions=[
            TrendSession(
                session_id=s.id,
                started_at=s.started_at,
                ended_at=s.ended_at,
                lift=s.lift,
                event_counts=dict(counts[s.id]),
            )
            for s in sessions
        ],
    )


class CoachMessageIn(BaseModel):
    message: str = Field(min_length=1, description="The user's chat message.")


class CoachMessageOut(BaseModel):
    user_id: str
    reply: str = Field(description="Markdown reply from the coach agent.")


@router.post(
    "/coach/message",
    response_model=CoachMessageOut,
    summary="Send a chat message to the coach agent",
)
async def coach_message(
    body: CoachMessageIn,
    current_user_id: str = Depends(get_effective_user_id),
) -> CoachMessageOut:
    """Free-form conversation with the user's coach assistant.

    The agent has access to the same tools as the in/post/pre loops
    (``query_user_kg``, ``search_research``, etc.), so substantive questions
    like "how should I approach my next squat session?" get grounded in the
    user's own history + the corpus instead of generic LLM advice.

    Threads are persisted per-user in-process via
    ``ensure_coach_thread_for_user``, so multi-turn chats stay coherent
    until the API restarts. (Backboard memories outlive restarts, so even a
    fresh thread keeps personalization.)
    """
    client = get_client()
    try:
        reply = await coach_chat_loop(
            client,
            user_id=current_user_id,
            message=body.message,
        )
    except Exception as e:
        log.exception("coach_chat_loop failed for user %s", current_user_id)
        raise HTTPException(
            status_code=502, detail=f"agent_failed: {e}"
        ) from e

    return CoachMessageOut(user_id=current_user_id, reply=reply.strip())
