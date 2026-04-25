from fastapi import APIRouter

router = APIRouter(prefix="/user", tags=["user"])


@router.get("/thresholds")
def get_thresholds() -> dict:
    """Return per-user rule threshold overrides.

    MVP stub: always empty. The rules engine in the browser merges these with
    population defaults (see §3.4 of the plan).
    """
    return {"thresholds": []}
