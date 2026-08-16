from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://voice:voice@localhost:5432/voiceplatform"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30
    algorithm: str = "HS256"

    # Platform
    base_domain: str = "aiagency.dk"
    public_url: str = "http://localhost:8000"

    # Twilio (platform-level)
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""

    # ElevenLabs
    elevenlabs_api_key: str = ""
    elevenlabs_default_voice_id: str = "21m00Tcm4TlvDq8ikWAM"

    # Groq
    groq_api_key: str = ""
    groq_llm_model: str = "llama3-8b-8192"
    groq_stt_model: str = "whisper-large-v3"

    # Encryption key for tenant secrets stored in DB
    encryption_key: str = "change-me-32-bytes-exactly-here!!"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
