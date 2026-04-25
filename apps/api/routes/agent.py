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

from fastapi import APIRouter, HTTPException

from pydantic import BaseModel, Field

from agents.loops import coach_chat_loop, pre_session_loop
from bb import get_client
from db import stubs as db_stubs

log = logging.getLogger(__name__)

router = APIRouter(tags=["agent"])


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
async def pre_session(session_id: str) -> PreSessionBanner:
    """Generate today's watch list for the lifter starting this session.

    Returns 2 lines pulled from the agent's per-user knowledge graph:
      * line 1: relevant injury notes / recent regressions
      * line 2: mobility flags / anthropometry considerations
    Either line may be ``"No notable history."`` if nothing applies.

    Uses ``db_stubs`` (same as the WS handler) so the source of truth for
    user / session lookups stays consistent with the rest of the agent layer.
    Once BE-A swaps stubs.py to DB-backed queries, this endpoint inherits
    that automatically.
    """
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


class CoachMessageIn(BaseModel):
    user_id: str = Field(description="Lifter the message is being sent on behalf of.")
    message: str = Field(min_length=1, description="The user's chat message.")


class CoachMessageOut(BaseModel):
    user_id: str
    reply: str = Field(description="Markdown reply from the coach agent.")


@router.post(
    "/coach/message",
    response_model=CoachMessageOut,
    summary="Send a chat message to the coach agent",
)
async def coach_message(body: CoachMessageIn) -> CoachMessageOut:
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
    try:
        db_stubs.get_user(body.user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="user not found")

    client = get_client()
    try:
        reply = await coach_chat_loop(
            client,
            user_id=body.user_id,
            message=body.message,
        )
    except Exception as e:
        log.exception("coach_chat_loop failed for user %s", body.user_id)
        raise HTTPException(
            status_code=502, detail=f"agent_failed: {e}"
        ) from e

    return CoachMessageOut(user_id=body.user_id, reply=reply.strip())
