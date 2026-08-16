import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import require_permission
from app.models.lead import Lead, Appointment
from app.core.tenant_context import require_tenant_id
from datetime import datetime

router = APIRouter(prefix="/v1/leads", tags=["leads"])


class LeadIn(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    company: str | None = None
    status: str = "new"
    notes: str | None = None


class AppointmentIn(BaseModel):
    lead_id: uuid.UUID | None = None
    call_id: uuid.UUID | None = None
    scheduled_at: datetime
    duration_minutes: int = 30
    notes: str | None = None


@router.get("", dependencies=[require_permission("lead:read")])
async def list_leads(limit: int = 50, offset: int = 0, db: AsyncSession = Depends(get_db)):
    tid = require_tenant_id()
    leads = (await db.scalars(
        select(Lead).where(Lead.tenant_id == tid).order_by(Lead.created_at.desc()).limit(limit).offset(offset)
    )).all()
    return {"data": [{"id": str(l.id), "name": l.name, "phone": l.phone,
                      "email": l.email, "company": l.company, "status": l.status,
                      "created_at": l.created_at.isoformat()} for l in leads]}


@router.post("", dependencies=[require_permission("lead:write")], status_code=201)
async def create_lead(body: LeadIn, db: AsyncSession = Depends(get_db)):
    tid = require_tenant_id()
    lead = Lead(tenant_id=tid, **body.model_dump())
    db.add(lead)
    await db.flush()
    return {"id": str(lead.id)}


@router.put("/{lead_id}", dependencies=[require_permission("lead:write")])
async def update_lead(lead_id: uuid.UUID, body: LeadIn, db: AsyncSession = Depends(get_db)):
    tid = require_tenant_id()
    lead = await db.scalar(select(Lead).where(Lead.id == lead_id, Lead.tenant_id == tid))
    if not lead:
        raise HTTPException(404)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(lead, k, v)
    return {"ok": True}


@router.post("/appointments", dependencies=[require_permission("appointment:write")], status_code=201)
async def create_appointment(body: AppointmentIn, db: AsyncSession = Depends(get_db)):
    tid = require_tenant_id()
    appt = Appointment(tenant_id=tid, **body.model_dump())
    db.add(appt)
    await db.flush()
    return {"id": str(appt.id)}


@router.get("/appointments", dependencies=[require_permission("appointment:read")])
async def list_appointments(db: AsyncSession = Depends(get_db)):
    tid = require_tenant_id()
    rows = (await db.scalars(
        select(Appointment).where(Appointment.tenant_id == tid).order_by(Appointment.scheduled_at)
    )).all()
    return {"data": [{"id": str(r.id), "lead_id": str(r.lead_id) if r.lead_id else None,
                      "scheduled_at": r.scheduled_at.isoformat(), "status": r.status,
                      "duration_minutes": r.duration_minutes} for r in rows]}
