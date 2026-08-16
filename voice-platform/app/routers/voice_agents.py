import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import require_permission
from app.models.voice_agent import VoiceAgent
from app.core.tenant_context import require_tenant_id
from app.services.elevenlabs_service import list_voices

router = APIRouter(prefix="/v1/agents", tags=["voice-agents"])


class AgentIn(BaseModel):
    name: str
    system_prompt: str
    voice_id: str | None = None
    llm_model: str | None = None
    language: str = "da"
    phone_number_id: uuid.UUID | None = None
    settings: dict = {}


def _agent_out(a: VoiceAgent) -> dict:
    return {
        "id": str(a.id), "name": a.name, "language": a.language,
        "voice_id": a.voice_id, "llm_model": a.llm_model,
        "phone_number_id": str(a.phone_number_id) if a.phone_number_id else None,
        "is_active": a.is_active, "settings": a.settings,
        "created_at": a.created_at.isoformat(),
    }


@router.get("", dependencies=[require_permission("agent:read")])
async def list_agents(db: AsyncSession = Depends(get_db)):
    tid = require_tenant_id()
    agents = (await db.scalars(select(VoiceAgent).where(VoiceAgent.tenant_id == tid))).all()
    return {"data": [_agent_out(a) for a in agents]}


@router.post("", dependencies=[require_permission("agent:write")], status_code=201)
async def create_agent(body: AgentIn, db: AsyncSession = Depends(get_db)):
    tid = require_tenant_id()
    agent = VoiceAgent(tenant_id=tid, **body.model_dump())
    db.add(agent)
    await db.flush()
    return _agent_out(agent)


@router.get("/{agent_id}", dependencies=[require_permission("agent:read")])
async def get_agent(agent_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    tid = require_tenant_id()
    a = await db.scalar(select(VoiceAgent).where(VoiceAgent.id == agent_id, VoiceAgent.tenant_id == tid))
    if not a:
        raise HTTPException(404, "Agent not found")
    return _agent_out(a)


@router.put("/{agent_id}", dependencies=[require_permission("agent:write")])
async def update_agent(agent_id: uuid.UUID, body: AgentIn, db: AsyncSession = Depends(get_db)):
    tid = require_tenant_id()
    a = await db.scalar(select(VoiceAgent).where(VoiceAgent.id == agent_id, VoiceAgent.tenant_id == tid))
    if not a:
        raise HTTPException(404)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(a, k, v)
    return _agent_out(a)


@router.delete("/{agent_id}", dependencies=[require_permission("agent:write")])
async def delete_agent(agent_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    tid = require_tenant_id()
    a = await db.scalar(select(VoiceAgent).where(VoiceAgent.id == agent_id, VoiceAgent.tenant_id == tid))
    if not a:
        raise HTTPException(404)
    await db.delete(a)
    return {"ok": True}


@router.get("/voices/list", dependencies=[require_permission("agent:read")])
async def get_voices(db: AsyncSession = Depends(get_db)):
    """List available ElevenLabs voices for this tenant."""
    from sqlalchemy import select as sel
    from app.models.tenant import Tenant
    tid = require_tenant_id()
    tenant = await db.get(Tenant, tid)
    voices = await list_voices(tenant)
    return {"data": voices}
