"""
Pipecat voice pipeline per call.

Flow (inspired by pipecat-ai/pipecat + kylecampbell/pipecat-twilio-agent):

  Twilio Media Stream (WebSocket)
    ↓ mulaw audio
  TwilioFrameSerializer
    ↓
  AudioRawFrame
    ↓
  SileroVADAnalyzer (VAD — detects speech boundaries)
    ↓
  GroqSTTService (Whisper — speech → text)
    ↓
  LLMUserResponseAggregator
    ↓
  GroqLLMService (llama3 — generates reply)
    ↓
  LLMAssistantResponseAggregator
    ↓
  ElevenLabsTTSService (text → speech)
    ↓
  TwilioFrameSerializer
    ↓
  Twilio Media Stream (WebSocket)
"""

import asyncio
import uuid
from datetime import datetime, timezone

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import EndFrame, TranscriptionFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_response import (
    LLMAssistantResponseAggregator,
    LLMUserResponseAggregator,
)
from pipecat.services.elevenlabs import ElevenLabsTTSService
from pipecat.services.groq import GroqLLMService, GroqSTTService
from pipecat.transports.network.fastapi_websocket import (
    FastAPIWebsocketParams,
    FastAPIWebsocketTransport,
)
from pipecat.serializers.twilio import TwilioFrameSerializer

from app.config import settings
from app.core.security import decrypt_secret


class VoiceCallPipeline:
    """
    One instance per live call.  Call `run(websocket)` from the WebSocket handler.
    Writes transcript turns back via the `on_transcript` callback so the router
    can persist them to PostgreSQL.
    """

    def __init__(
        self,
        call_id: uuid.UUID,
        system_prompt: str,
        voice_id: str | None,
        llm_model: str | None,
        elevenlabs_api_key: str,
        groq_api_key: str,
        on_transcript=None,   # async callable(role, content)
    ):
        self.call_id = call_id
        self.system_prompt = system_prompt
        self.voice_id = voice_id or settings.elevenlabs_default_voice_id
        self.llm_model = llm_model or settings.groq_llm_model
        self.el_api_key = elevenlabs_api_key
        self.groq_api_key = groq_api_key
        self.on_transcript = on_transcript
        self._task: PipelineTask | None = None

    async def run(self, websocket) -> None:
        transport = FastAPIWebsocketTransport(
            websocket=websocket,
            params=FastAPIWebsocketParams(
                audio_in_enabled=True,
                audio_out_enabled=True,
                add_wav_header=False,
                vad_enabled=True,
                vad_analyzer=SileroVADAnalyzer(),
                vad_audio_passthrough=True,
                serializer=TwilioFrameSerializer(),
            ),
        )

        stt = GroqSTTService(api_key=self.groq_api_key, model=settings.groq_stt_model)
        llm = GroqLLMService(
            api_key=self.groq_api_key,
            model=self.llm_model,
            system=self.system_prompt,
        )
        tts = ElevenLabsTTSService(
            api_key=self.el_api_key,
            voice_id=self.voice_id,
            model="eleven_turbo_v2_5",
            output_format="ulaw_8000",
        )

        user_agg = LLMUserResponseAggregator()
        assistant_agg = LLMAssistantResponseAggregator()

        pipeline = Pipeline([
            transport.input(),
            stt,
            user_agg,
            llm,
            tts,
            assistant_agg,
            transport.output(),
        ])

        self._task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))

        # Hook into transcript frames
        if self.on_transcript:
            @self._task.event_handler("on_frame_pushed")
            async def _on_frame(task, frame):
                if isinstance(frame, TranscriptionFrame):
                    role = "user" if frame.user_id else "assistant"
                    await self.on_transcript(role, frame.text)

        runner = PipelineRunner()
        await runner.run(self._task)

    async def stop(self) -> None:
        if self._task:
            await self._task.queue_frame(EndFrame())


def build_pipeline_for_agent(agent, tenant) -> "VoiceCallPipeline":
    """Factory: build a VoiceCallPipeline from ORM objects."""
    el_key = settings.elevenlabs_api_key
    if tenant.elevenlabs_api_key_enc:
        el_key = decrypt_secret(tenant.elevenlabs_api_key_enc)

    groq_key = settings.groq_api_key
    if tenant.groq_api_key_enc:
        groq_key = decrypt_secret(tenant.groq_api_key_enc)

    return VoiceCallPipeline(
        call_id=uuid.uuid4(),
        system_prompt=agent.system_prompt,
        voice_id=agent.voice_id,
        llm_model=agent.llm_model,
        elevenlabs_api_key=el_key,
        groq_api_key=groq_key,
    )
