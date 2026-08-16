"""ElevenLabs service — voice listing + streaming TTS helpers."""

from elevenlabs.client import ElevenLabs
from app.config import settings
from app.core.security import decrypt_secret


def get_elevenlabs_client(tenant=None) -> ElevenLabs:
    api_key = settings.elevenlabs_api_key
    if tenant and tenant.elevenlabs_api_key_enc:
        api_key = decrypt_secret(tenant.elevenlabs_api_key_enc)
    return ElevenLabs(api_key=api_key)


def get_default_voice_id(tenant=None) -> str:
    if tenant:
        agents = getattr(tenant, "voice_agents", [])
        if agents and agents[0].voice_id:
            return agents[0].voice_id
    return settings.elevenlabs_default_voice_id


async def list_voices(tenant=None) -> list[dict]:
    client = get_elevenlabs_client(tenant)
    voices = client.voices.get_all()
    return [
        {"id": v.voice_id, "name": v.name, "preview_url": v.preview_url}
        for v in voices.voices
    ]
