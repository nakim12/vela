"""Manual smoke test for POST /api/sessions/{session_id}/post_set_summary.

Two terminals required:

  Terminal 1 (run the API):
      cd apps/api && source .venv/bin/activate
      uvicorn main:app --reload --port 8000

  Terminal 2 (run this script):
      cd apps/api && source .venv/bin/activate
      python -m scripts.smoke_post_set_summary

What this script verifies:
  1. Create a brand-new session via POST /api/sessions.
  2. Post a handful of risk events to it via POST /api/sessions/{id}/events.
  3. Call POST /api/sessions/{id}/post_set_summary -> agent runs, returns
     ``generated=True`` and a non-empty markdown body.
  4. Call it again with no flags -> ``generated=False``, same summary
     (idempotency check, no LLM credits burned on the re-call).
  5. Call it once more with ``?force=true`` -> ``generated=True`` again
     (re-roll path used in demos).

This is the end-to-end version of the post-set flow that mirrors what FE
will do after a video upload completes:
    POST /api/sessions
    POST /api/sessions/{id}/events  (multiple)
    POST /api/sessions/{id}/end           (Matthew's, sets ended_at)
    POST /api/sessions/{id}/post_set_summary   (this endpoint)
"""
from __future__ import annotations

import asyncio

import httpx

from db import stubs as db_stubs

USER_ID = db_stubs.DEMO_USER_ID
BASE = "http://localhost:8000/api"

EVENTS = [
    {
        "rule_id": "KNEE_CAVE",
        "lift": "squat",
        "rep_index": 2,
        "severity": "warn",
        "measured": 8.4,
        "threshold": 6.0,
        "frame_range": [140, 175],
        "confidence": 0.91,
        "side": "right",
    },
    {
        "rule_id": "FORWARD_DUMP",
        "lift": "squat",
        "rep_index": 4,
        "severity": "info",
        "measured": 9.2,
        "threshold": 8.0,
        "frame_range": [310, 350],
        "confidence": 0.86,
    },
]


async def main() -> None:
    async with httpx.AsyncClient(timeout=120.0) as http:
        print("[1/5] POST /sessions")
        r = await http.post(
            f"{BASE}/sessions",
            json={"lift": "squat"},
        )
        r.raise_for_status()
        session_id = r.json()["session_id"]
        print(f"      session_id={session_id}")

        print(f"[2/5] POST /sessions/{session_id}/events ({len(EVENTS)} events)")
        r = await http.post(
            f"{BASE}/sessions/{session_id}/events",
            params={"user_id": USER_ID},
            json={"events": EVENTS},
        )
        r.raise_for_status()
        print(f"      accepted={r.json()['accepted']} "
              f"total={r.json()['total_for_session']}")

        print(f"[3/5] POST /sessions/{session_id}/post_set_summary "
              "(first call, should generate)")
        r = await http.post(
            f"{BASE}/sessions/{session_id}/post_set_summary",
            params={"user_id": USER_ID},
        )
        r.raise_for_status()
        body1 = r.json()
        print(f"      generated={body1['generated']} "
              f"event_count={body1['event_count']} "
              f"summary_len={len(body1['summary_md'])}")
        assert body1["generated"] is True, "first call should generate"
        assert body1["summary_md"], "first call should return non-empty markdown"
        print("\n--- summary preview (first 600 chars) ---")
        print(body1["summary_md"][:600])
        print("...\n")

        print(f"[4/5] POST /sessions/{session_id}/post_set_summary "
              "(second call, should be cached)")
        r = await http.post(
            f"{BASE}/sessions/{session_id}/post_set_summary",
            params={"user_id": USER_ID},
        )
        r.raise_for_status()
        body2 = r.json()
        print(f"      generated={body2['generated']} "
              f"event_count={body2['event_count']}")
        assert body2["generated"] is False, "second call should be cached"
        assert body2["summary_md"] == body1["summary_md"], (
            "cached summary should match the first one byte-for-byte"
        )
        print("      OK (idempotent, no LLM credits burned)")

        print(f"[5/5] POST /sessions/{session_id}/post_set_summary?force=true "
              "(re-roll path)")
        r = await http.post(
            f"{BASE}/sessions/{session_id}/post_set_summary",
            params={"user_id": USER_ID, "force": "true"},
        )
        r.raise_for_status()
        body3 = r.json()
        print(f"      generated={body3['generated']} "
              f"summary_len={len(body3['summary_md'])}")
        assert body3["generated"] is True, "force=true should re-generate"
        differs = body3["summary_md"] != body1["summary_md"]
        print(
            f"      differs from first run: {differs} "
            f"(non-deterministic LLM, either is fine)"
        )

        print("\n[done] all 5 checks passed")


if __name__ == "__main__":
    asyncio.run(main())
