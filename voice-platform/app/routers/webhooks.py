"""
Twilio webhook + WebSocket handlers.

POST /v1/webhooks/voice/{agent_id}
  Called by Twilio when a call arrives on a number.
  Returns TwiML that opens a Media Stream WebSocket.

WS   /v1/webhooks/stream/{agent_id}
  The actual real-time audio bridge to Pipecat.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, AsyncSessionLocal
from app.models.call import Call, Transcript
from app.models.voice_agent import VoiceAgent
from app.models.tenant import Tenant
from app.services.twilio_service import build_stream_twiml
from app.voice.pipeline import build_pipeline_for_agent
from app.config import settings
from app.core.tenant_context import set_tenant

router = APIRouter(prefix="/v1/webhooks", tags=["webhooks"])


@router.post("/voice/{agent_id}")
async def twilio_voice_webhook(agent_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Twilio hits this URL when an inbound call arrives.
    We respond with TwiML that streams audio to our WebSocket endpoint.
    """
    form = await request.form()
    twilio_call_sid = form.get("CallSid", "")
    from_number     = form.get("From", "")
    to_number       = form.get("To", "")

    agent = await db.get(VoiceAgent, agent_id)
    if not agent or not agent.is_active:
        from fastapi.responses import Response
        return Response(content="<Response><Hangup/></Response>", media_type="text/xml")

    # Record the call
    set_tenant(agent.tenant_id)
    call = Call(
        tenant_id=agent.tenant_id,
        voice_agent_id=agent_id,
        twilio_call_sid=twilio_call_sid,
        from_number=from_number,
        to_number=to_number,
        direction="inbound",
        status="in-progress",
        started_at=datetime.now(timezone.utc),
    )
    db.add(call)
    await db.flush()

    ws_url = f"{settings.public_url.replace('https://', 'wss://').replace('http://', 'ws://')}/v1/webhooks/stream/{agent_id}?call_id={call.id}"
    twiml  = build_stream_twiml(ws_url)

    from fastapi.responses import Response
    return Response(content=twiml, media_type="text/xml")


@router.websocket("/stream/{agent_id}")
async def twilio_media_stream(websocket: WebSocket, agent_id: uuid.UUID, call_id: uuid.UUID | None = None):
    """
    Bidirectional WebSocket that carries Twilio Media Stream audio.
    Pipecat runs the full STT → LLM → TTS pipeline here.
    """
    await websocket.accept()

    async with AsyncSessionLocal() as db:
        agent = await db.get(VoiceAgent, agent_id)
        if not agent:
            await websocket.close(code=1008)
            return
        tenant = await db.get(Tenant, agent.tenant_id)

    async def save_transcript(role: str, content: str):
        if not call_id or not content.strip():
            return
        async with AsyncSessionLocal() as db:
            row = Transcript(
                tenant_id=agent.tenant_id,
                call_id=call_id,
                role=role,
                content=content.strip(),
            )
            db.add(row)
            await db.commit()

    pipeline = build_pipeline_for_agent(agent, tenant)
    pipeline.call_id = call_id or uuid.uuid4()
    pipeline.on_transcript = save_transcript

    try:
        await pipeline.run(websocket)
    except WebSocketDisconnect:
        pass
    finally:
        # Mark call ended
        if call_id:
            async with AsyncSessionLocal() as db:
                call = await db.get(Call, call_id)
                if call:
                    call.status = "completed"
                    call.ended_at = datetime.now(timezone.utc)
                    if call.started_at:
                        call.duration_seconds = int(
                            (call.ended_at - call.started_at).total_seconds()
                        )
                    await db.commit()
