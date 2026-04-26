"""Manual smoke test for POST /api/coach/message.

Two terminals required:

  Terminal 1 (run the API):
      cd apps/api && source .venv/bin/activate
      uvicorn main:app --reload --port 8000

  Terminal 2 (run this script):
      cd apps/api && source .venv/bin/activate
      python -m scripts.smoke_coach_message

What this script does:
  1. Seeds a few personalization memories on demo-user-1's assistant
     (anthropometry + cue preference + recent rule history) so the coach
     has something to personalize on.
  2. Sends two chat messages back-to-back through the same persistent
     coach thread:
       a. "How should I approach my next squat session?"
          -> exercises query_user_kg + search_research grounding.
       b. "Quick — remind me what we just talked about?"
          -> proves the second turn lands on the same thread (continuity).
  3. Prints both replies and a short sanity check (non-empty, references
     the lift / prior turn).

Backboard memories persist across uvicorn restarts, so re-running this
script is cheap. Threads, however, are cached in-process — restarting
uvicorn starts a fresh chat.
"""
from __future__ import annotations

import asyncio
import json

import httpx

from agents.runtime import ensure_assistant_for_user
from bb import get_client

USER_ID = "demo-user-1"
ENDPOINT = "http://localhost:8000/api/coach/message"


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
            "[cue_preference] Responds well to internal cues "
            "(e.g. 'spread the floor', 'brace ribs down'). External cues "
            "feel vague to this user."
        ),
        metadata={"category": "preferences"},
    )
    await client.add_memory(
        assistant_id,
        content=(
            "[recent_history] Last squat session: knee cave on rep 2 right "
            "side, forward dump on rep 4. Both have happened 3+ times in "
            "the past month."
        ),
        metadata={"category": "history"},
    )


async def send(http: httpx.AsyncClient, message: str) -> dict:
    # user_id is no longer in the body — it's resolved from the Clerk session
    # token. When CLERK_JWT_ISSUER is unset (local dev), the backend maps all
    # requests to settings.demo_user_id (default "demo-user-1"), which is what
    # USER_ID here is set to, so the smoke script stays a one-liner.
    print(f"\n[client] POST {ENDPOINT}\n[client] message={message!r}")
    r = await http.post(ENDPOINT, json={"message": message})
    r.raise_for_status()
    return r.json()


async def main() -> None:
    await seed_memories()
    async with httpx.AsyncClient(timeout=120.0) as http:
        first = await send(
            http, "How should I approach my next squat session?"
        )
        print("\n=== Reply 1 ===\n")
        print(json.dumps(first, indent=2))

        second = await send(
            http, "Quick — remind me in one sentence what we just talked about?"
        )
        print("\n=== Reply 2 ===\n")
        print(json.dumps(second, indent=2))

    r1 = first.get("reply", "")
    r2 = second.get("reply", "")
    checks = {
        "reply1_nonempty": bool(r1.strip()),
        "reply1_mentions_squat": "squat" in r1.lower(),
        "reply2_nonempty": bool(r2.strip()),
        "reply2_shows_continuity": any(
            kw in r2.lower() for kw in ("squat", "knee", "cue", "lean", "femur")
        ),
    }
    print("\n[meta] sanity checks:")
    for k, v in checks.items():
        print(f"  {k}: {'OK' if v else 'FAIL'}")


if __name__ == "__main__":
    asyncio.run(main())
