"""Route-level smoke for the ``target`` field on GET /api/sessions/:id/pre.

Companion to ``smoke_pre_session.py`` (which exercises the agent loop in
isolation against a stub session). This one drives the *HTTP route* end to
end and checks the ``target`` payload our recent change added — the
deterministic ``recommend_load`` prescription pulled straight from the
``programs`` table, NOT something the LLM repeats.

What it verifies:
  1. /pre returns ``target`` populated for a demo user who already has a
     row in ``programs`` (true after seed_demo_history runs).
  2. The same target round-trips correctly when we ``upsert_program`` a
     new prescription via the agent's recommend_load tool path — i.e.
     prescribing 165x5x3 makes /pre report 165x5x3 on the next call.
  3. /pre returns ``target: null`` for a session whose user has no
     program row yet (we create a brand-new throwaway user/session for
     this leg so we don't poison the demo personas).

Prereqs:
  * API running on http://localhost:8000.
  * ``python -m scripts.seed_demo_history`` has been run at least once
    (so demo-user-1 has a program row).
  * BACKBOARD_API_KEY set (the route still calls the LLM for the banner;
    we ignore that text and only assert on `target`).

Usage::

    cd apps/api && source .venv/bin/activate
    python -m scripts.smoke_pre_session_target
"""
from __future__ import annotations

import asyncio
import uuid

import httpx

from db.session import SessionLocal
from store import create_session, upsert_program

API = "http://localhost:8000"
DEMO_SESSION = "demo-session-1"
DEMO_USER = "demo-user-1"
LIFT = "squat"


async def _get_pre(client: httpx.AsyncClient, session_id: str) -> dict:
    res = await client.get(
        f"{API}/api/sessions/{session_id}/pre", timeout=60.0
    )
    res.raise_for_status()
    return res.json()


async def main() -> None:
    async with httpx.AsyncClient() as http:
        # --- Leg 1: existing persona has a target ----------------------
        print(f"[1/3] GET /pre for {DEMO_SESSION} (expect populated target)")
        body = await _get_pre(http, DEMO_SESSION)
        target = body.get("target")
        assert target is not None, f"expected target on demo persona, got: {body}"
        print(
            f"  target: {target['weight_lb']} lb x {target['reps']} reps "
            f"x {target['sets']} sets (source={target.get('source_session_id')})"
        )

        # --- Leg 2: upsert a new prescription, /pre reflects it --------
        print(f"\n[2/3] upsert program -> 165x5x3, then re-GET /pre")
        with SessionLocal() as db:
            upsert_program(
                db,
                user_id=DEMO_USER,
                lift=LIFT,
                weight_lb=165.0,
                reps=5,
                sets=3,
                source_session_id=DEMO_SESSION,
            )

        body = await _get_pre(http, DEMO_SESSION)
        target = body.get("target") or {}
        assert target.get("weight_lb") == 165.0, f"expected 165, got {target}"
        assert target.get("reps") == 5, f"expected 5 reps, got {target}"
        assert target.get("sets") == 3, f"expected 3 sets, got {target}"
        assert target.get("source_session_id") == DEMO_SESSION, (
            f"expected source={DEMO_SESSION}, got {target}"
        )
        print(
            f"  target now: {target['weight_lb']} lb x {target['reps']} reps "
            f"x {target['sets']} sets (source={target['source_session_id']})"
        )

        # Restore the original 135x5x3 so other smoke runs see clean state.
        with SessionLocal() as db:
            upsert_program(
                db,
                user_id=DEMO_USER,
                lift=LIFT,
                weight_lb=135.0,
                reps=5,
                sets=3,
                source_session_id=None,
            )
        print("  restored persona's program to 135x5x3")

        # --- Leg 3: brand-new user -> null target ----------------------
        # We mint a throwaway user_id+session_id so we don't pollute the
        # demo accounts with an empty program row. Skip user creation
        # entirely — create_session will _ensure_user for us.
        new_user = f"smoke-pre-target-{uuid.uuid4().hex[:8]}"
        with SessionLocal() as db:
            new_session = create_session(db, user_id=new_user, lift=LIFT)
        new_session_id = new_session["session_id"]
        print(
            f"\n[3/3] GET /pre for fresh user (expect target=null)\n"
            f"  user={new_user} session={new_session_id}"
        )
        body = await _get_pre(http, new_session_id)
        assert body.get("target") is None, (
            f"expected null target for fresh user, got: {body.get('target')}"
        )
        print("  target=null as expected")

        print("\n[done] pre-session target smoke passed.")


if __name__ == "__main__":
    asyncio.run(main())
