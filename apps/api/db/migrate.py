"""Run Alembic migrations programmatically (used by the FastAPI lifespan hook).

We replaced ``Base.metadata.create_all`` with real migrations so that schema
changes (new columns, new tables, dropped columns, etc.) apply cleanly on top
of existing dev/prod databases instead of requiring a volume wipe.
"""
from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from .session import engine

_API_DIR = Path(__file__).resolve().parent.parent
_ALEMBIC_INI = _API_DIR / "alembic.ini"

# One app table that always exists. If this table is present but there's no
# ``alembic_version`` row yet, the DB was created by the pre-Alembic
# ``Base.metadata.create_all`` path and we need to stamp it at head instead
# of trying to re-create tables.
_SENTINEL_TABLE = "users"


def run_migrations() -> None:
    """Upgrade the database to the latest Alembic revision.

    - Fresh DB (no tables): apply every migration in order.
    - Already-migrated DB: apply only the new ones.
    - Pre-Alembic DB (tables exist but no ``alembic_version``): stamp at head
      once so subsequent migrations apply on top. This is a one-time
      transition path for anyone upgrading from the old ``create_all`` world.
    """
    cfg = Config(str(_ALEMBIC_INI))

    inspector = inspect(engine)
    existing = set(inspector.get_table_names())

    if _SENTINEL_TABLE in existing and "alembic_version" not in existing:
        command.stamp(cfg, "head")
        return

    command.upgrade(cfg, "head")
