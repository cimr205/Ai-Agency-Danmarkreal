"""
RBAC + JWT + password hashing.

Roles (highest → lowest):
  platform_admin  — sees everything, can suspend tenants
  tenant_owner    — owns one tenant, full control within it
  tenant_admin    — manage users + agents
  sales_manager   — read leads, calls, transcripts
  agent_user      — use voice agent, see own calls
  viewer          — read-only
"""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── Role hierarchy ─────────────────────────────────────────────────────────────

ROLE_LEVEL: dict[str, int] = {
    "platform_admin": 100,
    "tenant_owner":    80,
    "tenant_admin":    60,
    "sales_manager":   40,
    "agent_user":      20,
    "viewer":          10,
}

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "platform_admin": {
        "tenant:read", "tenant:write", "tenant:suspend",
        "user:read", "user:write",
        "agent:read", "agent:write",
        "call:read", "transcript:read",
        "lead:read", "lead:write",
        "appointment:read", "appointment:write",
        "stats:global",
    },
    "tenant_owner": {
        "tenant:read", "tenant:write",
        "user:read", "user:write",
        "agent:read", "agent:write",
        "call:read", "transcript:read",
        "lead:read", "lead:write",
        "appointment:read", "appointment:write",
        "billing:write",
    },
    "tenant_admin": {
        "user:read", "user:write",
        "agent:read", "agent:write",
        "call:read", "transcript:read",
        "lead:read",
        "appointment:read",
    },
    "sales_manager": {
        "call:read", "transcript:read",
        "lead:read", "lead:write",
        "appointment:read", "appointment:write",
    },
    "agent_user": {
        "call:read",
        "lead:read",
        "appointment:read",
    },
    "viewer": {
        "call:read",
        "lead:read",
    },
}


def role_has_permission(role: str, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(role, set())


def role_gte(role: str, minimum: str) -> bool:
    return ROLE_LEVEL.get(role, 0) >= ROLE_LEVEL.get(minimum, 0)


# ── Password ───────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── JWT ────────────────────────────────────────────────────────────────────────

def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    payload = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    payload.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])


# ── API key helpers ────────────────────────────────────────────────────────────

def generate_api_key() -> tuple[str, str]:
    """Returns (raw_key, key_hash). Store only the hash."""
    raw = "vp_" + secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(raw.encode()).hexdigest()
    return raw, key_hash


def hash_api_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Field-level encryption for tenant secrets ──────────────────────────────────

from base64 import b64encode, b64decode
from cryptography.fernet import Fernet


def _fernet() -> Fernet:
    key = settings.encryption_key.encode()[:32]
    key = key.ljust(32, b"=")
    return Fernet(b64encode(key))


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    return _fernet().decrypt(value.encode()).decode()
