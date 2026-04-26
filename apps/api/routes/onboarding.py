"""User onboarding endpoint.

Creates a brand-new user (or tops up an existing one), spins up their
Backboard assistant, and seeds the knowledge graph with the answers from
the onboarding form (anthropometrics, injuries, mobility flags, cue
preferences). After this fires, the user's first session immediately
benefits from personalization — query_user_kg / pre_session_loop will
find these memories and the agent will reference them in cues.

This is the §10 M4 capstone ("Onboarding form populates initial KG"),
and the HTTP equivalent of what scripts/seed_demo_personas.py does for
the two hard-coded demo users.

Owned by BE-B (Nathan). Lives in its own router so it can grow without
crowding routes/agent.py.
"""
from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from agents.runtime import ensure_assistant_for_user
from auth import get_effective_user_id
from bb import get_client
from db.models import User
from db.session import get_db

log = logging.getLogger(__name__)

router = APIRouter(tags=["onboarding"])


class Anthropometrics(BaseModel):
    """All fields optional. ``femur_torso_ratio`` drives the forward-lean
    expectations the agent is most sensitive to (see corpus
    ``forward-lean-and-femur-length.md``)."""

    height_in: float | None = Field(default=None, ge=36, le=96)
    weight_lb: float | None = Field(default=None, ge=60, le=600)
    femur_torso_ratio: float | None = Field(default=None, ge=0.6, le=1.5)


class OnboardingIn(BaseModel):
    """Body for ``POST /api/onboarding``.

    Mirrors the §5.3 onboarding form: anthropometry + injury list +
    mobility self-report + cue preference. Every list field defaults to
    empty so a user who skips a question still creates a valid profile.
    """

    email: str | None = None
    anthropometrics: Anthropometrics = Field(default_factory=Anthropometrics)
    injuries: list[str] = Field(
        default_factory=list,
        description="Free-text injury / regression notes. One memory per item.",
    )
    mobility_flags: list[str] = Field(
        default_factory=list,
        description="Free-text mobility limitations (e.g. 'limited right "
        "ankle dorsiflexion'). One memory per item.",
    )
    cue_preference: Literal["internal", "external"] | None = Field(
        default=None,
        description="If known, biases the in-set cue style. Coach can override "
        "later via log_observation.",
    )


class OnboardingResponse(BaseModel):
    user_id: str
    assistant_id: str
    memories_written: int = Field(
        description="Total Backboard memories seeded from this onboarding "
        "submission (anthropometry + injuries + mobility + cue_preference)."
    )


def _anthropometrics_summary(a: Anthropometrics) -> str | None:
    """Render an anthropometry blob as a single human-readable memory line.

    Returns None if all fields are blank — we don't pollute the KG with
    empty placeholders.
    """
    parts: list[str] = []
    if a.height_in is not None:
        parts.append(f"height {a.height_in:.0f} in")
    if a.weight_lb is not None:
        parts.append(f"weight {a.weight_lb:.0f} lb")
    if a.femur_torso_ratio is not None:
        # Inline the interpretation so the agent doesn't have to re-derive
        # it on every query.
        flavor = (
            "long femurs (expect more forward lean)"
            if a.femur_torso_ratio >= 1.0
            else "short femurs (can squat upright)"
        )
        parts.append(f"femur:torso ratio {a.femur_torso_ratio:.2f} ({flavor})")
    if not parts:
        return None
    return "; ".join(parts)


@router.post(
    "/onboarding",
    response_model=OnboardingResponse,
    summary="Seed a new user's profile + Backboard knowledge graph",
)
async def onboarding(
    body: OnboardingIn,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_effective_user_id),
) -> OnboardingResponse:
    """Create / refresh a user's profile and seed initial KG memories.

    Idempotency: re-running for the same caller is safe — the user
    row gets its anthropometrics overwritten (latest answers win) and the
    same Backboard assistant is reused via ``ensure_assistant_for_user``.
    Memories, however, are append-only on Backboard's side: re-submitting
    the same injury list will create duplicate memory rows. That's
    acceptable for now (the agent tolerates duplicates), but worth a
    cleanup pass once we have a real signup flow that only fires once.

    The user id is the Clerk session ``sub`` (or ``DEMO_USER_ID`` in local
    dev). Pass ``?user_id=…`` in dev without Clerk to target a smoke-test id.
    """
    user = db.get(User, current_user_id)
    if user is None:
        user = User(
            id=current_user_id,
            email=body.email,
            anthropometrics=body.anthropometrics.model_dump(exclude_none=True) or None,
        )
        db.add(user)
    else:
        if body.email is not None:
            user.email = body.email
        anthro_dict = body.anthropometrics.model_dump(exclude_none=True)
        if anthro_dict:
            user.anthropometrics = anthro_dict
    db.commit()

    client = get_client()
    try:
        assistant_id = await ensure_assistant_for_user(client, current_user_id)
    except Exception as e:
        log.exception("ensure_assistant_for_user failed for %s", current_user_id)
        raise HTTPException(
            status_code=502, detail=f"backboard_failed: {e}"
        ) from e

    memories_written = 0

    anthro_line = _anthropometrics_summary(body.anthropometrics)
    if anthro_line:
        try:
            await client.add_memory(
                assistant_id,
                content=f"[anthropometry] {anthro_line}",
                metadata={"category": "anthropometry"},
            )
            memories_written += 1
        except Exception as e:
            log.exception("add_memory(anthropometry) failed")
            raise HTTPException(
                status_code=502, detail=f"backboard_failed: {e}"
            ) from e

    for injury in body.injuries:
        injury = injury.strip()
        if not injury:
            continue
        try:
            await client.add_memory(
                assistant_id,
                content=f"[injuries] {injury}",
                metadata={"category": "injuries"},
            )
            memories_written += 1
        except Exception as e:
            log.exception("add_memory(injuries) failed")
            raise HTTPException(
                status_code=502, detail=f"backboard_failed: {e}"
            ) from e

    for flag in body.mobility_flags:
        flag = flag.strip()
        if not flag:
            continue
        try:
            await client.add_memory(
                assistant_id,
                content=f"[mobility] {flag}",
                metadata={"category": "mobility"},
            )
            memories_written += 1
        except Exception as e:
            log.exception("add_memory(mobility) failed")
            raise HTTPException(
                status_code=502, detail=f"backboard_failed: {e}"
            ) from e

    if body.cue_preference is not None:
        # Spelled out so the agent picks a matching example cue without
        # needing to map "internal"/"external" semantically every time.
        examples = (
            "e.g. 'spread the floor', 'brace ribs down'"
            if body.cue_preference == "internal"
            else "e.g. 'push the floor away', 'hips back to the wall'"
        )
        try:
            await client.add_memory(
                assistant_id,
                content=(
                    f"[cue_preferences] Responds well to {body.cue_preference} "
                    f"cues ({examples})."
                ),
                metadata={"category": "cue_preferences"},
            )
            memories_written += 1
        except Exception as e:
            log.exception("add_memory(cue_preferences) failed")
            raise HTTPException(
                status_code=502, detail=f"backboard_failed: {e}"
            ) from e

    return OnboardingResponse(
        user_id=current_user_id,
        assistant_id=assistant_id,
        memories_written=memories_written,
    )
