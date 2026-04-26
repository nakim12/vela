"""Backfill 4 prior workout sessions per demo persona.

Why this exists
---------------
The §13 demo step 4 says: "Show the trend chart from 4 prior seeded sessions."
Without this script the trends endpoint returns one row (today's demo run) and
the chart is empty, which kills the "long-term tracking" beat.

Each persona gets a believable narrative — not random noise — so screenshots of
the chart tell a story:

  Persona A — Alex (long femurs, low-back history)
    * Squat trended up 135 -> 150lb over 4 weeks.
    * KNEE_CAVE counts decreased (3 -> 2 -> 1 -> 1) as cues took hold.
    * FORWARD_DUMP stays present (long femurs, expected) but trends down too.
    * BUTT_WINK occasionally flagged (depth tolerance is real).

  Persona B — Sam (short femurs, BUTT_WINK cleared by PT)
    * Squat trended up 165 -> 185lb over 4 weeks (faster progress).
    * KNEE_CAVE absent — cues + anatomy line up.
    * FORWARD_DUMP rarely flagged (short femurs).
    * BUTT_WINK never flagged in counts because the threshold override in
      seed_demo_personas.py raises it past these readings.

Idempotency
-----------
We deterministically derive session ids (``demo-history-<user>-<n>``) and skip
any that already exist. Re-running this is safe — it tops up missing rows
without duplicating existing ones. ``recommend_load`` rows for today's
"current target" are NOT touched here; this script only writes the trail of
historical sessions + their summaries + their risk events.

Usage::

    cd apps/api && source .venv/bin/activate
    python -m scripts.seed_demo_history
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from db.session import SessionLocal
from db.models import RiskEventRow, User, WorkoutSession
from db import stubs as db_stubs


USER_1 = db_stubs.DEMO_USER_ID
USER_2 = db_stubs.DEMO_USER_ID_2

# Days_ago, weight_lb, summary_md, [(rule_id, count, severity, measured, threshold, side?), ...]
# The rules-engine fields (measured/threshold) are realistic ranges so the
# trends chart shows meaningful magnitude variation, not flatlines.
HISTORY: dict[str, list[dict]] = {
    USER_1: [
        {
            "days_ago": 28,
            "lift": "squat",
            "weight_lb": 135.0,
            "summary": (
                "### Session 1 of 4 (4 weeks ago)\n\n"
                "First recorded session. Knee cave flagged 3x on the right "
                "side, forward dump 2x late in the set. Cued 'spread the floor' "
                "moving forward.\n\n"
                "**Sources**: knee-cave-during-squat.md, forward-lean-and-femur-length.md"
            ),
            "events": [
                ("KNEE_CAVE", 3, "warn", 8.5, 6.0, "right"),
                ("FORWARD_DUMP", 2, "info", 8.4, 8.0, None),
                ("BUTT_WINK", 1, "info", 10.5, 10.0, None),
            ],
        },
        {
            "days_ago": 21,
            "lift": "squat",
            "weight_lb": 140.0,
            "summary": (
                "### Session 2 of 4 (3 weeks ago)\n\n"
                "Knee cave down to 2 occurrences — 'spread the floor' cue is "
                "landing. Forward dump unchanged; expected given long femurs.\n\n"
                "**Sources**: cue-selection-internal-vs-external.md"
            ),
            "events": [
                ("KNEE_CAVE", 2, "warn", 7.6, 6.0, "right"),
                ("FORWARD_DUMP", 2, "info", 8.6, 8.0, None),
            ],
        },
        {
            "days_ago": 14,
            "lift": "squat",
            "weight_lb": 145.0,
            "summary": (
                "### Session 3 of 4 (2 weeks ago)\n\n"
                "Knee cave down to 1 occurrence. Forward dump down to 1 too. "
                "Holding cues 'spread the floor' + 'brace ribs down'.\n\n"
                "**Sources**: knee-cave-during-squat.md"
            ),
            "events": [
                ("KNEE_CAVE", 1, "warn", 6.8, 6.0, "right"),
                ("FORWARD_DUMP", 1, "info", 8.2, 8.0, None),
            ],
        },
        {
            "days_ago": 7,
            "lift": "squat",
            "weight_lb": 150.0,
            "summary": (
                "### Session 4 of 4 (last week)\n\n"
                "Single knee-cave flag late in the set; otherwise clean. "
                "Long-femur forward lean within tolerance for the load.\n\n"
                "**Sources**: forward-lean-and-femur-length.md"
            ),
            "events": [
                ("KNEE_CAVE", 1, "info", 6.4, 6.0, "right"),
            ],
        },
    ],
    USER_2: [
        {
            "days_ago": 28,
            "lift": "squat",
            "weight_lb": 165.0,
            "summary": (
                "### Session 1 of 4 (4 weeks ago)\n\n"
                "Clean session. BUTT_WINK reading present but within the "
                "PT-cleared override. Cued 'push the floor away'.\n\n"
                "**Sources**: cue-selection-internal-vs-external.md"
            ),
            "events": [
                ("FORWARD_DUMP", 1, "info", 8.1, 8.0, None),
            ],
        },
        {
            "days_ago": 21,
            "lift": "squat",
            "weight_lb": 175.0,
            "summary": (
                "### Session 2 of 4 (3 weeks ago)\n\n"
                "No flags. Short-femur upright squat is staying consistent "
                "as load goes up.\n\n"
                "**Sources**: forward-lean-and-femur-length.md"
            ),
            "events": [],
        },
        {
            "days_ago": 14,
            "lift": "squat",
            "weight_lb": 180.0,
            "summary": (
                "### Session 3 of 4 (2 weeks ago)\n\n"
                "First sign of fatigue — one forward dump at the top set. "
                "Otherwise clean.\n\n"
                "**Sources**: forward-lean-and-femur-length.md"
            ),
            "events": [
                ("FORWARD_DUMP", 1, "info", 8.3, 8.0, None),
            ],
        },
        {
            "days_ago": 7,
            "lift": "squat",
            "weight_lb": 185.0,
            "summary": (
                "### Session 4 of 4 (last week)\n\n"
                "Clean again at +5lb. Cleared for another small bump next "
                "week if RPE stays under 8.\n\n"
                "**Sources**: rpe-and-load-progression.md"
            ),
            "events": [],
        },
    ],
}


def _seed_for(user_id: str) -> tuple[int, int]:
    """Idempotently insert this user's history rows. Returns (created, skipped)."""
    created = 0
    skipped = 0

    with SessionLocal() as db:
        # Belt and suspenders: ensure user row exists. seed_demo_fixtures
        # already creates these, but if someone runs this against a fresh
        # database we don't want a foreign-key explosion.
        if db.get(User, user_id) is None:
            db.add(User(id=user_id, email=f"{user_id}@romus.local"))
            db.flush()

        for idx, entry in enumerate(HISTORY[user_id], start=1):
            session_id = f"demo-history-{user_id}-{idx}"
            if db.get(WorkoutSession, session_id) is not None:
                skipped += 1
                continue

            started_at = datetime.now(timezone.utc) - timedelta(days=entry["days_ago"])
            ended_at = started_at + timedelta(minutes=45)

            db.add(
                WorkoutSession(
                    id=session_id,
                    user_id=user_id,
                    lift=entry["lift"],
                    started_at=started_at,
                    ended_at=ended_at,
                    bb_thread_id="",  # historical sessions don't replay tools
                    summary_md=(
                        f"# {entry['lift'].title()} session — "
                        f"{entry['weight_lb']:.0f}lb\n\n{entry['summary']}"
                    ),
                )
            )

            # Synthesize the event list. Each (rule, count) tuple expands into
            # `count` rows so the trends endpoint's per-rule counts are real.
            for rule_id, count, severity, measured, threshold, side in entry["events"]:
                for rep_offset in range(count):
                    db.add(
                        RiskEventRow(
                            session_id=session_id,
                            rule_id=rule_id,
                            lift=entry["lift"],
                            rep_index=2 + rep_offset,
                            severity=severity,
                            measured=measured,
                            threshold=threshold,
                            frame_start=120 + rep_offset * 80,
                            frame_end=160 + rep_offset * 80,
                            confidence=0.9,
                            side=side,
                            created_at=started_at + timedelta(minutes=10 + rep_offset),
                        )
                    )

            created += 1

        db.commit()

    return created, skipped


def main() -> None:
    for user_id in (USER_1, USER_2):
        created, skipped = _seed_for(user_id)
        print(
            f"[{user_id}] created={created} skipped={skipped} "
            f"(total historical sessions on disk={created + skipped})"
        )


if __name__ == "__main__":
    main()
