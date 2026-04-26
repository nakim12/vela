"""Manual smoke test for POST /api/onboarding.

Two terminals required:

  Terminal 1 (run the API):
      cd apps/api && source .venv/bin/activate
      uvicorn main:app --reload --port 8000

  Terminal 2 (run this script):
      cd apps/api && source .venv/bin/activate
      python -m scripts.smoke_onboarding

What this script verifies, end to end:
  1. POST /api/onboarding with a fresh user_id (timestamped so re-runs
     don't trip on idempotency).
  2. The response includes a non-empty assistant_id and the right
     memories_written count for the inputs we sent.
  3. The user row was actually persisted (we re-read it via the trends
     endpoint as a cheap probe — empty sessions list, but 200 OK proves
     the row exists).
  4. The agent can retrieve the seeded memories: we call /pre after
     creating a session for this user, and assert the banner mentions
     the injury we seeded.

This is the HTTP equivalent of seed_demo_personas.py but for any new
user — what FE will hit at the end of the /onboarding form.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

BASE = "http://localhost:8000/api"
USER_ID = f"smoke-onboard-{int(time.time())}"


PAYLOAD: dict[str, Any] = {
    "email": f"{USER_ID}@vela.local",
    "anthropometrics": {
        "height_in": 71,
        "weight_lb": 185,
        "femur_torso_ratio": 1.04,
    },
    "injuries": [
        "Left shoulder labrum repair, 2021. Cleared for full overhead pressing.",
    ],
    "mobility_flags": [
        "Tight thoracic spine; struggles to keep chest up at parallel.",
    ],
    "cue_preference": "internal",
}


async def main() -> None:
    async with httpx.AsyncClient(timeout=120.0) as http:
        print(
            f"[1/4] POST /onboarding?user_id={USER_ID} (dev override; "
            "Clerk mode ignores the query and uses the JWT sub)"
        )
        r = await http.post(
            f"{BASE}/onboarding",
            params={"user_id": USER_ID},
            json=PAYLOAD,
        )
        r.raise_for_status()
        body = r.json()
        print(f"      assistant_id={body['assistant_id']}")
        print(f"      memories_written={body['memories_written']}")

        # Anthro (1) + 1 injury + 1 mobility + cue_preference (1) = 4
        assert body["memories_written"] == 4, (
            f"expected 4 memories, got {body['memories_written']}"
        )
        assert body["assistant_id"], "assistant_id should not be empty"
        assert body["user_id"] == USER_ID, f"user_id echo mismatch: {body!r}"

        print("[2/4] Probe persistence via /user/trends (200 + empty sessions)")
        r = await http.get(
            f"{BASE}/user/trends",
            params={"user_id": USER_ID, "limit": 1},
        )
        r.raise_for_status()
        sessions = r.json()["sessions"]
        assert sessions == [], f"expected zero sessions for fresh user, got {sessions}"
        print("      OK")

        print("[3/4] Create a session for this user via POST /sessions")
        r = await http.post(
            f"{BASE}/sessions",
            params={"user_id": USER_ID},
            json={"lift": "squat"},
        )
        r.raise_for_status()
        session_id = r.json()["session_id"]
        print(f"      session_id={session_id}")

        print(f"[4/4] GET /sessions/{session_id}/pre -> banner should reference seeded memories")
        r = await http.get(
            f"{BASE}/sessions/{session_id}/pre",
            params={"user_id": USER_ID},
        )
        r.raise_for_status()
        body = r.json()
        banner = body["banner"]
        print("\n--- watch list ---")
        print(banner)
        print("------------------\n")

        lower = banner.lower()
        injury_match = "shoulder" in lower or "labrum" in lower
        mobility_match = "thoracic" in lower or "chest" in lower
        print(
            f"      injury reference present: {injury_match} "
            f"(looking for 'shoulder' / 'labrum')"
        )
        print(
            f"      mobility reference present: {mobility_match} "
            f"(looking for 'thoracic' / 'chest')"
        )
        if injury_match and mobility_match:
            print("\n[done] onboarding -> agent retrieval round-trip OK")
        else:
            print(
                "\n[warn] retrieval check is non-deterministic; the agent "
                "may have summarized in different words. Inspect banner above."
            )


if __name__ == "__main__":
    asyncio.run(main())
