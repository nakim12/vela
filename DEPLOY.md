# Romus — frontend deploy on Vercel

This walks through deploying **only the Next.js frontend** (`apps/web`)
to Vercel. The FastAPI backend stays local on each developer's machine
for now — see [`SETUP.md`](SETUP.md) for the local API setup.

> **Naming note.** The product is being rebranded from "Vela" to
> "Romus". The GitHub repo is still `nakim12/vela` and most of the
> code (page copy, package.json, ClerkProvider theme, etc.) still
> says "Vela" — the FE team owns that rename. For the **Vercel
> deploy specifically**, we name the project `romus` so the public
> URL reflects the new brand from day one. Vercel's project slug is
> independent from the repo name, so this is a no-cost change.

> **Read this first.** A frontend-only deploy works, but every visitor
> still needs the API running on their own machine on
> `http://localhost:8000`. If they don't, every fetch in the app will
> fail. This is fine for demoing on your own laptop and for the design
> team to review UI changes via PR previews — it is **not** a public
> "anyone can sign up" launch. When you're ready for that, the next
> step is deploying the API to Render or Fly; we'll add a separate
> guide for that.

---

## Architecture, deployed

```
┌──────────────────┐        HTTPS         ┌──────────────────────────┐
│ romus.vercel.app │  ──────────────────▶ │ http://localhost:8000   │
│ (Next.js + UI)   │   browser fetch      │ (your laptop's FastAPI) │
└──────────────────┘                      └──────────────────────────┘
        ▲
        │ HTTPS
        │
   visitor's browser
```

Browsers (Chrome, Firefox) treat `localhost` as a secure context and
**will** allow an HTTPS page to fetch from it. Safari is occasionally
finicky here; use Chrome or Firefox during the demo.

---

## One-time setup

You'll do these in order:

1. [Push the deploy branch to GitHub](#1-push-the-deploy-branch-to-github)
2. [Import the project on Vercel](#2-import-the-project-on-vercel)
3. [Configure build settings](#3-configure-build-settings)
4. [Add environment variables](#4-add-environment-variables)
5. [Trigger the first deploy](#5-trigger-the-first-deploy)
6. [Allowlist the Vercel URL in Clerk](#6-allowlist-the-vercel-url-in-clerk)
7. [Smoke test](#7-smoke-test)

The whole thing takes 10–15 minutes.

---

### 1. Push the deploy branch to GitHub

Already done if you're reading this on the deploy PR — Vercel will
import from `main` after the PR merges, or you can give it the deploy
branch directly for a preview.

### 2. Import the project on Vercel

1. Sign in at <https://vercel.com> with the same GitHub account that
   owns `nakim12/vela`.
2. **Add New… → Project**.
3. Find the `vela` repo in the list and click **Import**.
4. If Vercel prompts you to install the Vercel GitHub App, accept it
   and grant access to the `vela` repo.

### 3. Configure build settings

The settings page that appears after Import has two things to get
right: the **Project Name** (which becomes your URL) and the
**Root Directory** (which tells Vercel where the Next.js app lives in
the monorepo).

| Field | Value |
|---|---|
| **Project Name** | `romus` ← **type this** (overrides the default `vela` from the repo name; URL becomes `https://romus.vercel.app`) |
| **Framework Preset** | `Next.js` (auto-detected) |
| **Root Directory** | `apps/web` ← **set this** |
| **Build Command** | leave blank (uses `next build`) |
| **Output Directory** | leave blank (uses `.next`) |
| **Install Command** | leave blank — Vercel detects workspaces and runs `npm install` from the repo root, which correctly resolves the `@vela/shared-types` workspace dep |
| **Node.js version** | 20.x (default) |

> **If `romus` is taken** on Vercel's global namespace, the wizard
> shows a red error under the field. Pick a fallback like
> `romus-app`, `getromus`, or `romus-<your-handle>` — your URL
> becomes `<that>.vercel.app`. You can rename later in
> **Project → Settings → General → Project Name**, but the URL
> changes when you do, so it's cheaper to get it right now.

> **Why Root Directory `apps/web` instead of the repo root?** Vercel
> needs to know which Next.js app to build. With workspaces, it still
> installs from the monorepo root so `@vela/shared-types` resolves —
> but the build itself runs in `apps/web`. The
> `transpilePackages: ["@vela/shared-types"]` line in
> `apps/web/next.config.ts` is what makes that workspace package
> compile cleanly in the production build.

### 4. Add environment variables

Click **Environment Variables** and add each of these. Apply them to
**Production**, **Preview**, and **Development** (the three checkboxes)
unless noted otherwise.

| Name | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Each visitor must run the API locally for fetches to succeed. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_…` from Clerk dashboard | Same key you use locally. |
| `CLERK_SECRET_KEY` | `sk_test_…` from Clerk dashboard | Same key you use locally. **Do not** prefix with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` | Optional — overrides Clerk default. |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` | Optional. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/` | Optional. |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `/onboarding` | Optional. |

You don't need to set `NEXT_PUBLIC_SITE_URL` — `apps/web/app/layout.tsx`
auto-detects the Vercel deployment URL via the `VERCEL_URL` /
`VERCEL_PROJECT_PRODUCTION_URL` env vars Vercel injects for free.

> **Note on Clerk keys.** You can keep using your `pk_test_…` /
> `sk_test_…` (development) Clerk instance for the deployed preview.
> You only need to swap to a `pk_live_…` instance when you're ready
> for real users — that requires a custom domain and DNS setup, which
> is out of scope here.

### 5. Trigger the first deploy

Hit **Deploy**. The build takes ~90 seconds. You're looking for:

```
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Collecting page data
✓ Generating static pages
Route (app)                                  Size  First Load JS
┌ ƒ /                                        ...
…
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

If it fails, jump to [Common build failures](#common-build-failures).

When it goes green, Vercel gives you three URLs that all point at this
deployment:

- `https://romus.vercel.app` — your **production alias**, the one to
  share with the team and judges.
- `https://romus-<scope>.vercel.app` — same target, scoped to your
  Vercel team/account.
- `https://romus-<hash>-<scope>.vercel.app` — immutable per-deploy
  URL. Useful for pinning a specific build for review.

(If you picked a different Project Name in step 3, swap `romus` for
that slug throughout.)

### 6. Allowlist the Vercel URL in Clerk

Clerk rejects sign-in flows from origins it doesn't know about, so:

1. <https://dashboard.clerk.com> → your app (whatever you named the
   Clerk instance — "Vela" or "Romus" depending on when you created
   it; the name is independent of functionality).
2. **Configure → Domains** (or **Paths** in some plan tiers).
3. Click **Add domain** and paste your Vercel URL **without** the
   `https://` prefix, e.g. `romus.vercel.app`.
4. Save.

Repeat for any custom domain you add later.

> If you forget this step, sign-in will load the Clerk widget but show
> a `clerk_origin_invalid` error on submit.

### 7. Smoke test

With the API still running locally on port 8000:

1. Open the Vercel URL in Chrome.
2. Click **Sign up** and create a test account (or sign in to an
   existing one).
3. You should land on `/onboarding` (new account) or `/` (returning).
4. Open DevTools → Network. Confirm requests are going to
   `http://localhost:8000` and returning 200s.
5. Go to `/lift/squat` → "Today's plan" banner should populate.
6. Click **Start set**, do a couple of reps, **End set**. The session
   report page should render.

If any of those fetches show as red in DevTools, your local API is
either down or hitting a CORS wall. See
[Troubleshooting](#troubleshooting).

---

## Ongoing workflow

Once it's wired up:

- **Every push to `main`** → production deploy auto-runs at
  `https://romus.vercel.app`.
- **Every PR opened** → preview deploy at
  `romus-git-<branch>-<scope>.vercel.app`. Designers can review on
  that URL without cloning.
- **Vercel comments on PRs** with the preview URL (configurable in
  project settings).

You don't need to redeploy manually unless you change env vars
(Vercel offers a one-click redeploy from the project's Deployments
tab when you do).

---

## Common build failures

### `Module not found: Can't resolve '@vela/shared-types'`

You set **Root Directory** to `apps/web` but Vercel didn't detect the
workspace. Two fixes:

- Verify the repo root has `"workspaces": ["apps/*", "packages/*"]` in
  `package.json` (it does). If yes, just retry the deploy.
- Or override **Install Command** to `cd ../.. && npm install`. Almost
  never needed.

### `Type error: Cannot find module '@clerk/nextjs'` or other type errors

Production type-check is stricter than dev. Run locally first:

```bash
npm run -w web build
```

Fix any errors, push, retry.

### Build hangs on `Generating static pages`

Usually a Clerk env var is missing — every page in `apps/web/app` runs
through `<ClerkProvider>` at build time. Double-check
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are set for
**all** environments, not just Production.

---

## Troubleshooting (runtime)

### "Failed to fetch" on every request

Your local API isn't running or isn't on port 8000. Start it:

```bash
cd apps/api
source .venv/bin/activate
python -m uvicorn main:app --reload --app-dir "$PWD" --port 8000
```

Then refresh.

### CORS errors in DevTools

The deployed frontend at `https://*.vercel.app` is a different origin
from `http://localhost:8000`. Open `apps/api/main.py` and check the
`CORSMiddleware` config — `allow_origins` currently lists only
`http://localhost:3000`. For the deployed setup you'll need to add
your Vercel URL there:

```python
allow_origins=[
    "http://localhost:3000",
    "https://romus.vercel.app",        # ← your prod alias
],
allow_origin_regex=r"https://romus(-[a-z0-9-]+)?\.vercel\.app",
```

Restart uvicorn after editing.

### Sign-in fails with `clerk_origin_invalid`

You skipped step 6. Add the Vercel URL to the Clerk dashboard.

### Camera works locally but not on the deployed URL

Browsers require **HTTPS** for `getUserMedia`. Vercel deploys are
already HTTPS, so this should "just work" — but if you opened the URL
without HTTPS (e.g. via `http://`), the camera will silently fail.
Confirm the address bar shows the lock icon.

### MediaPipe model 404s

The pose model loads from `/models/pose_landmarker_lite.task` which is
served from `apps/web/public/`. Check that file is in the repo (it
should be tracked in git). If not, the deploy is missing the model
asset — add it back and redeploy.

---

## When you're ready to deploy the backend too

The frontend-only deploy unblocks design review and your own demos but
not real public usage. When you're ready to host the API, the work is:

- Add a `Procfile` or `render.yaml` so the chosen PaaS knows how to
  start uvicorn.
- Bind uvicorn to `0.0.0.0` and the platform's `$PORT`.
- Provision a Postgres instance and set `DATABASE_URL` (currently the
  code falls back to a local SQLite file, which is ephemeral on a
  PaaS).
- Pin the Python version with a `runtime.txt` or
  `.python-version`.
- Update `apps/api/main.py` CORS to include the Vercel origin.
- Update `NEXT_PUBLIC_API_URL` in Vercel to the new public API URL.

That's a separate PR. When you want to do it, ping the agent and we'll
walk through it the same way.
