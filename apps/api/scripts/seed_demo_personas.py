"""Seed Backboard memories + threshold overrides for the two demo personas.

Run once after the API has started (so the users + sessions exist in
Postgres) and you've never seeded these personas before, or any time you
want to top up missing memories::

    cd apps/api && source .venv/bin/activate
    python -m scripts.seed_demo_personas

Backboard memories accumulate (they're not idempotent on content), so
re-running this script multiple times will create duplicate memory rows.
That's harmless for the demo — the agent just sees the same fact a few
times when it queries the KG — but if you want a clean state, delete the
assistant for that user via the Backboard dashboard before re-seeding.

Two personas, by design materially different so the same uploaded squat
video produces visibly different cues:

  demo-user-1 (Alex)
    - Long femurs (femur:torso ~1.05) -> needs forward lean
    - Internal cue preference ("brace ribs down", "spread the floor")
    - Low-back tweak Sept 2024 from a heavy good morning
    - Limited right ankle dorsiflexion
    -> Will flag forward dump aggressively; cues bias toward bracing.

  demo-user-2 (Sam)
    - Short femurs (femur:torso ~0.92) -> can squat upright
    - External cue preference ("push the floor away", "hips back")
    - No injury history; mobility unremarkable
    - BUTT_WINK threshold relaxed (cleared by PT 6 months ago)
    -> Same butt wink that flags on user 1 won't flag on user 2;
       cues sound external, less safety-flavored.

This script is what makes the §13 demo step 3 ("watch the same lifter get
different cues from a fresh-account vs. populated-KG agent") actually work.
"""
from __future__ import annotations

import asyncio

from agents.runtime import ensure_assistant_for_user
from bb import get_client
from db import stubs as db_stubs

USER_1 = db_stubs.DEMO_USER_ID
USER_2 = db_stubs.DEMO_USER_ID_2


PERSONAS: dict[str, list[tuple[str, str]]] = {
    USER_1: [
        (
            "anthropometry",
            "[anthropometry] Long femurs (femur:torso ~1.05). Forward lean "
            "tolerance is high; expect more torso angle than population default.",
        ),
        (
            "cue_preferences",
            "[cue_preferences] Responds well to internal cues "
            "(e.g. 'spread the floor', 'brace ribs down'). External cues "
            "feel vague to this user.",
        ),
        (
            "injuries",
            "[injuries] Low back tweak Sept 2024 from a heavy good morning. "
            "Resolved, but flag any forward dump on squat as elevated risk.",
        ),
        (
            "mobility",
            "[mobility] Limited right ankle dorsiflexion (~20 deg). Tends to "
            "shift weight to the left foot at the bottom of the squat.",
        ),
    ],
    USER_2: [
        (
            "anthropometry",
            "[anthropometry] Short femurs (femur:torso ~0.92). Can squat with "
            "a near-vertical torso; large forward lean is unusual for this "
            "lifter and worth a second look.",
        ),
        (
            "cue_preferences",
            "[cue_preferences] Responds well to external cues "
            "(e.g. 'push the floor away', 'hips back to the wall'). Internal "
            "cues like 'fire your glutes' feel slow and confusing.",
        ),
        (
            "injuries",
            "[injuries] No prior lifting injuries. Cleared for full-range "
            "squat, bench, and deadlift by PT 6 months ago.",
        ),
        (
            "mobility",
            "[mobility] Above-average ankle and hip mobility; deep squat is "
            "comfortable without elevation.",
        ),
        (
            "lift_history",
            "[lift_history] BUTT_WINK was previously flagged by the rules "
            "engine but PT confirmed it's harmless given current load and "
            "depth tolerance. Threshold has been raised — see threshold note.",
        ),
    ],
}


# Threshold overrides per persona. Tuple = (rule_id, value, justification).
# The post-set agent reads these via get_thresholds() and the rules engine
# merges them on top of the population defaults.
THRESHOLDS: dict[str, list[tuple[str, float, str]]] = {
    USER_1: [],
    USER_2: [
        (
            "BUTT_WINK",
            18.0,  # raised from population default ~10 deg
            "Cleared by PT 6 months ago; lifter has the depth tolerance for "
            "this range without spinal flexion under load.",
        ),
    ],
}


async def seed_one(user_id: str) -> None:
    client = get_client()
    assistant_id = await ensure_assistant_for_user(client, user_id)
    print(f"\n[{user_id}] assistant_id={assistant_id}")

    for category, content in PERSONAS[user_id]:
        await client.add_memory(
            assistant_id,
            content=content,
            metadata={"category": category},
        )
        print(f"  memory: {category} -> {content[:72]}...")

    for rule_id, value, justification in THRESHOLDS[user_id]:
        db_stubs.upsert_threshold(
            user_id=user_id,
            rule_id=rule_id,
            value=value,
            justification=justification,
        )
        print(f"  threshold: {rule_id} = {value}  ({justification[:48]}...)")


async def main() -> None:
    for user_id in (USER_1, USER_2):
        await seed_one(user_id)
    print("\n[done] both personas seeded.")
    print(
        "Tip: hit the agent with both user_ids and the same session events "
        "to see the personalization payoff."
    )


if __name__ == "__main__":
    asyncio.run(main())
