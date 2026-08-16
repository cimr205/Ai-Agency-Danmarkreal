"""
Crater CRM — AI Voice Agent Platform
Multi-tenant FastAPI + Pipecat + Twilio + ElevenLabs + Groq
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine
from app.redis_client import close_redis
from app.middleware.tenant import TenantMiddleware
from app.routers import auth, tenants, voice_agents, calls, leads, webhooks


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()
    await close_redis()


app = FastAPI(
    title="Crater CRM — Voice Platform",
    version="1.0.0",
    description="Multi-tenant AI voice agent platform: Pipecat · Twilio · ElevenLabs · Groq",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # tighten per-tenant in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Tenant resolution (runs before every request) ─────────────────────────────
app.add_middleware(TenantMiddleware)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(tenants.router)
app.include_router(voice_agents.router)
app.include_router(calls.router)
app.include_router(leads.router)
app.include_router(webhooks.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "voice-platform"}
