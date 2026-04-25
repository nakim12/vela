"""Side-by-side proof that the same events get materially different cues
from the two demo personas.

This is the headline §13 demo step 3 smoke test:

  * Same lift (squat).
  * Same telemetry (KNEE_CAVE on rep 2 right side, FORWARD_DUMP on rep 4,
    BUTT_WINK on rep 5).
  * Two different users with two different Backboard memory profiles +
    threshold overrides.
  * Two different summaries -> Backboard's per-user persistence is
    actually load-bearing, not decoration.

Prereqs:
  1. API is running (``uvicorn main:app --reload --port 8000``) so the
     fixture rows exist in Postgres.
  2. ``python -m scripts.seed_demo_personas`` has been run at least once
     so both assistants exist with their persona memories + thresholds.

Usage::

    cd apps/api && source .venv/bin/activate
    python -m scripts.smoke_personas_compare
"""
from __future__ import annotations

import asyncio

from agents.loops import post_set_loop
from bb import get_client
from db import stubs as db_stubs
from models.risk_event import RiskEvent

USER_1 = db_stubs.DEMO_USER_ID
USER_2 = db_stubs.DEMO_USER_ID_2
SESSION_1 = db_stubs.DEMO_SESSION_ID
SESSION_2 = db_stubs.DEMO_SESSION_ID_2

EVENTS = [
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
    RiskEvent(
        rule_id="BUTT_WINK",
        lift="squat",
        rep_index=5,
        severity="warn",
        measured=12.5,
        threshold=10.0,
        frame_range=(420, 460),
        confidence=0.88,
    ),
]


async def run_for(user_id: str, session_id: str, label: str) -> None:
    client = get_client()
    print(f"\n{'=' * 8} {label} ({user_id}) {'=' * 8}\n")
    await post_set_loop(
        client,
        user_id=user_id,
        session_id=session_id,
        events=EVENTS,
    )
    summary = db_stubs.get_session_summary(session_id) or "(no summary)"
    print(summary)


async def main() -> None:
    await run_for(USER_1, SESSION_1, "Persona A — Alex (long femurs, internal cues, low-back)")
    await run_for(USER_2, SESSION_2, "Persona B — Sam (short femurs, external cues, BUTT_WINK cleared)")
    print(
        "\n[done] Compare the two summaries: cue style (internal vs external), "
        "BUTT_WINK handling (flagged vs tolerated), and biomechanics framing "
        "should all differ even though the events were identical."
    )


if __name__ == "__main__":
    asyncio.run(main())
