"""
FastAPI application entry point.
Run with: uvicorn main:app --host 0.0.0.0 --port $PORT
"""
import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router as api_router
from api.webhook import router as webhook_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("SDR Agent API starting — version 1.0")
    log.info("Supabase: %s", os.environ.get("SUPABASE_URL", "NOT SET"))
    log.info("Groq model: llama-3.3-70b-versatile")
    yield
    log.info("SDR Agent API shutting down")


app = FastAPI(
    title="CRM SDR Agent",
    description="Autonomous AI sales development representative for AI Agency Danmark CRM",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.include_router(webhook_router)


@app.get("/")
async def root():
    return {
        "service": "CRM SDR Agent",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "agent_status": "/agent/status",
            "new_lead_webhook": "POST /webhook/new-lead",
            "meta_lead_webhook": "POST /webhook/meta-lead",
            "morning_summary": "/tenant/{tenant_id}/summary",
            "create_tenant": "POST /tenant/create",
        },
    }
