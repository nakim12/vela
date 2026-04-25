"""Manual smoke test for the in-set agent loop.

Run from ``apps/api/`` after setting BACKBOARD_API_KEY in your environment
(or in ``apps/api/.env``)::

    python -m scripts.smoke_in_set

The script will:
  1. Create (or reuse) a Backboard assistant for ``demo-user-1``.
  2. Seed a cue-preference memory (so personalization has something to use).
  3. Fire the in-set loop with a single ``KNEE_CAVE`` event.
  4. Print the cue and a word-count check.

Expected behaviour: a 3-8 word cue (no preamble, no markdown). If the cue
is longer than 8 words, the prompt or system prompt needs tightening
before this gets piped into TTS in the browser.
"""
from __future__ import annotations

import asyncio

from agents.loops import in_set_loop
from agents.runtime import ensure_assistant_for_user
from bb import get_client
from models.risk_event import RiskEvent

USER_ID = "demo-user-1"
SESSION_ID = "demo-session-1"

EVENT = RiskEvent(
    rule_id="KNEE_CAVE",
    lift="squat",
    rep_index=3,
    severity="warn",
    measured=9.1,
    threshold=6.0,
    frame_range=(220, 260),
    confidence=0.92,
    side="right",
)


async def main() -> None:
    client = get_client()
    assistant_id = await ensure_assistant_for_user(client, USER_ID)
    print(f"[seed] assistant_id={assistant_id}")

    await client.add_memory(
        assistant_id,
        content=(
            "[cue_preferences] Responds better to internal cues like "
            "'brace ribs down' than external cues like 'push the floor away'."
        ),
        metadata={"category": "cue_preferences"},
    )

    cue = await in_set_loop(
        client,
        user_id=USER_ID,
        session_id=SESSION_ID,
        recent_events=[EVENT],
    )
    cue = cue.strip()
    word_count = len(cue.split())
    print("\n=== Agent response ===\n")
    print(repr(cue))
    print(f"\n[meta] word_count={word_count} target=3-8 "
          f"{'OK' if 3 <= word_count <= 8 else 'OUT OF RANGE'}")


if __name__ == "__main__":
    asyncio.run(main())
