"""Load tenant config. Cached in-process for 60 seconds."""
import time
from db.queries import fetch_tenant, fetch_all_tenants

_cache: dict[str, tuple[dict, float]] = {}
TTL = 60.0


def get_tenant(tenant_id: str) -> dict | None:
    now = time.monotonic()
    if tenant_id in _cache:
        data, ts = _cache[tenant_id]
        if now - ts < TTL:
            return data
    tenant = fetch_tenant(tenant_id)
    if tenant:
        _cache[tenant_id] = (tenant, now)
    return tenant


def get_all_tenants() -> list[dict]:
    return fetch_all_tenants()
