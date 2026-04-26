from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import models  # noqa: F401 — register ORM classes with Base
from db.migrate import run_migrations
from db.stubs import seed_demo_fixtures
from routes.agent import router as agent_router
from routes.health import router as health_router
from routes.onboarding import router as onboarding_router
from routes.sessions import router as sessions_router
from routes.user import router as user_router
from ws.session import router as ws_session_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    run_migrations()
    seed_demo_fixtures()
    yield


app = FastAPI(title="Vela API", version="0.1.0", lifespan=lifespan)

# CORS: allow the local Next.js dev server plus the deployed Vercel
# frontends. Production is `romus.vercel.app`; preview deploys come in
# as `romus-<hash>-<scope>.vercel.app` and `romus-git-<branch>-<scope>.vercel.app`,
# all of which match the regex below. To add another origin (e.g. a
# custom domain) just append it to `allow_origins`.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://romus.vercel.app",
    ],
    allow_origin_regex=r"https://romus(-[a-z0-9-]+)?\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(sessions_router, prefix="/api")
app.include_router(user_router, prefix="/api")
app.include_router(agent_router, prefix="/api")
app.include_router(onboarding_router, prefix="/api")
app.include_router(ws_session_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "vela-api", "docs": "/docs"}
