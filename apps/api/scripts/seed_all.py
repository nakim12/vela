"""One-shot demo prep — run before the §13 demo.

Wraps the three idempotent seeding scripts in the order they need to fire:

  1. upload_corpus.py            — push the corpus to the shared "vela-corpus"
                                   assistant (skipped per file if already there).
  2. seed_demo_history.py        — backfill 4 prior workout sessions per persona
                                   so the trend chart has real data
                                   (skipped per session if already there).
  3. seed_demo_personas.py       — write each persona's Backboard memories
                                   + threshold overrides. NOT idempotent on
                                   memory content — re-running will create
                                   duplicate memory rows. See that script's
                                   docstring for cleanup guidance.

Why this exists:
  Demo morning is not the time to remember which scripts to run, in what
  order, with what env vars set. ``python -m scripts.seed_all`` is the
  single command. Output is annotated so you can tell at a glance which
  step did real work vs. was a no-op.

Prereqs:
  * The API has been started at least once (so Postgres has the
    user/session rows from ``seed_demo_fixtures``).
  * BACKBOARD_API_KEY is set in apps/api/.env.
  * For step 1 to do anything useful the first time, CORPUS_ASSISTANT_ID
    should EITHER be set in .env OR you're prepared to copy the printed
    id into .env between runs.

Usage::

    cd apps/api && source .venv/bin/activate
    python -m scripts.seed_all
"""
from __future__ import annotations

import asyncio
import sys
import time
from typing import Awaitable, Callable

from scripts import seed_demo_history, seed_demo_personas, upload_corpus


def _banner(idx: int, total: int, title: str) -> None:
    print()
    print("=" * 72)
    print(f"[{idx}/{total}] {title}")
    print("=" * 72)


async def _run_async_step(
    idx: int, total: int, title: str, step: Callable[[], Awaitable[object]]
) -> tuple[bool, float]:
    _banner(idx, total, title)
    started = time.time()
    try:
        await step()
        return True, time.time() - started
    except Exception as e:
        print(f"\n[ERROR] step '{title}' raised: {e}")
        return False, time.time() - started


def _run_sync_step(
    idx: int, total: int, title: str, step: Callable[[], object]
) -> tuple[bool, float]:
    _banner(idx, total, title)
    started = time.time()
    try:
        step()
        return True, time.time() - started
    except Exception as e:
        print(f"\n[ERROR] step '{title}' raised: {e}")
        return False, time.time() - started


async def main() -> int:
    results: list[tuple[str, bool, float]] = []

    ok, dt = await _run_async_step(
        1, 3,
        "upload_corpus — push corpus docs to the shared corpus assistant",
        upload_corpus.main,
    )
    results.append(("upload_corpus", ok, dt))

    ok, dt = _run_sync_step(
        2, 3,
        "seed_demo_history — backfill 4 prior sessions per persona",
        seed_demo_history.main,
    )
    results.append(("seed_demo_history", ok, dt))

    ok, dt = await _run_async_step(
        3, 3,
        "seed_demo_personas — write Backboard memories + threshold overrides",
        seed_demo_personas.main,
    )
    results.append(("seed_demo_personas", ok, dt))

    print()
    print("=" * 72)
    print("Summary")
    print("=" * 72)
    for name, ok, dt in results:
        status = "OK  " if ok else "FAIL"
        print(f"  [{status}] {name}  ({dt:.1f}s)")

    failed = [name for name, ok, _ in results if not ok]
    if failed:
        print(f"\n[done] {len(failed)} step(s) failed: {failed}")
        return 1

    print("\n[done] demo seeding complete. You're ready to pitch.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
