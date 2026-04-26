"""Clerk-backed auth dependency for FastAPI.

Every protected route depends on :func:`get_current_user_id`. The dep:

1. Looks for ``Authorization: Bearer <clerk JWT>``.
2. If Clerk is configured (``CLERK_JWT_ISSUER`` set), verifies the JWT
   signature against Clerk's JWKS, checks the issuer, and returns the
   Clerk user id from the ``sub`` claim.
3. Auto-provisions the matching row in the ``users`` table so downstream
   store helpers can FK to it, and opportunistically records the email
   from the token claims.
4. **Dev bypass**: if ``CLERK_JWT_ISSUER`` is empty, the dep returns
   ``settings.demo_user_id`` instead. This keeps Nathan's smoke scripts,
   ``curl`` against ``/docs``, and local uvicorn-without-sign-in flows
   working. The bypass is logged once at app startup and gated on
   ``app_env != "production"`` to prevent foot-guns in prod.

JWKS is fetched lazily and cached by ``PyJWKClient``'s built-in caching.
We don't need ``clerk-backend-api`` for simple JWT verification; that SDK
is heavier and would add an Anthropic-style SDK churn risk during the
hackathon.
"""
from __future__ import annotations

import logging
import ssl
from typing import Any

import certifi
import jwt
from fastapi import Depends, HTTPException, Query, Request, status
from jwt import PyJWKClient
from sqlalchemy.orm import Session as DBSession

from config import Settings, get_settings
from db.models import User
from db.session import get_db

log = logging.getLogger(__name__)


_BYPASS_WARNED = False


def _jwks_client_for(issuer: str) -> PyJWKClient:
    """Cached PyJWKClient keyed by issuer.

    ``PyJWKClient`` caches signing keys internally, so as long as we reuse
    the same instance per issuer we avoid refetching JWKS on every request.

    We hand the client an explicit SSL context backed by ``certifi`` —
    macOS Python's stock ``urllib`` otherwise fails with
    ``CERTIFICATE_VERIFY_FAILED`` on the first JWKS fetch (it doesn't use
    the system keychain). ``certifi.where()`` is what the rest of the
    Python ecosystem (``requests``, ``httpx``) uses under the hood.
    """
    if not hasattr(_jwks_client_for, "_cache"):
        _jwks_client_for._cache = {}  # type: ignore[attr-defined]
    cache = _jwks_client_for._cache  # type: ignore[attr-defined]
    if issuer not in cache:
        ctx = ssl.create_default_context(cafile=certifi.where())
        cache[issuer] = PyJWKClient(
            f"{issuer.rstrip('/')}/.well-known/jwks.json",
            ssl_context=ctx,
        )
    return cache[issuer]


def _verify_clerk_jwt(token: str, settings: Settings) -> dict[str, Any]:
    """Verify a Clerk-issued JWT and return its claims."""
    jwks = _jwks_client_for(settings.clerk_jwt_issuer)
    try:
        signing_key = jwks.get_signing_key_from_jwt(token)
        # Clerk tokens set ``azp`` (authorized party) rather than ``aud``, so
        # we verify issuer explicitly and skip audience verification — Clerk's
        # session tokens don't carry an ``aud`` by default.
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=settings.clerk_jwt_issuer,
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="session token expired",
        ) from e
    except jwt.PyJWKClientError as e:
        # JWKS endpoint unreachable, TLS failure, empty key set, etc. Not
        # the caller's fault — 503 so browsers retry instead of silently
        # dropping the user back to /sign-in.
        log.exception("JWKS fetch failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"auth provider unreachable: {e}",
        ) from e
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"invalid session token: {e}",
        ) from e
    return claims


def _extract_bearer(request: Request) -> str | None:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth:
        return None
    parts = auth.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def _ensure_user_row(db: DBSession, user_id: str, email: str | None) -> None:
    """Create or update the User row for this Clerk identity.

    Idempotent. Only writes when a row is missing or the email has
    changed; skips the commit otherwise to keep hot-path latency low.
    """
    user = db.get(User, user_id)
    if user is None:
        db.add(User(id=user_id, email=email))
        db.commit()
        return
    if email and user.email != email:
        user.email = email
        db.commit()


def get_current_user_id(
    request: Request,
    db: DBSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> str:
    """FastAPI dep that returns the authenticated user's id.

    Replaces the ``user_id`` query/body params that preceded Clerk auth —
    routes now write ``user_id: str = Depends(get_current_user_id)`` and
    trust that the returned id is real.
    """
    global _BYPASS_WARNED

    if not settings.clerk_jwt_issuer:
        if settings.app_env == "production":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="auth not configured",
            )
        if not _BYPASS_WARNED:
            log.warning(
                "Clerk not configured (CLERK_JWT_ISSUER unset); all requests "
                "will authenticate as demo_user_id=%r. Never deploy with "
                "app_env=production without setting CLERK_JWT_ISSUER.",
                settings.demo_user_id,
            )
            _BYPASS_WARNED = True
        _ensure_user_row(db, settings.demo_user_id, email=None)
        return settings.demo_user_id

    token = _extract_bearer(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    claims = _verify_clerk_jwt(token, settings)
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="token missing sub claim",
        )

    # Clerk's session token shape: email may live under ``email`` or inside
    # a nested ``user`` object depending on the JWT template. Prefer the
    # top-level key and fall back gracefully — we never fail the request
    # just because we couldn't grab an email.
    email = claims.get("email")
    if not email and isinstance(claims.get("user"), dict):
        email = claims["user"].get("email")

    _ensure_user_row(db, user_id, email=email)
    return user_id


def get_effective_user_id(
    request: Request,
    user_id: str | None = Query(
        default=None,
        description=(
            "Local dev only, ignored when CLERK_JWT_ISSUER is set. When "
            "the global bypass is active, select which user id to use "
            "(e.g. ``demo-user-2`` for multi-persona smoke tests) instead of "
            "DEMO_USER_ID. Used by GET /user/trends and POST /onboarding."
        ),
    ),
    db: DBSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> str:
    """Like :func:`get_current_user_id`, but allows a ``user_id`` query
    param when bypassing Clerk so local smoke tests can target persona A
    vs B (or a one-off id) in one process. Production / Clerk mode ignores
    the query and always uses the JWT ``sub``.
    """
    global _BYPASS_WARNED

    if settings.clerk_jwt_issuer:
        if user_id is not None:
            log.debug("ignoring user_id query param (Clerk issuer configured)")
        token = _extract_bearer(request)
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="missing bearer token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        claims = _verify_clerk_jwt(token, settings)
        uid = claims.get("sub")
        if not uid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="token missing sub claim",
            )
        email = claims.get("email")
        if not email and isinstance(claims.get("user"), dict):
            email = claims["user"].get("email")
        _ensure_user_row(db, uid, email=email)
        return uid

    if settings.app_env == "production":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="auth not configured",
        )
    if not _BYPASS_WARNED:
        log.warning(
            "Clerk not configured (CLERK_JWT_ISSUER unset); all requests "
            "will authenticate as demo_user_id=%r. Never deploy with "
            "app_env=production without setting CLERK_JWT_ISSUER.",
            settings.demo_user_id,
        )
        _BYPASS_WARNED = True
    if user_id is not None:
        _ensure_user_row(db, user_id, email=None)
        return user_id
    _ensure_user_row(db, settings.demo_user_id, email=None)
    return settings.demo_user_id


def require_session_owner(
    session_id: str,
    current_user_id: str,
    db: DBSession,
) -> None:
    """404 if the session is missing, 403 if it belongs to another user.

    Called from every session-scoped route after resolving the current
    user. We intentionally return 404 (not 403) on missing sessions so
    attackers can't enumerate valid session ids by watching response
    codes.
    """
    from db.models import WorkoutSession  # local import to avoid cycle

    session = db.get(WorkoutSession, session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="session not found",
        )
    if session.user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="session does not belong to the current user",
        )
