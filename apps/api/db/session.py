"""SQLAlchemy engine + session factory.

Loads `apps/api/.env` on import so `DATABASE_URL` is available without having
to export it in the shell. Defaults to local SQLite if no URL is set, which
keeps teammates unblocked even when they don't have Postgres running.
"""
from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

_API_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_API_DIR / ".env")

_DEFAULT_SQLITE_PATH = _API_DIR / "vela.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_DEFAULT_SQLITE_PATH}")

connect_args = (
    {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)

engine = create_engine(DATABASE_URL, connect_args=connect_args, future=True)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    future=True,
)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
