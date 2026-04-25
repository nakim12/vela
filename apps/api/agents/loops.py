"""High-level agent loops invoked from API routes / WebSocket handlers."""
from __future__ import annotations

import json
from typing import Iterable

from backboard import BackboardClient

from agents.runtime import (
    ensure_assistant_for_user,
    ensure_coach_thread_for_user,
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
        "End of set. Telemetry below.\n\n"
        "REQUIRED workflow before write_session_summary:\n"
        "  1. Call query_user_kg for any rule_id you want to personalize.\n"
        "  2. Call search_research at least once per distinct rule_id in "
        "the events (e.g. KNEE_CAVE, FORWARD_DUMP). Use the returned text "
        "to ground your reasoning and quote the source filename in the "
        "summary's biomechanics section.\n"
        "  3. If you observe a pattern that should be remembered, call "
        "log_observation.\n"
        "  4. If a default threshold is consistently exceeded without "
        "injury risk, propose update_threshold.\n"
        "  5. Call write_session_summary with the full markdown report. "
        "The report must include 2-3 personalized cues and a 'Sources' "
        "section listing the corpus filenames you cited.\n\n"
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
        "Output the cue as raw text, 3-8 words. Do NOT wrap it in quotes "
        "of any kind. No markdown, no trailing period, no preamble. Example "
        "of the exact format: brace ribs down. Bias toward this lifter's "
        "cue preferences from memory (internal vs external). If a "
        "high-severity risk correlates with a known injury, instead output "
        "exactly: STOP"
    )
    raw = await run_until_done(
        client,
        user_id=user_id,
        assistant_id=assistant_id,
        thread_id=thread_id,
        content=prompt,
        max_iterations=2,
    )
    return _strip_wrapping_quotes(raw.strip())


_QUOTE_PAIRS = (("'", "'"), ('"', '"'), ("“", "”"), ("‘", "’"))


def _strip_wrapping_quotes(s: str) -> str:
    """Defensive: TTS sounds wrong if the cue is wrapped in quotes."""
    if len(s) < 2:
        return s
    for opener, closer in _QUOTE_PAIRS:
        if s.startswith(opener) and s.endswith(closer):
            return s[1:-1].strip()
    return s


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
        f"New session opening. Lift planned: {lift}. Output exactly TWO "
        "lines separated by a single newline. Line 1: relevant injury notes "
        "or recent regressions. Line 2: mobility flags or anthropometry "
        "considerations. No preamble, no markdown, no bullet markers, no "
        "blank line between them. If nothing relevant exists for one of "
        "the lines, write \"No notable history.\" on that line."
    )
    return await run_until_done(
        client,
        user_id=user_id,
        assistant_id=assistant_id,
        thread_id=thread_id,
        content=prompt,
    )


async def coach_chat_loop(
    client: BackboardClient,
    *,
    user_id: str,
    message: str,
) -> str:
    """Free-form conversational turn against the user's persistent coach thread.

    Powers the ``/coach`` chat page. Uses the same per-user assistant + tools
    as the in/post/pre loops, so the coach can ``query_user_kg`` /
    ``search_research`` mid-conversation when the user asks substantive
    questions (e.g. "how should I approach my next squat session?"). Threads
    are cached per user in-process via ``ensure_coach_thread_for_user``, so
    multi-turn chats stay coherent until uvicorn restarts.
    """
    assistant_id = await ensure_assistant_for_user(client, user_id)
    thread_id = await ensure_coach_thread_for_user(
        client, user_id, assistant_id
    )
    return await run_until_done(
        client,
        user_id=user_id,
        assistant_id=assistant_id,
        thread_id=thread_id,
        content=message,
    )
