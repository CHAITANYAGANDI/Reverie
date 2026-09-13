"""Factory that selects provider adapters from `AI_PROVIDER`."""

from __future__ import annotations

import logging

from app.config import Settings
from app.providers.mock_adapter import (
    MockEmbeddingAdapter,
    MockLlmAdapter,
    MockTranscriptionAdapter,
)
from app.providers.ports import EmbeddingPort, LlmPort, TranscriptionPort

logger = logging.getLogger("ai-service.factory")


#: Whether a transcription provider needs Reverie to hand it the actual bytes.
#:
#: Written out per provider rather than inferred, because the thing it prevents
#: is silent: a provider that cannot fetch a URL, given a URL and no bytes,
#: uploads an empty file. Whisper answers that with a 400 and the retry wrapper
#: turns three 400s into an empty transcript, so the meeting completes, the
#: callback returns 200, and the only symptom is a recording that transcribed
#: to nothing.
#:
#: The default for anything not listed is True — download and hand the bytes
#: over. That is the slower answer and never the silently wrong one.
_NEEDS_AUDIO_BYTES = {
    # Fetches the object itself from `TranscriptionRequest.audio_url`, which is
    # the whole point of passing one: an hour of audio does not cross this
    # process twice for bytes it never looks at.
    "assemblyai": False,
    # `OpenAiTranscriptionAdapter.transcribe` builds `io.BytesIO(audio)` and
    # ignores `request` entirely. It has no way to reach a URL.
    "openai": True,
    # Scripted. It reads `audio` only to pick which script, and works with the
    # empty bytes it gets today, so there is nothing to download on its behalf.
    "mock": False,
}


class AiProviderFactory:
    """Creates the transcription + LLM ports for the configured provider."""

    @staticmethod
    def resolve_transcription_provider(settings: Settings) -> str:
        """Which provider `create_transcription` will actually build.

        Split out so the worker can ask the same question without duplicating
        the `auto` rule — two copies of this would drift, and the way they would
        drift is one of them quietly preparing the wrong kind of source.
        """
        choice = settings.transcription_provider
        return settings.ai_provider if choice == "auto" else choice

    @staticmethod
    def transcription_needs_audio_bytes(settings: Settings) -> bool:
        """Whether the caller must download the recording before transcribing.

        False means the provider will fetch the URL itself and the download can
        be skipped. See `_NEEDS_AUDIO_BYTES`.
        """
        provider = AiProviderFactory.resolve_transcription_provider(settings)
        return _NEEDS_AUDIO_BYTES.get(provider, True)

    @staticmethod
    def create_transcription(settings: Settings) -> TranscriptionPort:
        # Transcription is selected independently of the LLM so speech and
        # analysis can come from different vendors — AssemblyAI diarizes, which
        # Whisper does not. "auto" keeps the original behaviour of following
        # `ai_provider`.
        choice = AiProviderFactory.resolve_transcription_provider(settings)

        if choice == "assemblyai":
            from app.providers.assemblyai_adapter import AssemblyAiTranscriptionAdapter

            logger.info(
                "Using AssemblyAI transcription adapter (%s, diarization on).",
                settings.assemblyai_model,
            )
            return AssemblyAiTranscriptionAdapter(settings)

        if choice == "openai":
            # Imported lazily so the mock path never requires the OpenAI client.
            from app.providers.openai_adapter import OpenAiTranscriptionAdapter

            logger.info("Using OpenAI transcription adapter (%s).", settings.openai_transcribe_model)
            return OpenAiTranscriptionAdapter(settings)

        logger.info("Using mock transcription adapter.")
        return MockTranscriptionAdapter()

    @staticmethod
    def create_llm(settings: Settings) -> LlmPort:
        if settings.ai_provider == "openai":
            from app.providers.openai_adapter import OpenAiLlmAdapter

            logger.info("Using OpenAI LLM adapter (%s).", settings.openai_chat_model)
            return OpenAiLlmAdapter(settings)
        logger.info("Using mock LLM adapter.")
        return MockLlmAdapter()

    @staticmethod
    def create_embedding(settings: Settings) -> EmbeddingPort:
        if settings.ai_provider == "openai":
            from app.providers.openai_adapter import OpenAiEmbeddingAdapter

            logger.info("Using OpenAI embedding adapter (%s).", settings.openai_embed_model)
            return OpenAiEmbeddingAdapter(settings)
        logger.info("Using mock embedding adapter (dim=%d).", settings.embed_dim)
        return MockEmbeddingAdapter(dim=settings.embed_dim)
