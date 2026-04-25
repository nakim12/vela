"""Manual smoke test for GET /api/sessions/{session_id}/pre.

Two terminals required:

  Terminal 1 (run the API):
      cd apps/api && source .venv/bin/activate
      uvicorn main:app --reload --port 8000

  Terminal 2 (run this script):
      cd apps/api && source .venv/bin/activate
      python -m scripts.smoke_pre_session_endpoint

What this script does:
  1. Seeds three memories on demo-user-1's assistant (anthropometry,
     injury, mobility) so the agent has something to ground on.
  2. Hits GET /api/sessions/demo-session-1/pre.
  3. Prints the JSON response and validates the banner has exactly 2
     non-empty lines.

Each uvicorn restart wipes the in-memory stubs but Backboard memories
persist across runs, so re-running this is cheap (no duplicate
assistant creation).
"""
from __future__ import annotations

import asyncio
import json

import httpx

from agents.runtime import ensure_assistant_for_user
from bb import get_client

USER_ID = "demo-user-1"
SESSION_ID = "demo-session-1"
ENDPOINT = f"http://localhost:8000/api/sessions/{SESSION_ID}/pre"


async def seed_memories() -> None:
    client = get_client()
    assistant_id = await ensure_assistant_for_user(client, USER_ID)
    print(f"[seed] assistant_id={assistant_id}")
    await client.add_memory(
        assistant_id,
        content=(
            "[anthropometry] Long femurs (femur:torso ~1.05). Forward lean "
            "tolerance is high; expect more torso angle than population default."
        ),
        metadata={"category": "anthropometry"},
    )
    await client.add_memory(
        assistant_id,
        content=(
            "[injury] Low back tweak Sept 2024 from a heavy good morning. "
            "Resolved, but flag any forward dump on squat as elevated risk."
        ),
        metadata={"category": "injuries"},
    )
    await client.add_memory(
        assistant_id,
        content=(
            "[mobility] Limited right ankle dorsiflexion (~20 deg). Tends to "
            "shift weight to the left foot at the bottom of the squat."
        ),
        metadata={"category": "mobility"},
    )


async def hit_endpoint() -> dict:
    print(f"[client] GET {ENDPOINT}")
    async with httpx.AsyncClient(timeout=60.0) as http:
        r = await http.get(ENDPOINT)
        r.raise_for_status()
        return r.json()


async def main() -> None:
    await seed_memories()
    body = await hit_endpoint()
    print("\n=== Response ===\n")
    print(json.dumps(body, indent=2))

    lines = body.get("lines", [])
    n = len(lines)
    status = "OK" if n == 2 else f"FAIL (expected 2, got {n})"
    print(f"\n[meta] line_count={n} target=2 {status}")


if __name__ == "__main__":
    asyncio.run(main())
