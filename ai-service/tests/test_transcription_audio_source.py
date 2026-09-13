"""Which providers get a URL, and which get the bytes.

Handing the provider a presigned URL instead of relaying the whole recording is
a real saving — an hour of audio not crossing this process twice — and
AssemblyAI supports it through `TranscriptionRequest.audio_url`. The worker did
it for every provider.

Only one of them can act on it. `OpenAiTranscriptionAdapter.transcribe` builds
`io.BytesIO(audio)` and ignores `request` entirely, so under the production
configuration — `TRANSCRIPTION_PROVIDER=auto` with `AI_PROVIDER=openai` — it was
handed a URL it cannot read plus the empty bytes that stood in for the download,
and uploaded an empty file to Whisper:

    OpenAI transcribe failed (attempt 1/3): BadRequestError
    OpenAI transcribe failed (attempt 2/3): BadRequestError
    OpenAI transcribe failed (attempt 3/3): BadRequestError
    OpenAI transcribe exhausted retries; returning fallback.

The retry wrapper then turned three 400s into an empty transcript, so the
callback returned 200 and the meeting completed. Nothing failed; the recording
simply transcribed to nothing.

These tests assert on what the worker *prepares*, because that is where the
decision is and because the symptom downstream is silence.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.config import Settings
from app.kafka_worker import KafkaWorker
from app.providers.assemblyai_adapter import AudioUnreachableError
from app.schemas import MeetingUploadedEvent

URL = "https://r2.example.invalid/meetings/usr_1/mtg_1/audio.m4a?X-Amz-Signature=xyz"
BYTES = b"RIFF....actual recording bytes...."

EVENT = MeetingUploadedEvent(
    meetingId="mtg_1",
    userId="usr_1",
    objectKey="meetings/usr_1/mtg_1/audio.m4a",
)


class _RecordingPipeline:
    """Captures what the worker handed it, and can fail the first attempt."""

    def __init__(self, *, fail_first_with: Exception | None = None) -> None:
        self.calls: list[dict] = []
        self._fail_first_with = fail_first_with

    async def process(self, meeting_id, audio, filename, *args, **kwargs):
        self.calls.append(
            {"audio": audio, "filename": filename, "request": kwargs.get("request")}
        )
        if self._fail_first_with is not None and len(self.calls) == 1:
            raise self._fail_first_with
        return SimpleNamespace(meeting_id=meeting_id)


def _worker(pipeline, **settings_overrides) -> KafkaWorker:
    return KafkaWorker(
        settings=Settings(**settings_overrides),
        pipeline=pipeline,
        callback=None,
    )


@pytest.fixture()
def storage(monkeypatch):
    """Stands in for R2: records whether the bytes were actually fetched."""
    calls = SimpleNamespace(presigned=0, fetched=0, url=URL)

    def _presigned(object_key, settings, **_):
        calls.presigned += 1
        return calls.url

    async def _fetch(settings, *, audio_url=None, object_key=None):
        calls.fetched += 1
        return BYTES, "audio.m4a"

    monkeypatch.setattr("app.kafka_worker.presigned_get_url", _presigned)
    monkeypatch.setattr("app.kafka_worker.fetch_audio", _fetch)
    return calls


# --- A. auto + openai, which is what production runs ------------------------ #
@pytest.mark.asyncio
async def test_openai_under_auto_is_given_the_bytes_not_a_url(storage):
    pipeline = _RecordingPipeline()
    worker = _worker(pipeline, transcription_provider="auto", ai_provider="openai")

    await worker._process_source(EVENT, None, None)  # noqa: SLF001

    # The download happened. Before the fix it did not: a URL existed, so the
    # worker skipped it and passed the empty placeholder.
    assert storage.fetched == 1
    call = pipeline.calls[0]
    assert call["audio"] == BYTES
    assert call["audio"] != b""
    # And no URL was offered to an adapter that cannot read one. Leaving it on
    # the request would be harmless today and misleading tomorrow.
    assert call["request"].audio_url is None


@pytest.mark.asyncio
async def test_openai_named_explicitly_is_also_given_the_bytes(storage):
    pipeline = _RecordingPipeline()
    worker = _worker(pipeline, transcription_provider="openai", ai_provider="mock")

    await worker._process_source(EVENT, None, None)  # noqa: SLF001

    assert storage.fetched == 1
    assert pipeline.calls[0]["audio"] == BYTES


# --- B. assemblyai keeps the optimization ----------------------------------- #
@pytest.mark.asyncio
async def test_assemblyai_still_gets_the_url_and_no_download_happens(storage):
    pipeline = _RecordingPipeline()
    worker = _worker(pipeline, transcription_provider="assemblyai", ai_provider="openai")

    await worker._process_source(EVENT, None, None)  # noqa: SLF001

    # The point of the URL: the recording never crossed this process.
    assert storage.fetched == 0
    call = pipeline.calls[0]
    assert call["request"].audio_url == URL
    assert call["audio"] == b""


# --- C. no URL to hand over ------------------------------------------------- #
@pytest.mark.asyncio
async def test_without_a_url_the_bytes_are_downloaded_as_before(storage):
    storage.url = None  # nothing to presign, e.g. no object storage configured
    pipeline = _RecordingPipeline()
    worker = _worker(pipeline, transcription_provider="assemblyai", ai_provider="openai")

    await worker._process_source(EVENT, None, None)  # noqa: SLF001

    assert storage.fetched == 1
    call = pipeline.calls[0]
    assert call["audio"] == BYTES
    assert call["request"].audio_url is None


# --- D. the existing URL -> upload fallback --------------------------------- #
@pytest.mark.asyncio
async def test_a_url_the_provider_cannot_reach_still_falls_back_to_upload(storage):
    # A bucket private to the right people and unreachable by the provider looks
    # identical to a working one until a job runs.
    pipeline = _RecordingPipeline(fail_first_with=AudioUnreachableError("403"))
    worker = _worker(pipeline, transcription_provider="assemblyai", ai_provider="openai")

    await worker._process_source(EVENT, None, None)  # noqa: SLF001

    assert len(pipeline.calls) == 2
    # First: the URL, no download.
    assert pipeline.calls[0]["request"].audio_url == URL
    assert pipeline.calls[0]["audio"] == b""
    # Then the bytes, with the URL dropped so the provider cannot retry it.
    assert storage.fetched == 1
    assert pipeline.calls[1]["audio"] == BYTES
    assert pipeline.calls[1]["request"].audio_url is None


@pytest.mark.asyncio
async def test_openai_has_no_url_to_fall_back_to_and_raises(storage):
    # It was already sent the bytes, so there is no second thing to try. The
    # error belongs to the caller, which retries the message.
    pipeline = _RecordingPipeline(fail_first_with=AudioUnreachableError("nope"))
    worker = _worker(pipeline, transcription_provider="auto", ai_provider="openai")

    with pytest.raises(AudioUnreachableError):
        await worker._process_source(EVENT, None, None)  # noqa: SLF001

    assert len(pipeline.calls) == 1


# --- the resolution rule the worker and the factory must agree on ----------- #
@pytest.mark.parametrize(
    ("transcription_provider", "ai_provider", "effective", "needs_bytes"),
    [
        ("auto", "openai", "openai", True),      # production
        ("auto", "mock", "mock", False),
        ("openai", "mock", "openai", True),
        ("assemblyai", "openai", "assemblyai", False),
        ("mock", "openai", "mock", False),
    ],
)
def test_the_effective_provider_decides_who_needs_bytes(
    transcription_provider, ai_provider, effective, needs_bytes
):
    from app.providers.factory import AiProviderFactory

    settings = Settings(
        transcription_provider=transcription_provider, ai_provider=ai_provider
    )

    assert AiProviderFactory.resolve_transcription_provider(settings) == effective
    assert AiProviderFactory.transcription_needs_audio_bytes(settings) is needs_bytes


def test_an_unknown_provider_is_assumed_to_need_the_bytes():
    # The safe direction. Downloading for a provider that did not need it costs
    # a transfer; skipping it for one that did costs an empty transcript that
    # nothing reports as a failure.
    from app.providers.factory import AiProviderFactory

    settings = Settings(transcription_provider="auto", ai_provider="openai")
    object.__setattr__(settings, "transcription_provider", "some-future-vendor")

    assert AiProviderFactory.transcription_needs_audio_bytes(settings) is True
