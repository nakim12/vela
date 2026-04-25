"""WebSocket endpoint for live coaching during a set.

Frontend lifecycle (one connection per set):

  1. Connect to ``ws://<host>/ws/sessions/{session_id}``.
  2. Server sends ``{"type": "ready", "session_id": "..."}`` once the
     Backboard assistant + thread are in place.
  3. Client sends ``{"type": "events", "events": [RiskEvent, ...]}`` whenever
     the rules engine flags something. Server replies with
     ``{"type": "cue", "text": "<3-8 word cue or STOP>"}``.
  4. Client may send ``{"type": "ping"}`` for liveness; server replies
     ``{"type": "pong"}``.
  5. Client closes the socket when the set ends.

All other message types are ignored with an inline error so the client
can keep the socket open for retries.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from agents.loops import in_set_loop
from agents.runtime import ensure_assistant_for_user, ensure_thread_for_session
from bb import get_client
from db import stubs as db_stubs
from models.risk_event import RiskEvent

log = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/sessions/{session_id}")
async def session_ws(websocket: WebSocket, session_id: str) -> None:
    await websocket.accept()

    try:
        session = db_stubs.get_session(session_id)
    except KeyError:
        await websocket.close(code=1008, reason=f"unknown session {session_id}")
        return

    client = get_client()
    try:
        assistant_id = await ensure_assistant_for_user(client, session.user_id)
        await ensure_thread_for_session(client, session_id, assistant_id)
    except Exception as e:
        log.exception("ws setup failed for session %s", session_id)
        await websocket.send_json({"type": "error", "message": f"setup_failed: {e}"})
        await websocket.close(code=1011, reason="setup_failed")
        return

    await websocket.send_json({"type": "ready", "session_id": session_id})

    try:
        while True:
            msg = await websocket.receive_json()
            await _handle_message(
                websocket,
                client=client,
                user_id=session.user_id,
                session_id=session_id,
                msg=msg,
            )
    except WebSocketDisconnect:
        log.info("ws disconnected for session %s", session_id)


async def _handle_message(
    ws: WebSocket,
    *,
    client,
    user_id: str,
    session_id: str,
    msg: dict,
) -> None:
    msg_type = msg.get("type")

    if msg_type == "ping":
        await ws.send_json({"type": "pong"})
        return

    if msg_type == "events":
        raw_events = msg.get("events") or []
        try:
            events = [RiskEvent(**e) for e in raw_events]
        except (ValidationError, TypeError) as e:
            await ws.send_json({"type": "error", "message": f"bad_events: {e}"})
            return
        if not events:
            await ws.send_json({"type": "error", "message": "events_empty"})
            return

        try:
            cue = await in_set_loop(
                client,
                user_id=user_id,
                session_id=session_id,
                recent_events=events,
            )
        except Exception as e:
            log.exception("in_set_loop failed for session %s", session_id)
            await ws.send_json({"type": "error", "message": f"agent_failed: {e}"})
            return

        await ws.send_json({"type": "cue", "text": cue})
        return

    await ws.send_json({"type": "error", "message": f"unknown_type: {msg_type!r}"})
