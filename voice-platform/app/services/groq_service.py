"""Groq service — LLM completions + Whisper STT."""

from groq import AsyncGroq
from app.config import settings
from app.core.security import decrypt_secret


def get_groq_client(tenant=None) -> AsyncGroq:
    api_key = settings.groq_api_key
    if tenant and tenant.groq_api_key_enc:
        api_key = decrypt_secret(tenant.groq_api_key_enc)
    return AsyncGroq(api_key=api_key)


async def transcribe_audio(audio_bytes: bytes, tenant=None) -> str:
    """Transcribe audio bytes using Groq Whisper."""
    client = get_groq_client(tenant)
    transcription = await client.audio.transcriptions.create(
        file=("audio.wav", audio_bytes, "audio/wav"),
        model=settings.groq_stt_model,
    )
    return transcription.text


async def chat_completion(
    messages: list[dict],
    system_prompt: str,
    model: str | None = None,
    tenant=None,
) -> str:
    """Single-turn LLM completion."""
    client = get_groq_client(tenant)
    full_messages = [{"role": "system", "content": system_prompt}] + messages
    response = await client.chat.completions.create(
        model=model or settings.groq_llm_model,
        messages=full_messages,
        temperature=0.7,
        max_tokens=512,
    )
    return response.choices[0].message.content or ""
