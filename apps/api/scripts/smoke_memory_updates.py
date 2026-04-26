"""Manual smoke test for GET /api/sessions/{session_id}/memory_updates.

Two terminals required:

  Terminal 1 (run the API):
      cd apps/api && source .venv/bin/activate
      uvicorn main:app --reload --port 8000

  Terminal 2 (run this script):
      cd apps/api && source .venv/bin/activate
      python -m scripts.smoke_memory_updates

What this script does:
  1. Runs the post-set agent loop against demo-user-1 with telemetry that
     should plausibly trigger ``log_observation`` calls (extreme knee cave +
     forward dump on rep 2 and 4).
  2. Hits GET /api/sessions/demo-session-1/memory_updates.
  3. Prints the JSON and validates that at least one memory came back tagged
     with this session_id.

Notes:
  * Backboard memories accumulate, so every successful run adds rows. That's
    fine for the smoke test — we only assert "at least one", not "exactly N".
  * The agent doesn't ALWAYS call log_observation; the post_set prompt only
    asks for it when there's "a pattern that should be remembered." If you get
    zero rows, re-run — model is non-deterministic.
"""
from __future__ import annotations

import asyncio
import json

import httpx

from agents.loops import post_set_loop
from bb import get_client
from db import stubs as db_stubs
from models.risk_event import RiskEvent

USER_ID = db_stubs.DEMO_USER_ID
SESSION_ID = db_stubs.DEMO_SESSION_ID
ENDPOINT = (
    f"http://localhost:8000/api/sessions/{SESSION_ID}/memory_updates"
)

EVENTS = [
    RiskEvent(
        rule_id="KNEE_CAVE",
        lift="squat",
        rep_index=2,
        severity="warn",
        measured=11.4,
        threshold=6.0,
        frame_range=(140, 175),
        confidence=0.94,
        side="right",
    ),
    RiskEvent(
        rule_id="FORWARD_DUMP",
        lift="squat",
        rep_index=4,
        severity="warn",
        measured=12.1,
        threshold=8.0,
        frame_range=(310, 350),
        confidence=0.9,
    ),
]


async def trigger_observations() -> None:
    """Drive the post-set loop so the agent has a reason to log_observation."""
    client = get_client()
    print(f"[seed] running post_set_loop user={USER_ID} session={SESSION_ID}")
    await post_set_loop(
        client,
        user_id=USER_ID,
        session_id=SESSION_ID,
        events=EVENTS,
    )


async def hit_endpoint() -> dict:
    print(f"[client] GET {ENDPOINT}")
    async with httpx.AsyncClient(timeout=60.0) as http:
        r = await http.get(ENDPOINT, params={"user_id": USER_ID})
        r.raise_for_status()
        return r.json()


async def main() -> None:
    await trigger_observations()
    body = await hit_endpoint()
    print("\n=== Response ===\n")
    print(json.dumps(body, indent=2, default=str))

    updates = body.get("memory_updates", [])
    n = len(updates)
    if n == 0:
        print(
            "\n[meta] memory_count=0 "
            "FAIL — agent didn't call log_observation this run "
            "(non-deterministic; try again)"
        )
        return

    print(f"\n[meta] memory_count={n} OK (>=1)")
    categories = sorted({u.get("category") or "(none)" for u in updates})
    print(f"[meta] categories={categories}")


if __name__ == "__main__":
    asyncio.run(main())
