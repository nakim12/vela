# romus

**A real-time, browser-based form coach for weightlifting — pose detection runs in your browser, an agentic Claude coach personalizes the cues, and the next session's prescription writes itself.**

Built by Francis Le, Matthew Tran, Joseph Chong, & Nathan Kim — April 2026 — Sports & Fitness Track

## What is Romus?

Romus is a closed-loop form coach for the squat, bench, and deadlift. Open the app on your laptop, point your camera at the rack, hit Start Set — MediaPipe runs a 33-point pose graph on every video frame in your browser, a deterministic rules engine flags form breakdowns the moment they happen, the skeleton flashes red on the offending joints, and a Claude-powered coach speaks a 3–8 word cue in your ear before your next rep.

When the set ends, the same coach writes a markdown report grounded in your training history (long-term memory), the bundled corpus of strength research (NSCA, Starting Strength, Squat University, peer-reviewed papers), and the telemetry it just saw. It picks your next session's working weight, persists what it learned to your lifter profile, and the loop closes. Every future set inherits the personalization.

The vision side runs entirely in your browser. The agent runs through a Backboard-hosted assistant with persistent per-user memory.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Next.js 15 Frontend (React 19, TypeScript, Tailwind v4)         │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Lift Capture │  │ Lift Upload  │  │ Sessions / Coach Chat  │  │
│  │ camera +     │  │ file +       │  │ markdown reports +     │  │
│  │ MediaPipe +  │  │ MediaPipe +  │  │ persistent agent       │  │
│  │ canvas + TTS │  │ canvas + TTS │  │ conversation           │  │
│  └──────────────┘  └──────────────┘  └────────────────────────┘  │
└──────────────┬─────────────────────────────────────┬─────────────┘
               │ WebSocket (in-set cues)             │ REST
               ▼                                     ▼
┌──────────────────────────────────────────────────────────────────┐
│  FastAPI Backend (Python 3.13)                                   │
│  ┌────────────────────────┐  ┌────────────────────────────────┐  │
│  │ Sessions / Sets /      │  │ Agent loops                    │  │
│  │ Events / Report routes │  │   pre_session  → 2-line banner │  │
│  │ Onboarding / Settings  │  │   in_set_cue   → voice cue     │  │
│  │ Clerk JWT auth         │──│   post_set     → markdown +    │  │
│  │ SQLAlchemy + Alembic   │  │                  next load     │  │
│  │                        │  │   coach_chat   → free-form     │  │
│  └────────────────────────┘  └────────────────────────────────┘  │
│                │                          │                      │
│                ▼                          ▼                      │
│         SQLite / Postgres          Backboard SDK                 │
│         (sessions, events,         (assistant lifecycle,         │
│         programs, thresholds)      threads, memory, RAG)         │
│                                            │                     │
│                                            ▼                     │
│                                    Claude Sonnet                 │
│                                    + coaching corpus             │
└──────────────────────────────────────────────────────────────────┘
```

## The Pipeline (per Set)

1. **Capture** — MediaPipe Pose Landmarker runs in the browser at ~30 fps and emits 33 landmarks per frame. A phase detector segments each rep into top → descent → bottom → ascent.

2. **Analyze** — A deterministic rules engine processes the landmark stream (`KNEE_CAVE`, `HEEL_LIFT`, `DEPTH_ASYMMETRY` for squat; `UNEVEN_PRESS`, `BAR_PATH_DRIFT` for bench). When a rule fires, the affected joints flash red on the canvas, the event ships to the API, and the in-set agent loop is asked for a cue.

3. **Cue** — The in-set loop calls Claude through Backboard, which pulls the lifter's persistent memories and corpus excerpts into the prompt. The agent returns a 3–8 word voice cue spoken via the Web Speech API — or the literal string `STOP` if the rule correlates with a known injury.

4. **Report & Prescribe** — When the set ends, the post-set loop runs to completion: it queries the lifter's KG, searches the corpus for grounding, writes a markdown report, logs new observations, optionally adjusts thresholds, and prescribes the next session's load. The next time you open the app, the dashboard banner already reflects what it learned.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, shadcn/ui, framer-motion, recharts, zustand |
| Pose detection | MediaPipe Tasks Vision (`PoseLandmarker`), runs on GPU via WebAssembly |
| Auth | Clerk (`@clerk/nextjs` on the FE, JWT verification on the API) |
| Real-time | WebSockets — `/ws/sessions/{session_id}` for the in-set cue stream |
| Backend | FastAPI, Pydantic v2, Alembic migrations, SQLAlchemy 2.0 async |
| Database | SQLite locally; Postgres-ready via `DATABASE_URL` |
| Agent runtime | Backboard SDK — assistant lifecycle, threads, memory, RAG |
| LLM | Anthropic Claude Sonnet (via Backboard) |
| Corpus | Bundled markdown corpus (NSCA, Starting Strength, Squat University, peer-reviewed papers) indexed by a separate Backboard assistant |
| Voice | Web Speech API (browser-native TTS), warmed up on first user gesture |
| Deploy | Vercel for the FE; FastAPI runs locally and is exposed via Cloudflare Tunnel for live demos |

## The Agent

A single Backboard assistant per user, invoked from four phase-specific loops, with six tools available throughout. Persistent memory is shared across all four loops — the coach you talk to in `/coach` is the same one that watched your last set.

### Loops

| Loop | When it runs | What it does |
|---|---|---|
| `pre_session_loop` | Set creation | Outputs a 2-line "today's watch list" — relevant injury notes and mobility flags for the planned lift |
| `in_set_cue_loop` | Every N reps or on a high-severity event | Returns a 3–8 word voice cue, or the literal string `STOP` if a high-severity risk correlates with a known injury |
| `post_set_loop` | When a set ends | Queries memory, searches the corpus, writes the markdown report, logs new observations, optionally updates thresholds, and prescribes the next session's load |
| `coach_chat_loop` | `/coach` chat page | Free-form conversation across sessions, with the same memory + research tools |

### Tools

| Tool | Role |
|---|---|
| `query_user_kg` | RAG over the lifter's persistent memories — form history, cue preferences, threshold overrides |
| `log_observation` | Persist a new fact about the lifter, anchored to the originating session |
| `update_threshold` | Override a population-default rule threshold for this lifter, with justification |
| `search_research` | RAG over the shared coaching corpus (NSCA, Starting Strength, Squat U, papers) |
| `write_session_summary` | Persist the markdown post-set report to the user's session log |
| `recommend_load` | Update the lifter's prescribed working weight for their next session of this lift |

## Project Structure

```
romus/
├── apps/
│   ├── web/                          # Next.js 15 app (frontend)
│   │   ├── app/                      # App Router pages
│   │   │   ├── lift/[lift]/          # Live capture entry (squat/bench/deadlift)
│   │   │   ├── upload/               # Video upload analysis flow
│   │   │   ├── sessions/             # Session list + per-session report
│   │   │   ├── coach/                # Persistent coach chat
│   │   │   ├── settings/             # Programs + thresholds
│   │   │   ├── onboarding/           # First-run lifter questionnaire
│   │   │   ├── sign-in/, sign-up/    # Clerk auth
│   │   │   └── page.tsx              # Landing page
│   │   ├── components/
│   │   │   ├── LiftCapture.tsx       # Live camera + canvas overlay + voice cues
│   │   │   ├── LiftUpload.tsx        # Same loop but for an uploaded video
│   │   │   ├── SessionReport.tsx     # Markdown report + telemetry rollup
│   │   │   ├── TodayPlanBanner.tsx   # Pre-session agent banner
│   │   │   └── ui/                   # shadcn-style primitives
│   │   ├── lib/
│   │   │   ├── pose/                 # MediaPipe wrapper, draw, landmark math
│   │   │   ├── rules/                # squat / bench rules + phase engine
│   │   │   ├── realtime/             # cueStream WebSocket client
│   │   │   ├── voice/                # Web Speech API + cue strings
│   │   │   └── api/                  # Typed REST client
│   │   └── middleware.ts             # Clerk auth gate
│   └── api/                          # FastAPI backend
│       ├── main.py                   # FastAPI app, CORS, routers, lifespan
│       ├── routes/
│       │   ├── sessions.py           # Sessions, sets, events, report
│       │   ├── user.py               # Trends, thresholds, programs
│       │   ├── agent.py              # Pre/post-set loops, coach chat
│       │   ├── onboarding.py
│       │   └── health.py
│       ├── agents/
│       │   ├── runtime.py            # Backboard run loop, tool dispatch
│       │   ├── tools.py              # 6 tool defs + dispatcher
│       │   ├── loops.py              # pre/in/post-set + coach chat loops
│       │   └── prompts.py            # System prompts
│       ├── ws/session.py             # /ws/sessions/{id} cue stream
│       ├── db/                       # SQLAlchemy models, migrations, stubs
│       ├── auth.py                   # Clerk JWT verification
│       └── alembic/                  # Schema migrations
├── packages/
│   └── shared-types/                 # Pydantic ↔ TypeScript shared schemas
├── corpus/                           # Markdown coaching corpus
├── infra/
├── DEPLOY.md                         # Vercel deploy guide
├── SETUP.md                          # 5-minute teammate setup
└── vela_project_plan.md              # Product plan, milestones, team split
```

## Setup

### Prerequisites

- Node.js 20+
- Python 3.13+ (3.11+ should also work)
- A Backboard API key (assistants + memory + RAG)
- A Clerk account (auth)
- A webcam (for live capture)

### 1. Clone & install

```bash
git clone https://github.com/nakim12/romus.git
cd romus

# Frontend (npm workspaces — installs the whole monorepo)
npm install

# Backend
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..
```

### 2. Environment variables

`apps/web/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

`apps/api/.env`:

```
BACKBOARD_API_KEY=...
CORPUS_ASSISTANT_ID=          # set after running scripts/upload_corpus.py
CLERK_JWT_ISSUER=https://...
CLERK_JWT_AUDIENCE=...
DATABASE_URL=sqlite:///./romus.db
```

### 3. Database

SQLite is created and migrated automatically on first boot — Alembic runs in the FastAPI lifespan and demo fixtures seed themselves. Postgres is supported by setting `DATABASE_URL` to a `postgresql+psycopg://...` URL.

### 4. Run

```bash
# Terminal 1 — Backend
cd apps/api
.venv/bin/python -m uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
npm run dev -w web
```

Frontend at `http://localhost:3000`, API at `http://localhost:8000`, OpenAPI docs at `http://localhost:8000/docs`.

### 5. (One-time) Upload the coaching corpus

```bash
cd apps/api
.venv/bin/python -m scripts.upload_corpus
# copy the printed assistant_id into CORPUS_ASSISTANT_ID and restart the API
```

## How to Use

1. **Sign up** — Clerk-powered email auth on `/sign-up`.
2. **Onboard** — Answer the lifter questionnaire (training history, injuries, anthropometry, cue preferences) so the agent has context to personalize from session 1.
3. **See today's plan** — The dashboard banner shows the lifts and prescribed loads for the day, sourced from prior `recommend_load` calls.
4. **Live capture** — Click `/lift/squat` (or bench / deadlift). Allow camera access. Step into frame. Click **Start Set**. MediaPipe loads (~3 MB) and the skeleton overlays your video.
5. **Lift** — Bad reps flash red on the affected joints, push entries into the event log, and trigger a 3–8 word voice cue from the in-set agent. The rep counter ticks every successful descent + ascent.
6. **End the set** — Click **End Set**. The post-set agent runs: it queries your memory, searches the corpus, writes the markdown report, persists what it learned, and prescribes your next session's load.
7. **Read the report** — Personalized cues, biomechanics with cited sources, and the agent's "what I learned" panel.
8. **Talk to your coach** — Open `/coach`. Ask things like *"how should I approach my next squat session?"* or *"why did you flag knee cave on rep 4?"*. Same assistant, persistent thread.
9. **Browse history** — `/sessions` is your training log. Each session shows the full report, the events, the next-session prescription, and what the coach learned.

## Documentation

- [`SETUP.md`](SETUP.md) — local setup for teammates testing the app
- [`DEPLOY.md`](DEPLOY.md) — deploying the frontend to Vercel
- [`apps/api/README.md`](apps/api/README.md) — backend reference (FastAPI, Alembic, auth, smoke tests)
- [`vela_project_plan.md`](vela_project_plan.md) — overall product plan, architecture, milestones, team split

## License

MIT
