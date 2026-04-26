# Vela — local setup for teammates

This is the "I just want to use the app" guide. If you're contributing
backend code, the deeper reference is in
[`apps/api/README.md`](apps/api/README.md).

You'll run the whole stack on your own machine. Nothing is deployed
yet — sessions you record live in your local SQLite file, not in a
shared cloud DB. That's fine for kicking the tires; the real cloud
deploy comes later.

> Tested on macOS. Linux works the same. Windows users can adapt the
> shell commands or use WSL2.

---

## TL;DR (the 6 commands)

```bash
git clone https://github.com/nakim12/vela.git && cd vela

# 1. drop the two env files Nathan sent you into the repo:
#    apps/api/.env          (Backboard + Clerk + corpus id)
#    apps/web/.env.local    (Clerk publishable key + API URL)

# 2. one-time install
npm install
cd apps/api && python -m venv .venv && source .venv/bin/activate \
  && pip install -r requirements.txt && cd ../..

# 3. run the API (terminal 1, from apps/api/)
cd apps/api && source .venv/bin/activate \
  && python -m uvicorn main:app --reload --app-dir "$PWD" --port 8000

# 4. run the web app (terminal 2, from repo root)
npm run dev
```

Then open <http://localhost:3000>, sign up, and start using it.

---

## Prerequisites

You need **two things** installed before you start:

| Tool | Version | Check with | Where to get it |
|---|---|---|---|
| Node.js | 20 or newer | `node --version` | <https://nodejs.org> (LTS), or `brew install node` |
| Python | 3.11 or newer | `python3 --version` | <https://python.org>, or `brew install python@3.13` |

That's it. **You don't need Docker** — the app falls back to a local
SQLite file when there's no Postgres, which is perfect for testing.

---

## Step 1 — Clone the repo

```bash
git clone https://github.com/nakim12/vela.git
cd vela
```

## Step 2 — Get the env files from Nathan

The app needs two environment files that aren't in the repo (they have
secrets). Nathan will send you both — drop them in place exactly as
named:

```
vela/
├── apps/
│   ├── api/.env           ← from Nathan
│   └── web/.env.local     ← from Nathan
```

Don't commit either of these. They're already gitignored.

> If Nathan sent you the env contents as text instead of files, copy
> the text into new files at those exact paths.

## Step 3 — Install dependencies

From the repo root:

```bash
# Frontend deps (pulls in shared-types automatically via workspaces).
npm install

# Backend deps. Python uses a per-project virtualenv.
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..
```

`npm install` takes a minute. `pip install -r requirements.txt`
takes 1–2 minutes the first time.

## Step 4 — Run the API (terminal 1)

```bash
cd apps/api
source .venv/bin/activate
python -m uvicorn main:app --reload --app-dir "$PWD" --port 8000
```

You should see something like:

```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

The first run will create a `vela.db` SQLite file alongside the API
code. That's where your sessions will live. Leave this terminal open.

> If you see `Address already in use`, something else is on port
> 8000. Kill it: `lsof -nP -iTCP:8000 -sTCP:LISTEN -t | xargs kill -9`

## Step 5 — Run the web app (terminal 2)

In a **new** terminal, from the repo root:

```bash
npm run dev
```

Wait for `Ready in <some ms>`, then open <http://localhost:3000>.

## Step 6 — Sign up and use it

1. Click **Sign up** in the top right.
2. Use your real email — it goes through Clerk (the auth service);
   you'll get a verification email.
3. After signup you'll land on the onboarding page. Fill it out — the
   agent uses these answers to personalize your reports.
4. Once you're in, try:
   - **Live capture** (`/lift/squat`): allow camera, click Start Set,
     do a few reps, click End Set. You'll get a coach's report.
   - **Upload** (`/upload`): pick a video file, click Analyze, get the
     same report on the recorded clip.
   - **Sessions** (`/sessions`): list of every set you've recorded.
   - **Coach** (`/coach`): chat with the agent about your training.

---

## Notes you should know

### Your data is local

Each teammate has their own `apps/api/vela.db`. You won't see Nathan's
sessions and he won't see yours. That's fine for testing the product —
just don't expect a shared "team feed" of lifts.

### The Backboard API key is shared

You're using the team's shared Backboard tenant. Your assistant /
threads / memories all live there. Don't paste the key anywhere
public.

### Clerk users are shared

Your sign-up creates a real Clerk user in the team's dev project.
Nathan can see your email in the Clerk dashboard if it matters.

### Mute the voice cues if they get annoying

The little speaker icon in the live capture / upload header toggles
voice cues. Setting persists per browser.

---

## Troubleshooting

**`command not found: python3`** — install Python 3.11+ from
<https://python.org> or `brew install python@3.13`.

**`Could not import module "main"` when uvicorn starts** — your repo
path probably has spaces. The `--app-dir "$PWD"` in the command above
fixes this; make sure you didn't drop it.

**`pip install` fails on `psycopg`** — psycopg compiles native code.
On macOS run `xcode-select --install` first; on Linux make sure
`libpq-dev` is installed (`sudo apt install libpq-dev`).

**Camera says "model: Unknown error" in live capture** — this is a
MediaPipe quirk; refresh the page, click Start Set again, and it
usually clears. The model downloads from a CDN on first use; an
ad blocker that aggressively blocks third-party requests can break
this.

**"Unable to fetch" anywhere in the UI** — your API isn't running or
isn't reachable. Confirm terminal 1 still shows the uvicorn process,
and that <http://localhost:8000/api/health> returns `{"status":"ok"}`
in your browser.

**Sign-up email never arrives** — check spam. If it really doesn't
show up, the Clerk dev project might be rate-limited; ping Nathan.

**Anything else** — Slack Nathan a screenshot of the error and the
terminal output from both terminals.
