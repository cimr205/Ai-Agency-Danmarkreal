"""
Thread-local-style tenant context using contextvars (async-safe).
Set once in middleware, read anywhere in the request lifecycle.
"""

from contextvars import ContextVar
from uuid import UUID

_tenant_id_var: ContextVar[UUID | None] = ContextVar("tenant_id", default=None)
_tenant_role_var: ContextVar[str | None] = ContextVar("tenant_role", default=None)


def set_tenant(tenant_id: UUID, role: str | None = None) -> None:
    _tenant_id_var.set(tenant_id)
    _tenant_role_var.set(role)


def get_tenant_id() -> UUID | None:
    return _tenant_id_var.get()


def require_tenant_id() -> UUID:
    tid = _tenant_id_var.get()
    if tid is None:
        raise RuntimeError("No tenant in context — did middleware run?")
    return tid


def get_tenant_role() -> str | None:
    return _tenant_role_var.get()
