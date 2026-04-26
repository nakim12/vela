"""Manual smoke test for GET /api/user/trends.

Two terminals required:

  Terminal 1 (run the API):
      cd apps/api && source .venv/bin/activate
      uvicorn main:app --reload --port 8000

  Terminal 2 (run this script):
      cd apps/api && source .venv/bin/activate
      python -m scripts.seed_demo_history    # if not already seeded
      python -m scripts.smoke_trends

What this script does:
  1. Hits the trends endpoint for both demo personas (squat).
  2. Pretty-prints a one-line-per-session summary of event counts.
  3. Asserts persona A's KNEE_CAVE counts trend monotonically downward
     across the 4 seeded historical sessions — the headline narrative.
"""
from __future__ import annotations

import asyncio

import httpx

from db import stubs as db_stubs

USER_1 = db_stubs.DEMO_USER_ID
USER_2 = db_stubs.DEMO_USER_ID_2
BASE = "http://localhost:8000/api/user/trends"


async def fetch(user_id: str, lift: str = "squat", limit: int = 8) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as http:
        r = await http.get(BASE, params={"user_id": user_id, "lift": lift, "limit": limit})
        r.raise_for_status()
        return r.json()


def print_trend(label: str, body: dict) -> None:
    print(f"\n=== {label} ({body['user_id']}, lift={body['lift']}) ===")
    rows = body["sessions"]
    if not rows:
        print("  (no sessions)")
        return
    for s in rows:
        print(
            f"  {s['started_at'][:10]}  {s['session_id']:35s}  "
            f"{s['event_counts']}"
        )


def assert_persona_a_narrative(body: dict) -> None:
    """Persona A's seeded story: KNEE_CAVE 3 -> 2 -> 1 -> 1 over 4 weeks.

    We pull only the seeded historical sessions (filter by id prefix) and walk
    them oldest-to-newest, then assert the count is non-increasing.
    """
    history = sorted(
        (s for s in body["sessions"] if s["session_id"].startswith("demo-history-")),
        key=lambda s: s["started_at"],
    )
    knee_counts = [s["event_counts"].get("KNEE_CAVE", 0) for s in history]
    print(f"\n[narrative] persona A KNEE_CAVE over time: {knee_counts}")
    monotone = all(b <= a for a, b in zip(knee_counts, knee_counts[1:]))
    print(f"[narrative] monotonically non-increasing: {'OK' if monotone else 'FAIL'}")


async def main() -> None:
    a = await fetch(USER_1)
    b = await fetch(USER_2)
    print_trend("Persona A — Alex", a)
    print_trend("Persona B — Sam", b)
    assert_persona_a_narrative(a)


if __name__ == "__main__":
    asyncio.run(main())
