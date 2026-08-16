import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import require_permission
from app.models.call import Call, Transcript
from app.models.voice_agent import VoiceAgent, PhoneNumber
from app.models.tenant import Tenant
from app.core.tenant_context import require_tenant_id
from app.services.twilio_service import make_outbound_call
from app.config import settings

router = APIRouter(prefix="/v1/calls", tags=["calls"])


class OutboundCallIn(BaseModel):
    agent_id: uuid.UUID
    to_number: str


def _call_out(c: Call) -> dict:
    return {
        "id": str(c.id), "status": c.status, "direction": c.direction,
        "from_number": c.from_number, "to_number": c.to_number,
        "duration_seconds": c.duration_seconds,
        "started_at": c.started_at.isoformat() if c.started_at else None,
        "ended_at": c.ended_at.isoformat() if c.ended_at else None,
        "created_at": c.created_at.isoformat(),
        "voice_agent_id": str(c.voice_agent_id) if c.voice_agent_id else None,
    }


@router.get("", dependencies=[require_permission("call:read")])
async def list_calls(limit: int = 50, offset: int = 0, db: AsyncSession = Depends(get_db)):
    tid = require_tenant_id()
    calls = (await db.scalars(
        select(Call).where(Call.tenant_id == tid).order_by(Call.created_at.desc()).limit(limit).offset(offset)
    )).all()
    return {"data": [_call_out(c) for c in calls]}


@router.get("/{call_id}", dependencies=[require_permission("call:read")])
async def get_call(call_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    tid = require_tenant_id()
    c = await db.scalar(select(Call).where(Call.id == call_id, Call.tenant_id == tid))
    if not c:
        raise HTTPException(404)
    return _call_out(c)


@router.get("/{call_id}/transcript", dependencies=[require_permission("transcript:read")])
async def get_transcript(call_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    tid = require_tenant_id()
    rows = (await db.scalars(
        select(Transcript).where(Transcript.call_id == call_id, Transcript.tenant_id == tid)
        .order_by(Transcript.created_at)
    )).all()
    return {"data": [{"role": r.role, "content": r.content, "at": r.created_at.isoformat()} for r in rows]}


@router.post("/outbound", dependencies=[require_permission("call:read")], status_code=201)
async def initiate_outbound(body: OutboundCallIn, db: AsyncSession = Depends(get_db)):
    tid = require_tenant_id()
    agent = await db.scalar(select(VoiceAgent).where(VoiceAgent.id == body.agent_id, VoiceAgent.tenant_id == tid))
    if not agent or not agent.phone_number_id:
        raise HTTPException(400, "Agent has no phone number assigned")
    phone = await db.get(PhoneNumber, agent.phone_number_id)
    tenant = await db.get(Tenant, tid)
    webhook_url = f"{settings.public_url}/v1/webhooks/voice/{agent.id}"
    sid = await make_outbound_call(tenant, body.to_number, phone.number, webhook_url)
    call = Call(tenant_id=tid, voice_agent_id=agent.id, twilio_call_sid=sid,
                from_number=phone.number, to_number=body.to_number, direction="outbound")
    db.add(call)
    await db.flush()
    return _call_out(call)
