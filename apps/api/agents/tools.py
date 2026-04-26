"""Agent tool definitions and dispatcher.

Tools are declared in the Backboard ``ToolDefinition`` (OpenAI function-calling)
shape so they can be passed straight into ``create_assistant(tools=...)``.

When the assistant returns ``REQUIRES_ACTION`` the runtime calls :func:`dispatch`
to execute the named tool with the parsed arguments and returns a JSON-encoded
result string ready for ``submit_tool_outputs``.
"""
from __future__ import annotations

import json
from typing import Any

from backboard import BackboardClient

from config import get_settings
from db import stubs as db_stubs

_corpus_thread_id: str | None = None

TOOL_DEFS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "query_user_kg",
            "description": (
                "Search this lifter's knowledge graph (anthropometry, mobility, "
                "injuries, cue_preferences, lift_history, sensitivity, threshold)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "description": (
                            "One of: anthropometry, mobility, injuries, "
                            "sensitivity, lift_history, cue_preferences, threshold."
                        ),
                    },
                    "query": {
                        "type": "string",
                        "description": "Natural-language search query.",
                    },
                },
                "required": ["category", "query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "log_observation",
            "description": (
                "Persist a new fact about the lifter to long-term memory. "
                "Tag it with the originating session id."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string"},
                    "fact": {"type": "string"},
                    "evidence_session_id": {"type": "string"},
                },
                "required": ["category", "fact", "evidence_session_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_threshold",
            "description": (
                "Override a population-default rule threshold for this lifter. "
                "Use only when the lifter consistently violates the default "
                "without injury risk and you have a clear justification."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string"},
                    "new_value": {"type": "number"},
                    "justification": {"type": "string"},
                    "evidence_session_id": {
                        "type": "string",
                        "description": (
                            "Session id whose telemetry motivates this "
                            "override. Required so the resulting memory "
                            "shows up in the originating session's "
                            "'What the agent learned' panel."
                        ),
                    },
                },
                "required": [
                    "rule_id",
                    "new_value",
                    "justification",
                    "evidence_session_id",
                ],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_research",
            "description": (
                "RAG over the shared coaching corpus (NSCA, Starting Strength, "
                "Squat University, peer-reviewed papers)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_session_summary",
            "description": "Persist the markdown post-set report to the user's session log.",
            "parameters": {
                "type": "object",
                "properties": {
                    "session_id": {"type": "string"},
                    "summary_md": {"type": "string"},
                },
                "required": ["session_id", "summary_md"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "recommend_load",
            "description": (
                "Update the lifter's prescribed working weight for their next "
                "session of this lift."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "lift": {"type": "string"},
                    "next_session_target": {
                        "type": "object",
                        "description": (
                            "Prescription for the next session of this lift. "
                            "Provide weight_lb (number), reps (integer), and "
                            "sets (integer)."
                        ),
                        "properties": {
                            "weight_lb": {"type": "number"},
                            "reps": {"type": "integer"},
                            "sets": {"type": "integer"},
                        },
                        "required": ["weight_lb", "reps", "sets"],
                    },
                },
                "required": ["lift", "next_session_target"],
            },
        },
    },
]


async def dispatch(
    name: str,
    arguments: dict[str, Any],
    *,
    client: BackboardClient,
    user_id: str,
    assistant_id: str,
    session_id: str | None = None,
) -> str:
    """Execute the named tool. Returns a JSON string for ``submit_tool_outputs``.

    ``session_id`` is the run's current session, used to backfill
    ``evidence_session_id`` when the LLM forgets to pass it. The schema marks
    that argument required, but Backboard occasionally surfaces tool calls
    without it; without this fallback the report fails mid-loop with a
    KeyError that bubbles up as ``agent_failed: 'evidence_session_id'``.
    For the coach-chat loop (no session) we leave it ``None``; the LLM gets
    a JSON error back and can retry with the field included.
    """
    # Defensive backfill: if the LLM omitted evidence_session_id but we know
    # which session this run is anchored to, fill it in. Mutating the
    # arguments dict locally is fine — it's already been parsed off the
    # tool-call payload and isn't reused upstream.
    if (
        name in ("log_observation", "update_threshold")
        and "evidence_session_id" not in arguments
        and session_id is not None
    ):
        arguments["evidence_session_id"] = session_id

    if name == "query_user_kg":
        result = await client.search_memories(
            assistant_id,
            query=f"[{arguments['category']}] {arguments['query']}",
            limit=8,
        )
        memories = [
            {"content": m.get("content"), "score": m.get("score")}
            for m in result.get("memories", [])
        ]
        return json.dumps({"memories": memories})

    if name == "log_observation":
        await client.add_memory(
            assistant_id,
            content=f"[{arguments['category']}] {arguments['fact']}",
            metadata={
                "category": arguments["category"],
                "session_id": arguments["evidence_session_id"],
            },
        )
        return json.dumps({"ok": True})

    if name == "update_threshold":
        db_stubs.upsert_threshold(
            user_id,
            arguments["rule_id"],
            float(arguments["new_value"]),
            arguments["justification"],
        )
        await client.add_memory(
            assistant_id,
            content=(
                f"[threshold] {arguments['rule_id']} = {arguments['new_value']} "
                f"— {arguments['justification']}"
            ),
            metadata={
                "category": "threshold",
                "rule_id": arguments["rule_id"],
                # Tag with session id so the resulting memory shows up in
                # the originating session's "What the agent learned" panel.
                # Old memories written before evidence_session_id was a
                # required arg won't have this — they'll keep showing in
                # the global lifter memory but stop appearing per-session,
                # which matches what the panel's docstring promises.
                "session_id": arguments["evidence_session_id"],
            },
        )
        return json.dumps({"ok": True})

    if name == "search_research":
        return await _search_research(client, query=arguments.get("query", ""))

    if name == "write_session_summary":
        db_stubs.write_session_summary(
            arguments["session_id"],
            arguments["summary_md"],
        )
        return json.dumps({"ok": True})

    if name == "recommend_load":
        target = arguments["next_session_target"]
        db_stubs.upsert_program(
            user_id,
            arguments["lift"],
            float(target["weight_lb"]),
            int(target["reps"]),
            int(target["sets"]),
        )
        return json.dumps(
            {"ok": True, "lift": arguments["lift"], "target": target}
        )

    return json.dumps({"error": f"unknown tool: {name}"})


async def _search_research(client: BackboardClient, *, query: str) -> str:
    """Query the shared corpus assistant for relevant excerpts.

    Falls back to a stub when CORPUS_ASSISTANT_ID is unset (i.e. before
    `python -m scripts.upload_corpus` has been run for the first time).
    A single thread is reused across calls in the same process to keep
    Backboard usage cheap; thread creation only happens once.
    """
    global _corpus_thread_id

    settings = get_settings()
    corpus_id = settings.corpus_assistant_id
    if not corpus_id:
        return json.dumps({"results": [], "note": "corpus not yet uploaded"})

    if _corpus_thread_id is None:
        thread = await client.create_thread(corpus_id)
        _corpus_thread_id = str(thread.thread_id)

    response = await client.add_message(
        thread_id=_corpus_thread_id,
        content=(
            "Find the most relevant excerpts in the uploaded corpus for "
            f"this query, and quote the source filename. Query: {query}"
        ),
        stream=False,
    )
    answer = getattr(response, "content", "") or ""
    return json.dumps({"results": [{"text": answer}]})
