"""Manual smoke test for the post-set agent loop.

Run from ``apps/api/`` after setting BACKBOARD_API_KEY in your environment
(or in ``apps/api/.env``)::

    python -m scripts.smoke_post_set

The script will:
  1. Create (or reuse) a Backboard assistant for ``demo-user-1``.
  2. Seed two memories about the demo lifter.
  3. Fire the post-set loop with two hand-crafted squat ``RiskEvent`` s.
  4. Print whatever the agent ultimately writes back.

The same assistant id is cached in-process via the in-memory stub. Restart
the script and a new assistant will be created (since the stub is wiped).
"""
from __future__ import annotations

import asyncio

from agents.loops import post_set_loop
from agents.runtime import ensure_assistant_for_user
from bb import get_client
from models.risk_event import RiskEvent

USER_ID = "demo-user-1"
SESSION_ID = "demo-session-1"

SAMPLE_EVENTS = [
    RiskEvent(
        rule_id="KNEE_CAVE",
        lift="squat",
        rep_index=2,
        severity="warn",
        measured=8.4,
        threshold=6.0,
        frame_range=(140, 175),
        confidence=0.91,
        side="right",
    ),
    RiskEvent(
        rule_id="FORWARD_DUMP",
        lift="squat",
        rep_index=4,
        severity="info",
        measured=9.2,
        threshold=8.0,
        frame_range=(310, 350),
        confidence=0.86,
    ),
]


async def main() -> None:
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
            "[cue_preferences] Responds better to internal cues like "
            "'brace ribs down' than external cues like 'push the floor away'."
        ),
        metadata={"category": "cue_preferences"},
    )

    summary = await post_set_loop(
        client,
        user_id=USER_ID,
        session_id=SESSION_ID,
        events=SAMPLE_EVENTS,
    )
    print("\n=== Agent response ===\n")
    print(summary)


if __name__ == "__main__":
    asyncio.run(main())
