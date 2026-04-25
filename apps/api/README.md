# Vela API

FastAPI service that powers sessions, risk events, user thresholds, agent
load prescriptions, and the coaching-agent plumbing (WebSockets + Backboard).

This README only covers the backend — for the overall system and team split
see [`/vela_project_plan.md`](../../vela_project_plan.md).

---

## TL;DR

```bash
# one-time
docker compose -f ../../infra/docker-compose.yml up -d postgres
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then paste your real secrets into .env

# every time
source .venv/bin/activate
python -m uvicorn main:app --reload --app-dir "$PWD" --host 127.0.0.1 --port 8000
```

Server at <http://127.0.0.1:8000>. Swagger UI at <http://127.0.0.1:8000/docs>.

---

## Prerequisites

- **Python 3.11+** (tested on 3.13)
- **Docker Desktop** running (for local Postgres; the API will fall back to
  SQLite at `apps/api/vela.db` if no `DATABASE_URL` is set, but you want
  Postgres for realistic testing)
- A Backboard API key if you're running any agent loop (`BACKBOARD_API_KEY`)

---

## Setup

All commands below assume you're in `apps/api/` unless noted.

### 1. Start Postgres

From the repo root:

```bash
docker compose -f infra/docker-compose.yml up -d postgres
```

Connection details (matches `infra/docker-compose.yml`):

| field | value |
| --- | --- |
| host | `localhost` |
| port | `5432` |
| user | `vela` |
| password | `vela` |
| database | `vela` |

### 2. Create the virtualenv and install deps

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

`.venv/` is gitignored.

### 3. Configure environment

```bash
cp .env.example .env
```

Then open `.env` and fill in at least:

```ini
DATABASE_URL=postgresql+psycopg://vela:vela@localhost:5432/vela
BACKBOARD_API_KEY=...   # if you're touching agent/ws code
```

`db/session.py` auto-loads `.env` on import — no shell exports required. If
`DATABASE_URL` is unset, the API falls back to a local SQLite file at
`apps/api/vela.db` so teammates without Docker aren't blocked.

### 4. Run the server

```bash
python -m uvicorn main:app --reload --app-dir "$PWD" --host 127.0.0.1 --port 8000
```

The `--app-dir "$PWD"` is important when your repo path has spaces — the
reload worker loses the CWD otherwise and fails with
`Could not import module "main"`.

The FastAPI lifespan hook runs `alembic upgrade head` on startup, so your
database schema is always in sync with the ORM models when the server is
up. No manual migration step required for normal development.

---

## Schema migrations (Alembic)

Live under `apps/api/alembic/`. `env.py` pulls the DB URL from
`db.session.DATABASE_URL`, so it picks up `apps/api/.env` automatically.

**Normal case (ORM changes):**

```bash
# 1. edit db/models.py
# 2. autogenerate a migration
alembic revision --autogenerate -m "add <what you added>"
# 3. review the generated file under alembic/versions/ — autogenerate is
#    not always perfect (enums, indexes on JSON, etc.)
# 4. restart the server; lifespan will apply the new migration automatically
#    OR run it manually:
alembic upgrade head
```

**First time on this branch with an existing DB:** `db/migrate.py` detects
pre-Alembic databases (tables exist, no `alembic_version` row) and stamps
them at head on first startup. You don't need to nuke your volume.

**If you really want to nuke and start over:**

```bash
docker compose -f ../../infra/docker-compose.yml down -v
docker compose -f ../../infra/docker-compose.yml up -d postgres
```

Other useful commands:

```bash
alembic current             # show which revision the DB is on
alembic history             # list all migrations
alembic downgrade -1        # roll back one migration
```

---

## API surface

Swagger UI at `/docs` is the source of truth. Quick reference:

| method | path | purpose |
| --- | --- | --- |
| GET | `/api/health` | liveness probe |
| POST | `/api/sessions` | start a workout session |
| GET | `/api/sessions?user_id=&lift=&limit=` | list a user's recent sessions |
| POST | `/api/sessions/{id}/events` | batch of `RiskEvent`s from the browser |
| POST | `/api/sessions/{id}/end` | mark session ended, returns event count |
| GET | `/api/sessions/{id}/report` | session + its events for the post-set view |
| GET | `/api/user/thresholds?user_id=` | list per-user rule threshold overrides |
| PUT | `/api/user/thresholds/{rule_id}` | upsert an override (called by the agent) |
| GET | `/api/user/programs?user_id=` | list agent-prescribed next-session targets per lift |
| PUT | `/api/user/programs/{lift}` | upsert next-session target (called by `recommend_load`) |
| WS | `/ws/sessions/{id}` | agent → browser voice cue stream (Nathan) |

The TypeScript mirrors of every request/response shape live in
`packages/shared-types/src/index.ts` — always update that file in the same PR
that changes a pydantic model.

---

## Directory layout

```
apps/api/
├── main.py             # FastAPI app + lifespan (alembic upgrade + seed)
├── config.py           # settings + .env loader helpers
├── store.py            # data-access layer (functions that take a DB session)
├── requirements.txt
├── .env.example        # copy to .env, never commit .env
├── alembic.ini         # alembic CLI config
├── alembic/
│   ├── env.py          # migration env — reuses app's metadata + DATABASE_URL
│   └── versions/       # one file per schema revision
├── db/
│   ├── base.py         # SQLAlchemy declarative Base
│   ├── session.py      # engine + SessionLocal + get_db() FastAPI dep
│   ├── migrate.py      # run_migrations() — called from lifespan
│   ├── models.py       # ORM models (User, WorkoutSession, RiskEventRow,
│   │                   #   UserThreshold)
│   └── stubs.py        # DB-backed shim for agent code (Nathan)
├── models/             # pydantic request/response models
│   ├── risk_event.py
│   ├── session.py
│   └── user.py
├── routes/
│   ├── health.py
│   ├── sessions.py     # POST/GET sessions, events, end, report
│   └── user.py         # GET/PUT user thresholds + programs
├── agents/             # (Nathan) Backboard + Claude orchestration
├── bb/                 # (Nathan) Backboard SDK wrapper
├── ws/
│   └── session.py      # (Nathan) WebSocket route /ws/sessions/{id}
└── scripts/            # standalone smoke scripts (agents team)
```

Ownership: Matthew (BE-A) owns `main.py`, `routes/`, `models/`, `db/`,
`store.py`. Nathan (BE-B) owns `agents/`, `bb/`, `ws/`, `scripts/`. Both touch
`requirements.txt` — serialize PRs and rebase before adding deps.

---

## Quick smoke test

With the server running:

```bash
# 1. create a session
SID=$(curl -fsS -X POST http://127.0.0.1:8000/api/sessions \
  -H 'content-type: application/json' \
  -d '{"user_id":"matt","lift":"squat"}' | python -c "import sys,json; print(json.load(sys.stdin)['session_id'])")
echo "session=$SID"

# 2. post an event
curl -fsS -X POST "http://127.0.0.1:8000/api/sessions/$SID/events" \
  -H 'content-type: application/json' \
  -d '{"events":[{"lift":"squat","rule_id":"KNEE_CAVE","rep_index":1,
       "severity":"warn","measured":0.84,"threshold":0.9,
       "frame_range":[120,168],"confidence":0.92,"side":"left"}]}'

# 3. end + report
curl -fsS -X POST "http://127.0.0.1:8000/api/sessions/$SID/end"
curl -fsS "http://127.0.0.1:8000/api/sessions/$SID/report" | python -m json.tool

# 4. list a user's sessions
curl -fsS "http://127.0.0.1:8000/api/sessions?user_id=matt" | python -m json.tool
```

Inspect Postgres directly:

```bash
docker exec -it infra-postgres-1 psql -U vela -d vela -c "\dt"
docker exec -it infra-postgres-1 psql -U vela -d vela \
  -c "SELECT id, user_id, lift, started_at FROM sessions ORDER BY started_at DESC;"
```

---

## Troubleshooting

**`Address already in use` (port 8000)**
Another uvicorn is still holding the port. Kill it:

```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN -t | xargs kill -9
```

**`Could not import module "main"` on reload**
Your repo path probably has spaces. Always pass `--app-dir "$PWD"` when you
launch uvicorn.

**Tables look wrong after I changed a model**
You probably forgot to generate a migration. From `apps/api/`:

```bash
alembic revision --autogenerate -m "describe what you changed"
# review the generated file, then restart uvicorn (lifespan applies it)
```

If autogenerate misses something (it can't see every subtlety — enums,
partial indexes, JSON column defaults), edit the generated migration by
hand. Restarting uvicorn is enough to apply — no manual `alembic upgrade`.

**SQLite vs Postgres confusion**
If you see a `vela.db` file appear in `apps/api/` unexpectedly, your
`DATABASE_URL` isn't loading. Check `.env` exists and reread the section on
environment.
