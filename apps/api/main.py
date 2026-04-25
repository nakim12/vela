from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import models  # noqa: F401 — register ORM classes with Base
from db.migrate import run_migrations
from db.stubs import seed_demo_fixtures
from routes.agent import router as agent_router
from routes.health import router as health_router
from routes.sessions import router as sessions_router
from routes.user import router as user_router
from ws.session import router as ws_session_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    run_migrations()
    seed_demo_fixtures()
    yield


app = FastAPI(title="Vela API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(sessions_router, prefix="/api")
app.include_router(user_router, prefix="/api")
app.include_router(agent_router, prefix="/api")
app.include_router(ws_session_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "vela-api", "docs": "/docs"}
