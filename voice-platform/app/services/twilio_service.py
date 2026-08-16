"""Twilio service — per-tenant client + TwiML helpers."""

from twilio.rest import Client
from twilio.twiml.voice_response import Connect, VoiceResponse, Stream
from app.config import settings
from app.core.security import decrypt_secret


def get_twilio_client(account_sid: str | None = None, auth_token: str | None = None) -> Client:
    sid = account_sid or settings.twilio_account_sid
    tok = auth_token or settings.twilio_auth_token
    return Client(sid, tok)


def tenant_twilio_client(tenant) -> Client:
    """Build a Twilio client using tenant's own credentials (decrypted)."""
    sid = tenant.twilio_account_sid or settings.twilio_account_sid
    tok = decrypt_secret(tenant.twilio_auth_token_enc) if tenant.twilio_auth_token_enc else settings.twilio_auth_token
    return Client(sid, tok)


def build_stream_twiml(websocket_url: str) -> str:
    """
    TwiML that connects an inbound call to a Pipecat WebSocket stream.

    Twilio calls this webhook, gets the TwiML, then opens a bidirectional
    Media Stream to `websocket_url` carrying raw mulaw audio.
    """
    response = VoiceResponse()
    connect  = Connect()
    stream   = Stream(url=websocket_url)
    stream.parameter(name="codec", value="audio/x-mulaw;rate=8000")
    connect.append(stream)
    response.append(connect)
    return str(response)


async def make_outbound_call(
    tenant,
    to_number: str,
    from_number: str,
    webhook_url: str,
) -> str:
    """Initiate an outbound call and return the Twilio call SID."""
    client = tenant_twilio_client(tenant)
    call = client.calls.create(
        to=to_number,
        from_=from_number,
        url=webhook_url,
        method="POST",
    )
    return call.sid
