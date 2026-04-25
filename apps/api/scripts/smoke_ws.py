"""Manual smoke test for the in-set WebSocket endpoint.

Two terminals required:

  Terminal 1 (run the API):
      cd apps/api && source .venv/bin/activate
      uvicorn main:app --reload --port 8000

  Terminal 2 (run this script):
      cd apps/api && source .venv/bin/activate
      python -m scripts.smoke_ws

What this script does:
  1. Opens a WebSocket to /ws/sessions/demo-session-1.
  2. Waits for the server's "ready" frame.
  3. Sends a single fake KNEE_CAVE event.
  4. Prints whatever cue the server sends back.
  5. Sends a ping, prints the pong, then closes.

Note: each uvicorn restart wipes the in-memory stub, so a brand-new
Backboard assistant gets created on first connect (visible in the API
log). The assistant has no seeded memories here, so the cue may be
generic. That's fine for connectivity validation -- personalization
quality is covered by the dedicated smoke_in_set.py script.
"""
from __future__ import annotations

import asyncio
import json

from websockets.asyncio.client import connect

URI = "ws://localhost:8000/ws/sessions/demo-session-1"

EVENT = {
    "rule_id": "KNEE_CAVE",
    "lift": "squat",
    "rep_index": 3,
    "severity": "warn",
    "measured": 9.1,
    "threshold": 6.0,
    "frame_range": [220, 260],
    "confidence": 0.92,
    "side": "right",
}


async def main() -> None:
    print(f"[client] connecting to {URI}")
    async with connect(URI) as ws:
        ready = json.loads(await ws.recv())
        print(f"[server] {ready}")
        if ready.get("type") != "ready":
            raise RuntimeError(f"expected 'ready', got {ready}")

        await ws.send(json.dumps({"type": "events", "events": [EVENT]}))
        cue = json.loads(await ws.recv())
        print(f"[server] {cue}")

        await ws.send(json.dumps({"type": "ping"}))
        pong = json.loads(await ws.recv())
        print(f"[server] {pong}")

    print("[client] socket closed cleanly")


if __name__ == "__main__":
    asyncio.run(main())
