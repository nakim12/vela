"""Manual smoke test for the pre-session agent loop.

Run from ``apps/api/`` after setting BACKBOARD_API_KEY in your environment
(or in ``apps/api/.env``)::

    python -m scripts.smoke_pre_session

The script will:
  1. Create (or reuse) a Backboard assistant for ``demo-user-1``.
  2. Seed three memories (anthropometry, an injury note, a mobility flag).
  3. Fire the pre-session loop for a planned squat session.
  4. Print the 2-line "today's watch list" banner the agent produces.

Expected behaviour: the banner should reference the injury and mobility flag
without inventing anything. If it produces three lines, hedges, or adds
preamble like "Here's your watch list:", the system prompt or the loop
prompt needs tightening.
"""
from __future__ import annotations

import asyncio

from agents.loops import pre_session_loop
from agents.runtime import ensure_assistant_for_user
from bb import get_client

USER_ID = "demo-user-1"
SESSION_ID = "demo-session-1"
LIFT = "squat"


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

    banner = await pre_session_loop(
        client,
        user_id=USER_ID,
        session_id=SESSION_ID,
        lift=LIFT,
    )
    print("\n=== Agent response ===\n")
    print(banner)
    print("\n[meta] line_count =", len([ln for ln in banner.splitlines() if ln.strip()]))


if __name__ == "__main__":
    asyncio.run(main())
