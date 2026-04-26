"""High-level agent loops invoked from API routes / WebSocket handlers."""
from __future__ import annotations

import json
import logging
from datetime import date
from typing import Iterable

from backboard import BackboardClient

from agents.runtime import (
    ensure_assistant_for_user,
    ensure_coach_thread_for_user,
    ensure_thread_for_session,
    run_until_done,
)
from models.risk_event import RiskEvent

log = logging.getLogger(__name__)

# Severity ordering for "peak severity" rollups in the deterministic
# session-summary memory. Tracks ``RiskSeverity`` in models/risk_event.py.
_SEVERITY_RANK = {"info": 0, "warn": 1, "high": 2}


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

    # The lift comes off any of the events (they all share it within a session).
    # We pass it explicitly in the prompt so the agent doesn't have to infer the
    # spelling for the recommend_load tool call.
    events_list = list(events)
    lift = events_list[0].lift if events_list else "squat"

    payload = {
        "session_id": session_id,
        "lift": lift,
        "events": [e.model_dump() for e in events_list],
    }
    prompt = (
        "End of set. Telemetry below.\n\n"
        "REQUIRED workflow:\n"
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
        "section listing the corpus filenames you cited.\n"
        "  6. ALWAYS finish by calling recommend_load with the lift from the "
        "payload and a next_session_target {weight_lb, reps, sets}. Pick a "
        "sensible target that reflects what you just observed: hold or back "
        "off if form broke down, progress conservatively if it didn't. If you "
        "have no prior weight to anchor on, default to a beginner-safe target "
        "(squat 135x5x3, bench 95x5x3, deadlift 185x5x3).\n\n"
        f"```json\n{json.dumps(payload, indent=2)}\n```"
    )
    summary = await run_until_done(
        client,
        user_id=user_id,
        assistant_id=assistant_id,
        thread_id=thread_id,
        content=prompt,
        session_id=session_id,
    )

    # Deterministic session-tagged memory write. The LLM is invited (via
    # step 3 in the prompt) to call log_observation when it spots a
    # personalized pattern, but that call is optional and frequently
    # skipped — leaving the "What the agent learned" panel empty even
    # for sets full of risk events. Writing a factual rollup of the
    # telemetry here guarantees every session has at least one entry,
    # which is both honest UX and useful context the agent can recall
    # later via query_user_kg.
    #
    # Wrapped in a broad try/except: if the memory write fails (Backboard
    # transient, network blip), we still want the report to surface.
    try:
        rollup = _summarize_events_for_memory(lift=lift, events=events_list)
        await client.add_memory(
            assistant_id,
            content=f"[session_telemetry] {rollup}",
            metadata={
                "category": "session_telemetry",
                "session_id": session_id,
            },
        )
    except Exception:
        log.exception(
            "deterministic session_telemetry memory write failed "
            "(session=%s assistant=%s)",
            session_id, assistant_id,
        )

    return summary


def _summarize_events_for_memory(
    *, lift: str, events: list[RiskEvent]
) -> str:
    """One-line factual rollup of a session's risk events.

    Designed to be both human-readable in the memory panel and useful
    context for the agent on a later session via ``query_user_kg``.
    Format examples::

        Squat session 2026-04-26: clean — 0 risk events.
        Squat session 2026-04-26: 4 risk events — KNEE_CAVE×3 (left)
        peak warn, HEEL_LIFT×1 (right) peak info. Events through rep 5.
    """
    today = date.today().isoformat()
    lift_label = lift.title()
    if not events:
        return f"{lift_label} session {today}: clean — 0 risk events."

    by_rule: dict[str, dict] = {}
    for e in events:
        g = by_rule.setdefault(
            e.rule_id, {"count": 0, "peak": "info", "sides": set()}
        )
        g["count"] += 1
        if _SEVERITY_RANK.get(e.severity, 0) > _SEVERITY_RANK[g["peak"]]:
            g["peak"] = e.severity
        if e.side and e.side != "both":
            g["sides"].add(e.side)

    parts: list[str] = []
    for rule_id, g in sorted(by_rule.items()):
        sides = "/".join(sorted(g["sides"])) if g["sides"] else ""
        side_str = f" ({sides})" if sides else ""
        parts.append(f"{rule_id}×{g['count']}{side_str} peak {g['peak']}")

    rep_max = max(e.rep_index for e in events)
    return (
        f"{lift_label} session {today}: {len(events)} risk events — "
        + ", ".join(parts)
        + f". Events through rep {rep_max}."
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
        session_id=session_id,
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
        session_id=session_id,
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
