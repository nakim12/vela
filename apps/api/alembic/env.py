"""Alembic migration environment for the Vela API.

This file is imported by the ``alembic`` CLI *and* by the FastAPI lifespan
hook (which calls ``command.upgrade`` on startup). It reuses the app's own
SQLAlchemy metadata and `DATABASE_URL` resolution so there's exactly one
source of truth for the schema.
"""
from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool

from alembic import context

# Make sure ``apps/api`` is on sys.path so we can import the app's modules
# regardless of where the alembic CLI is invoked from (repo root, apps/api/,
# or inside a running FastAPI process).
_API_DIR = Path(__file__).resolve().parent.parent
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

from db import models  # noqa: F401 — registers ORM classes on Base.metadata
from db.base import Base
from db.session import DATABASE_URL

config = context.config

# Prefer the app's resolved DATABASE_URL (loaded from apps/api/.env by
# db.session) over whatever alembic.ini has. This way teammates don't need
# to keep two copies of the URL in sync.
config.set_main_option("sqlalchemy.url", DATABASE_URL)

if config.config_file_name is not None:
    # ``disable_existing_loggers=False`` is critical: this env.py also runs
    # inside the FastAPI lifespan hook, and the default (True) would wipe
    # uvicorn's loggers and make the server appear to hang silently.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Offline mode: emit SQL to stdout without a live DB connection."""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Online mode: apply migrations against a live DB via the app's engine config."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # Detect column type changes (e.g. String → Text) on autogenerate.
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
