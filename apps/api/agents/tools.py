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

from db import stubs as db_stubs

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
                },
                "required": ["rule_id", "new_value", "justification"],
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
) -> str:
    """Execute the named tool. Returns a JSON string for ``submit_tool_outputs``."""
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
            metadata={"category": "threshold", "rule_id": arguments["rule_id"]},
        )
        return json.dumps({"ok": True})

    if name == "search_research":
        # TODO: route through Backboard documents once the corpus is uploaded.
        return json.dumps({"results": [], "note": "corpus not yet uploaded"})

    if name == "write_session_summary":
        db_stubs.write_session_summary(
            arguments["session_id"],
            arguments["summary_md"],
        )
        return json.dumps({"ok": True})

    if name == "recommend_load":
        # TODO: route to programming table once BE-A lands it.
        return json.dumps(
            {
                "ok": True,
                "lift": arguments["lift"],
                "target": arguments["next_session_target"],
            }
        )

    return json.dumps({"error": f"unknown tool: {name}"})
