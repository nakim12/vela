"""Assistant lifecycle and the tool-handling run loop."""
from __future__ import annotations

import json
import logging
import os
from typing import Any
from uuid import UUID

from backboard import BackboardClient

from agents.prompts import COACH_SYSTEM_PROMPT
from agents.tools import TOOL_DEFS, dispatch
from db import stubs as db_stubs

log = logging.getLogger(__name__)
DEBUG_AGENT = os.environ.get("DEBUG_AGENT") == "1"


def _is_real_thread_id(value: str | None) -> bool:
    """Backboard requires real UUIDs for thread_id. Some session rows are
    created with placeholder strings (see store.create_session, which writes
    ``thread_placeholder_<hex>`` so the column can be NOT NULL before the
    first agent run). Treat those as "no thread yet" so we create a real one
    on the first agent call and persist it back via set_session_thread_id.
    """
    if not value:
        return False
    try:
        UUID(str(value))
    except (TypeError, ValueError):
        return False
    return True


async def ensure_assistant_for_user(
    client: BackboardClient, user_id: str
) -> str:
    """Idempotently create a Backboard assistant for the user. Returns its id."""
    user = db_stubs.get_user(user_id)
    if user.backboard_assistant_id:
        return user.backboard_assistant_id

    assistant = await client.create_assistant(
        name=f"vela-coach-{user_id}",
        system_prompt=COACH_SYSTEM_PROMPT,
        tools=TOOL_DEFS,
    )
    db_stubs.set_user_assistant_id(user_id, assistant.assistant_id)
    return assistant.assistant_id


async def ensure_thread_for_session(
    client: BackboardClient, session_id: str, assistant_id: str
) -> str:
    session = db_stubs.get_session(session_id)
    if _is_real_thread_id(session.bb_thread_id):
        return session.bb_thread_id

    thread = await client.create_thread(assistant_id)
    db_stubs.set_session_thread_id(session_id, thread.thread_id)
    return thread.thread_id


# Coach-chat threads aren't tied to a workout session, so they don't live in
# the sessions table. Cache one per user in-process; resets on uvicorn restart
# (acceptable for MVP — Backboard memories persist across restarts anyway, so
# a fresh thread on the same assistant still has full personalization).
_COACH_THREADS: dict[str, str] = {}


async def ensure_coach_thread_for_user(
    client: BackboardClient, user_id: str, assistant_id: str
) -> str:
    cached = _COACH_THREADS.get(user_id)
    if cached:
        return cached

    thread = await client.create_thread(assistant_id)
    thread_id = str(thread.thread_id)
    _COACH_THREADS[user_id] = thread_id
    return thread_id


def _tool_call_to_dict(tc: Any) -> dict[str, Any]:
    """Normalise a ToolCall (pydantic model OR raw dict) to a plain dict."""
    if isinstance(tc, dict):
        return tc
    if hasattr(tc, "model_dump"):
        return tc.model_dump()
    return {
        "id": getattr(tc, "id", ""),
        "type": getattr(tc, "type", "function"),
        "function": {
            "name": getattr(getattr(tc, "function", None), "name", ""),
            "arguments": getattr(getattr(tc, "function", None), "arguments", "{}"),
        },
    }


def _collect_tool_calls_by_run(response: Any) -> dict[str, list[dict[str, Any]]]:
    """Walk the response, grouping tool_calls by their owning run_id.

    Two response shapes need to be handled:

    * ``ChatMessagesResponse`` (returned by ``add_message``) carries a
      ``messages`` list; tool_calls and run_id live on individual messages.
    * ``ToolOutputsResponse`` (returned by ``submit_tool_outputs``) carries
      ``tool_calls`` and ``run_id`` directly on the response object.

    Submitting a ``tool_call_id`` against the wrong run yields ``Invalid
    tool_call_id ... not part of the assistant's request``, so we group
    explicitly by run_id rather than relying on ``response.run_id``.
    """
    grouped: dict[str, list[dict[str, Any]]] = {}

    messages = getattr(response, "messages", None)
    if messages:
        for msg in messages:
            if not isinstance(msg, dict):
                continue
            run_id = msg.get("run_id")
            raw_calls = msg.get("tool_calls")
            if not run_id or not raw_calls:
                continue
            grouped.setdefault(run_id, []).extend(
                _tool_call_to_dict(tc) for tc in raw_calls
            )
        return grouped

    tcs = getattr(response, "tool_calls", None)
    run_id = getattr(response, "run_id", None)
    if tcs and run_id:
        grouped[run_id] = [_tool_call_to_dict(tc) for tc in tcs]
    return grouped


def _has_action(response: Any) -> bool:
    """True if the response (or any of its messages) is awaiting tool outputs."""
    if getattr(response, "status", None) == "REQUIRES_ACTION":
        return True
    messages = getattr(response, "messages", None) or []
    return any(
        isinstance(m, dict) and m.get("status") == "REQUIRES_ACTION"
        for m in messages
    )


async def run_until_done(
    client: BackboardClient,
    *,
    user_id: str,
    assistant_id: str,
    thread_id: str,
    content: str,
    memory: str = "Auto",
    max_iterations: int = 6,
) -> str:
    """Send a message, then keep submitting tool outputs until the run ends.

    Returns the final assistant message content.
    """
    response = await client.add_message(
        thread_id=thread_id,
        content=content,
        memory=memory,
        stream=False,
    )

    # ToolOutputsResponse echoes the *cumulative* tool_calls of the run, so we
    # must remember which tool_call_ids we have already submitted and only
    # submit outputs for the new ones. Submitting a previously-handled id
    # raises "Invalid tool_call_id ... not part of the assistant's request".
    submitted_ids_per_run: dict[str, set[str]] = {}

    for iteration in range(max_iterations):
        if DEBUG_AGENT:
            print(f"\n--- iteration {iteration} ---")
            print(f"type={type(response).__name__} "
                  f"top-level status={getattr(response, 'status', None)!r} "
                  f"run_id={getattr(response, 'run_id', None)!r} "
                  f"top-level n_tool_calls={len(getattr(response, 'tool_calls', None) or [])}")
            messages = getattr(response, "messages", None) or []
            for i, m in enumerate(messages):
                if isinstance(m, dict):
                    print(f"  msg[{i}] status={m.get('status')!r} "
                          f"run_id={m.get('run_id')!r} "
                          f"n_tool_calls={len(m.get('tool_calls') or [])} "
                          f"content_len={len(m.get('content') or '')}")

        if not _has_action(response):
            break

        grouped = _collect_tool_calls_by_run(response)
        if not grouped:
            if DEBUG_AGENT:
                print("REQUIRES_ACTION but no tool_calls found")
            break

        any_new = False
        next_response = response
        for run_id, raw_calls in grouped.items():
            already = submitted_ids_per_run.setdefault(run_id, set())
            new_calls = [
                tc for tc in raw_calls if tc.get("id") and tc.get("id") not in already
            ]
            if DEBUG_AGENT:
                print(f"  run {run_id}: {len(raw_calls)} total, "
                      f"{len(new_calls)} new "
                      f"(already handled: {len(already)})")
            if not new_calls:
                continue
            any_new = True

            tool_outputs: list[dict[str, str]] = []
            for raw in new_calls:
                fn = raw.get("function") or {}
                args_raw = fn.get("arguments")
                if isinstance(args_raw, str):
                    try:
                        args = json.loads(args_raw or "{}")
                    except json.JSONDecodeError:
                        args = {}
                elif isinstance(args_raw, dict):
                    args = args_raw
                else:
                    args = {}
                name = fn.get("name", "")
                tool_call_id = raw.get("id", "")
                if DEBUG_AGENT:
                    preview = (
                        json.dumps(args)[:120] + "..."
                        if len(json.dumps(args)) > 120
                        else json.dumps(args)
                    )
                    print(f"  -> dispatch {name}({preview}) id={tool_call_id}")
                output = await dispatch(
                    name,
                    args,
                    client=client,
                    user_id=user_id,
                    assistant_id=assistant_id,
                )
                tool_outputs.append({"tool_call_id": tool_call_id, "output": output})
                already.add(tool_call_id)

            next_response = await client.submit_tool_outputs(
                thread_id=thread_id,
                run_id=run_id,
                tool_outputs=tool_outputs,
            )

        if not any_new:
            if DEBUG_AGENT:
                print("REQUIRES_ACTION but no new tool_calls; bailing")
            break
        response = next_response

    return getattr(response, "content", "") or ""
