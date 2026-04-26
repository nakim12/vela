"""Upload the local coaching corpus to a dedicated Backboard assistant.

Backboard's RAG attaches documents to a specific assistant. We use ONE
shared "corpus assistant" so the corpus is uploaded once (not per-user)
and `search_research` can query it on behalf of any user.

Usage::

    cd apps/api
    source .venv/bin/activate
    python -m scripts.upload_corpus

What this script does:

  1. Look for a "romus-corpus" assistant by id (env var CORPUS_ASSISTANT_ID).
     If not set, create a new corpus assistant and print the id to paste
     into apps/api/.env.
  2. List documents already attached to that assistant.
  3. Walk ``corpus/`` (relative to repo root) and upload any supported
     file that isn't already there (matched by filename).
  4. Print a summary table of what was uploaded / skipped.

Re-runs are safe: existing files are detected by filename and skipped.
Drop new PDFs / .md / .txt files into ``corpus/`` and re-run to add them.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from backboard import BackboardClient

from bb import get_client
from config import get_settings

REPO_ROOT = Path(__file__).resolve().parents[3]
CORPUS_DIR = REPO_ROOT / "corpus"

CORPUS_ASSISTANT_NAME = "romus-corpus"
CORPUS_ASSISTANT_PROMPT = (
    "You are a research lookup assistant for the Romus strength-coaching "
    "app. Your only job is to surface relevant excerpts from the uploaded "
    "documents (NSCA, Starting Strength, Squat University, peer-reviewed "
    "papers) in response to a query. Quote the source. Do not invent "
    "content. If nothing in the corpus is relevant, say so plainly."
)

SUPPORTED_EXTS = {".pdf", ".md", ".markdown", ".txt", ".docx"}


async def _ensure_corpus_assistant(client: BackboardClient) -> str:
    """Return the corpus assistant id, creating one if we don't have it."""
    settings = get_settings()
    if settings.corpus_assistant_id:
        return settings.corpus_assistant_id

    print("[setup] CORPUS_ASSISTANT_ID is unset. Creating a new corpus assistant...")
    assistant = await client.create_assistant(
        name=CORPUS_ASSISTANT_NAME,
        system_prompt=CORPUS_ASSISTANT_PROMPT,
    )
    new_id = str(assistant.assistant_id)
    print(
        "\n>>> ACTION REQUIRED: paste this into apps/api/.env so future runs\n"
        "    (and the search_research tool at runtime) reuse this assistant:\n\n"
        f"    CORPUS_ASSISTANT_ID={new_id}\n"
        "    (uploads will continue in this run regardless)\n"
    )
    return new_id


def _discover_files() -> list[Path]:
    if not CORPUS_DIR.exists():
        return []
    return sorted(
        p
        for p in CORPUS_DIR.rglob("*")
        if p.is_file()
        and not p.name.startswith(".")
        and p.suffix.lower() in SUPPORTED_EXTS
    )


async def main() -> int:
    client = get_client()
    assistant_id = await _ensure_corpus_assistant(client)

    files = _discover_files()
    if not files:
        print(f"[corpus] No supported files found in {CORPUS_DIR}.")
        print(f"[corpus] Drop {sorted(SUPPORTED_EXTS)} files in there and re-run.")
        return 0

    existing = await client.list_assistant_documents(assistant_id)
    existing_names = {d.filename for d in existing if getattr(d, "filename", None)}

    print(f"[corpus] assistant_id   : {assistant_id}")
    print(f"[corpus] local files    : {len(files)}")
    print(f"[corpus] already uploaded: {len(existing_names)}")
    print()

    uploaded: list[str] = []
    skipped: list[str] = []
    failed: list[tuple[str, str]] = []

    for path in files:
        if path.name in existing_names:
            skipped.append(path.name)
            print(f"  [skip]   {path.name}")
            continue
        try:
            doc = await client.upload_document_to_assistant(assistant_id, path)
            uploaded.append(path.name)
            print(f"  [upload] {path.name} -> id={doc.document_id}")
        except Exception as e:
            failed.append((path.name, str(e)))
            print(f"  [FAIL]   {path.name}: {e}")

    print()
    print(f"[done] uploaded={len(uploaded)} skipped={len(skipped)} failed={len(failed)}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
