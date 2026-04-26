"""Seed a fake squat session under whichever Clerk user owns the JWT you pass.

Why this exists:
    Once Clerk auth is on (CLERK_JWT_ISSUER set), the only way to create a
    session for a real Clerk user is to call POST /api/sessions with a valid
    Bearer token. The browser does that automatically — but the FE doesn't
    have a "Start session" button wired yet (Francis's lane), so there's no
    way to populate /sessions or /sessions/[id] for your Clerk identity from
    the UI.

    This script gives you a one-shot way to do it manually so you can demo
    the full post-set report flow tonight: timeline, agent-generated
    markdown summary, recommend_load target, "what I learned about you"
    memory panel with delete UX.

How to get your JWT:
    1. Open http://localhost:3000 in the browser you're signed into.
    2. Open DevTools console (Cmd+Opt+J on Mac).
    3. Paste:    await window.Clerk.session.getToken()
    4. Copy the long string between the quotes (eyJ…).

How to run:
    cd apps/api && source .venv/bin/activate

    # paste mode
    python -m scripts.seed_my_session

    # one-liner
    python -m scripts.seed_my_session --jwt "eyJ..."

    # different lift
    python -m scripts.seed_my_session --lift bench

What it does:
    1. POST /api/sessions {lift} -> session_id (under your Clerk user)
    2. POST /api/sessions/{id}/events {events: [...]} -> populates the
       timeline with a realistic squat fault distribution.
    3. POST /api/sessions/{id}/end -> marks ended_at.
    4. Prints the URL to visit in your browser.

After it finishes, visit:
    http://localhost:3000/sessions          -> chart + list now have data
    http://localhost:3000/sessions/<id>     -> click "Generate Summary" to
                                               watch the post_set_loop fire,
                                               see the markdown render, and
                                               the agent-logged memories
                                               appear in the right panel.
"""
from __future__ import annotations

import argparse
import asyncio
import getpass
import sys

import httpx

BASE = "http://localhost:8000/api"
WEB_BASE = "http://localhost:3000"


def _events_for(lift: str) -> list[dict]:
    """A small but interesting set of fake events per lift.

    Mix of severities and rule_ids so the post_set_loop has substance to
    summarize and the trend chart shows multiple lines.
    """
    if lift == "squat":
        return [
            {
                "rule_id": "KNEE_CAVE",
                "lift": lift,
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
                "lift": lift,
                "rep_index": 3,
                "severity": "warn",
                "measured": 12.1,
                "threshold": 8.0,
                "frame_range": [220, 265],
                "confidence": 0.87,
            },
            {
                "rule_id": "BUTT_WINK",
                "lift": lift,
                "rep_index": 4,
                "severity": "info",
                "measured": 4.0,
                "threshold": 3.0,
                "frame_range": [340, 380],
                "confidence": 0.78,
            },
            {
                "rule_id": "KNEE_CAVE",
                "lift": lift,
                "rep_index": 5,
                "severity": "high",
                "measured": 11.2,
                "threshold": 6.0,
                "frame_range": [445, 480],
                "confidence": 0.94,
                "side": "right",
            },
        ]
    if lift == "bench":
        return [
            {
                "rule_id": "BAR_DRIFT",
                "lift": lift,
                "rep_index": 2,
                "severity": "warn",
                "measured": 6.5,
                "threshold": 4.0,
                "frame_range": [120, 160],
                "confidence": 0.88,
            },
            {
                "rule_id": "UNEVEN_PRESS",
                "lift": lift,
                "rep_index": 3,
                "severity": "info",
                "measured": 0.18,
                "threshold": 0.10,
                "frame_range": [200, 240],
                "confidence": 0.81,
            },
        ]
    return [
        {
            "rule_id": "ROUND_BACK",
            "lift": lift,
            "rep_index": 1,
            "severity": "high",
            "measured": 28.0,
            "threshold": 15.0,
            "frame_range": [40, 80],
            "confidence": 0.93,
        },
        {
            "rule_id": "HIPS_RISE_FIRST",
            "lift": lift,
            "rep_index": 2,
            "severity": "warn",
            "measured": 0.22,
            "threshold": 0.12,
            "frame_range": [180, 220],
            "confidence": 0.85,
        },
    ]


def _read_jwt(cli_jwt: str | None) -> str:
    if cli_jwt:
        return cli_jwt.strip()
    if not sys.stdin.isatty():
        # piped input
        return sys.stdin.read().strip()
    print(
        "Paste your Clerk JWT (from devtools `await window.Clerk.session.getToken()`).\n"
        "Input is hidden:",
        file=sys.stderr,
    )
    token = getpass.getpass("JWT: ")
    return token.strip()


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--jwt",
        help="Clerk session token. Omit to be prompted (input is hidden).",
    )
    parser.add_argument(
        "--lift",
        choices=("squat", "bench", "deadlift"),
        default="squat",
        help="Which lift to seed. Defaults to squat.",
    )
    args = parser.parse_args()

    token = _read_jwt(args.jwt)
    if not token or not token.startswith("eyJ"):
        print(
            "JWT looks wrong — Clerk tokens start with 'eyJ'. Got:\n  "
            + (token[:40] + "…" if token else "<empty>"),
            file=sys.stderr,
        )
        return 2

    headers = {"Authorization": f"Bearer {token}"}
    events = _events_for(args.lift)

    async with httpx.AsyncClient(base_url=BASE, headers=headers, timeout=20) as c:
        # 1. create
        r = await c.post("/sessions", json={"lift": args.lift})
        if r.status_code == 401:
            print(
                "401 from POST /sessions — your JWT is expired or invalid.\n"
                "Grab a fresh one from the browser console and re-run.",
                file=sys.stderr,
            )
            return 3
        r.raise_for_status()
        session = r.json()
        session_id = session["session_id"]
        user_id = session["user_id"]
        print(f"created session {session_id} (user={user_id}, lift={args.lift})")

        # 2. events
        r = await c.post(
            f"/sessions/{session_id}/events", json={"events": events}
        )
        r.raise_for_status()
        accepted = r.json()
        print(
            f"posted {accepted['accepted']} events "
            f"(total now {accepted['total_for_session']})"
        )

        # 3. end
        r = await c.post(f"/sessions/{session_id}/end")
        r.raise_for_status()
        ended = r.json()
        print(f"ended session at {ended['ended_at']}")

    print()
    print("now visit:")
    print(f"  {WEB_BASE}/sessions")
    print(f"  {WEB_BASE}/sessions/{session_id}")
    print()
    print(
        "on /sessions/<id>, click 'Generate Summary' to watch the post_set "
        "agent loop fire end-to-end."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
