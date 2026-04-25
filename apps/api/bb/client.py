"""Backboard SDK client singleton.

Wraps `BackboardClient` from `backboard-sdk` so the rest of the app imports
from one place. The SDK is async-only.
"""
from __future__ import annotations

from functools import lru_cache

from backboard import BackboardClient

from config import get_settings


@lru_cache
def get_client() -> BackboardClient:
    settings = get_settings()
    if not settings.backboard_api_key:
        raise RuntimeError(
            "BACKBOARD_API_KEY is not set. "
            "Copy apps/api/.env.example to apps/api/.env and fill it in."
        )
    return BackboardClient(api_key=settings.backboard_api_key)
