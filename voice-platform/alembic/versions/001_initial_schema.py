"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── tenants ───────────────────────────────────────────────────────────────
    op.create_table('tenants',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('slug', sa.String(63), unique=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('plan', sa.String(50), nullable=False, server_default='starter'),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('is_suspended', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('twilio_account_sid', sa.Text),
        sa.Column('twilio_auth_token_enc', sa.Text),   # encrypted at rest
        sa.Column('elevenlabs_api_key_enc', sa.Text),
        sa.Column('groq_api_key_enc', sa.Text),
        sa.Column('settings', postgresql.JSONB, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_tenants_slug', 'tenants', ['slug'])

    # ── users ─────────────────────────────────────────────────────────────────
    op.create_table('users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('email', sa.String(255), unique=True, nullable=False),
        sa.Column('hashed_password', sa.Text),
        sa.Column('full_name', sa.String(255)),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('is_platform_admin', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_users_email', 'users', ['email'])

    # ── tenant_users (memberships + roles) ────────────────────────────────────
    op.create_table('tenant_users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(50), nullable=False, server_default='agent_user'),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.UniqueConstraint('tenant_id', 'user_id', name='uq_tenant_users'),
    )
    op.create_index('ix_tenant_users_tenant', 'tenant_users', ['tenant_id'])
    op.create_index('ix_tenant_users_user', 'tenant_users', ['user_id'])

    # ── api_keys ──────────────────────────────────────────────────────────────
    op.create_table('api_keys',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE')),
        sa.Column('key_hash', sa.String(64), unique=True, nullable=False),
        sa.Column('name', sa.String(255)),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('last_used_at', sa.DateTime(timezone=True)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_api_keys_hash', 'api_keys', ['key_hash'])

    # ── phone_numbers ─────────────────────────────────────────────────────────
    op.create_table('phone_numbers',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('number', sa.String(20), unique=True, nullable=False),
        sa.Column('twilio_sid', sa.String(50)),
        sa.Column('friendly_name', sa.String(255)),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_phone_numbers_number', 'phone_numbers', ['number'])
    op.create_index('ix_phone_numbers_tenant', 'phone_numbers', ['tenant_id'])

    # ── voice_agents ──────────────────────────────────────────────────────────
    op.create_table('voice_agents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('system_prompt', sa.Text, nullable=False),
        sa.Column('voice_id', sa.String(100)),           # ElevenLabs voice ID
        sa.Column('llm_model', sa.String(100)),          # Groq model override
        sa.Column('language', sa.String(10), server_default='da'),
        sa.Column('phone_number_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('phone_numbers.id', ondelete='SET NULL')),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('settings', postgresql.JSONB, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_voice_agents_tenant', 'voice_agents', ['tenant_id'])

    # ── calls ─────────────────────────────────────────────────────────────────
    op.create_table('calls',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('voice_agent_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('voice_agents.id', ondelete='SET NULL')),
        sa.Column('twilio_call_sid', sa.String(50), unique=True),
        sa.Column('from_number', sa.String(20)),
        sa.Column('to_number', sa.String(20)),
        sa.Column('direction', sa.String(10), server_default='inbound'),   # inbound | outbound
        sa.Column('status', sa.String(30), server_default='initiated'),
        sa.Column('duration_seconds', sa.Integer),
        sa.Column('started_at', sa.DateTime(timezone=True)),
        sa.Column('ended_at', sa.DateTime(timezone=True)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_calls_tenant', 'calls', ['tenant_id'])
    op.create_index('ix_calls_twilio_sid', 'calls', ['twilio_call_sid'])

    # ── call_events ───────────────────────────────────────────────────────────
    op.create_table('call_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('call_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('calls.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('payload', postgresql.JSONB, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_call_events_call', 'call_events', ['call_id'])

    # ── transcripts ───────────────────────────────────────────────────────────
    op.create_table('transcripts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('call_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('calls.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(20), nullable=False),   # user | assistant
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_transcripts_call', 'transcripts', ['call_id'])
    op.create_index('ix_transcripts_tenant', 'transcripts', ['tenant_id'])

    # ── leads ─────────────────────────────────────────────────────────────────
    op.create_table('leads',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('call_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('calls.id', ondelete='SET NULL')),
        sa.Column('name', sa.String(255)),
        sa.Column('phone', sa.String(20)),
        sa.Column('email', sa.String(255)),
        sa.Column('company', sa.String(255)),
        sa.Column('status', sa.String(50), server_default='new'),
        sa.Column('notes', sa.Text),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_leads_tenant', 'leads', ['tenant_id'])

    # ── appointments ──────────────────────────────────────────────────────────
    op.create_table('appointments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('lead_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('leads.id', ondelete='SET NULL')),
        sa.Column('call_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('calls.id', ondelete='SET NULL')),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('duration_minutes', sa.Integer, server_default='30'),
        sa.Column('status', sa.String(30), server_default='scheduled'),
        sa.Column('notes', sa.Text),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_appointments_tenant', 'appointments', ['tenant_id'])


def downgrade() -> None:
    for table in ['appointments','leads','transcripts','call_events','calls',
                  'voice_agents','phone_numbers','api_keys','tenant_users','users','tenants']:
        op.drop_table(table)
