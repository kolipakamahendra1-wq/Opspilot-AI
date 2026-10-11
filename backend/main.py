from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.agents.service import recover_interrupted_runs
from backend.api import admin, core
from backend.config import get_settings
from backend.database.session import init_db
from backend.security.rate_limit import RateLimitMiddleware


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    recover_interrupted_runs()
    yield


settings = get_settings()
app = FastAPI(title="OpsPilot AI", version="1.0.0", lifespan=lifespan)
app.add_middleware(RateLimitMiddleware, per_minute=settings.rate_limit_per_minute)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins.split(","), allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(core.router)
app.include_router(admin.router)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}
