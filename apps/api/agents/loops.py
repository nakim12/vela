"""High-level agent loops invoked from API routes / WebSocket handlers."""
from __future__ import annotations

import json
from typing import Iterable

from backboard import BackboardClient

from agents.runtime import (
    ensure_assistant_for_user,
    ensure_thread_for_session,
    run_until_done,
)
from models.risk_event import RiskEvent


async def post_set_loop(
    client: BackboardClient,
    *,
    user_id: str,
    session_id: str,
    events: Iterable[RiskEvent],
) -> str:
    """Triggered after a set ends. Generates the markdown report and persists it."""
    assistant_id = await ensure_assistant_for_user(client, user_id)
    thread_id = await ensure_thread_for_session(client, session_id, assistant_id)

    payload = {
        "session_id": session_id,
        "events": [e.model_dump() for e in events],
    }
    prompt = (
        "End of set. Telemetry below. Produce 2-3 personalized cues for the "
        "next set, cite biomechanical reasoning, and call write_session_summary "
        "with the full markdown report. If you observe a pattern that should "
        "be remembered, call log_observation. If a default threshold is "
        "consistently exceeded without injury risk, propose update_threshold.\n\n"
        f"```json\n{json.dumps(payload, indent=2)}\n```"
    )
    return await run_until_done(
        client,
        user_id=user_id,
        assistant_id=assistant_id,
        thread_id=thread_id,
        content=prompt,
    )


async def in_set_loop(
    client: BackboardClient,
    *,
    user_id: str,
    session_id: str,
    recent_events: Iterable[RiskEvent],
) -> str:
    """Triggered every N reps or on a high-severity event.

    Returns a 3-8 word cue, or the literal string ``STOP`` if the agent decides
    a high-severity risk correlates with a known injury.
    """
    assistant_id = await ensure_assistant_for_user(client, user_id)
    thread_id = await ensure_thread_for_session(client, session_id, assistant_id)

    payload = [e.model_dump() for e in recent_events]
    prompt = (
        "In-set update. Last few events:\n"
        f"```json\n{json.dumps(payload)}\n```\n"
        "Respond with ONE cue, 3-8 words, no explanation. If high-severity "
        "risk correlates with a known injury, instead respond exactly: STOP."
    )
    return await run_until_done(
        client,
        user_id=user_id,
        assistant_id=assistant_id,
        thread_id=thread_id,
        content=prompt,
        max_iterations=2,
    )


async def pre_session_loop(
    client: BackboardClient,
    *,
    user_id: str,
    session_id: str,
    lift: str,
) -> str:
    """Returns a 2-line "today's watch list" banner for the lifter."""
    assistant_id = await ensure_assistant_for_user(client, user_id)
    thread_id = await ensure_thread_for_session(client, session_id, assistant_id)

    prompt = (
        f"New session opening. Lift planned: {lift}. In TWO short lines, "
        "surface relevant injury notes, recent regressions, and mobility flags "
        "from the lifter's knowledge graph. No preamble."
    )
    return await run_until_done(
        client,
        user_id=user_id,
        assistant_id=assistant_id,
        thread_id=thread_id,
        content=prompt,
    )
