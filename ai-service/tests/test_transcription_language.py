"""The language a meeting is transcribed in.

Detection is the default and it is good. It is also wrong on exactly the
recordings people complain about — a two-minute voice note, a noisy first
minute, a standup held half in one language — and a wrong detection is not a
cosmetic label. The provider returns words in a language nobody spoke, the
summary is written in it, and nothing downstream repairs any of that.

So an account can say once what its meetings are in. These tests cover the three
places that setting can be silently dropped: the precedence rule where it meets
the deployment-wide default, the walk from the Kafka event through the pipeline
to the provider, and the adapter that finally puts it in the request. Every one
of those failures is quiet — in the first two the transcript still arrives, just
in the wrong language, and in the third it arrives empty.
"""

from __future__ import annotations

import pytest

from app.config import Settings
from app.pipeline import Pipeline
from app.providers.assemblyai_adapter import language_choice
from app.providers.mock_adapter import MockLlmAdapter
from app.providers.openai_adapter import OpenAiTranscriptionAdapter
from app.schemas import MeetingUploadedEvent, TranscriptResponse


# --- the precedence rule ---------------------------------------------------- #
def test_no_setting_anywhere_means_detect():
    # None rather than "", because the adapter branches on it to choose between
    # `language_code` and `language_detection`.
    assert language_choice(None, "") is None
    assert language_choice("", None) is None


def test_the_deployment_default_applies_when_the_account_says_nothing():
    assert language_choice(None, "es") == "es"


def test_the_account_setting_beats_the_deployment_default():
    # The env var is what this Reverie defaults to; the account setting is
    # somebody saying they know better about their own meetings.
    assert language_choice("ja", "es") == "ja"


def test_whitespace_is_not_a_choice():
    # A blank field on the settings page must read as "detect", not as a
    # language code made of spaces that the provider would reject.
    assert language_choice("   ", "es") == "es"
    assert language_choice("  ", "  ") is None


# --- the walk from the event to the provider -------------------------------- #
class _RecordingTranscriber:
    """Records what it was asked for, so the argument cannot go missing quietly."""

    def __init__(self) -> None:
        self.language: str | None = "not called"

    async def transcribe(self, audio, filename, language=None, **_):
        self.language = language
        return TranscriptResponse(transcript="Acordamos usar S3.", language="es", segments=[])


@pytest.mark.asyncio
async def test_the_pipeline_hands_the_language_to_the_provider():
    transcriber = _RecordingTranscriber()
    pipeline = Pipeline(transcriber, MockLlmAdapter())

    await pipeline.process("mtg_1", b"audio", "call.wav", None, None, None, "es")

    assert transcriber.language == "es"


@pytest.mark.asyncio
async def test_no_language_reaches_the_provider_as_none():
    transcriber = _RecordingTranscriber()
    pipeline = Pipeline(transcriber, MockLlmAdapter())

    await pipeline.process("mtg_1", b"audio", "call.wav")

    # Which the adapter reads as detect — the behaviour every job had before
    # the setting existed.
    assert transcriber.language is None


# --- the event ------------------------------------------------------------- #
def test_an_event_without_a_language_still_validates():
    # Events published before this field existed are still in the topic, and a
    # required field here would fail every one of them.
    event = MeetingUploadedEvent(meetingId="mtg_1", userId="usr_1")

    assert event.language is None


def test_the_event_carries_the_code_spring_resolved():
    event = MeetingUploadedEvent(meetingId="mtg_1", userId="usr_1", language="de")

    assert event.language == "de"


# --- the adapter that actually sends it ------------------------------------- #
#
# A third place the setting was silently dropped, and the one that reached
# production: `OpenAiTranscriptionAdapter.transcribe` assigned the provider's
# detected language back onto the `language` argument it had been given. That
# assignment made the name local to the nested `_op` for the whole function, so
# reading it to build the request -- which happens first -- raised
# UnboundLocalError every time.
#
# It failed quietly, which is why these tests assert on the client rather than
# on the return value alone. `_with_retries` caught the error, retried three
# times and returned its fallback, so the caller got a well-formed
# TranscriptResponse with an empty transcript and `language="en"`. The fallback
# is the reason the provider below answers "es": a test that expected "en" would
# have passed against the broken adapter.
class _TranscriptionRecorder:
    """Stands in for `client.audio.transcriptions`, recording each request.

    Self-referencing the way `_Recorder` in test_model_routing does, because the
    SDK path the adapter calls is `client.audio.transcriptions.create`.
    """

    def __init__(self, detected: str = "es") -> None:
        self.requests: list[dict] = []
        self._detected = detected
        self.audio = self
        self.transcriptions = self

    async def create(self, **kwargs):
        self.requests.append(kwargs)

        class _Segment:
            start, end, text = 0.0, 1.5, "Acordamos usar S3."

        class _Resp:
            text = "Acordamos usar S3."
            language = self._detected
            segments = [_Segment()]

        return _Resp()


def _transcriber(recorder: _TranscriptionRecorder) -> OpenAiTranscriptionAdapter:
    return OpenAiTranscriptionAdapter(
        Settings(openai_transcribe_model="whisper-1", openai_max_retries=2),
        client=recorder,
    )


@pytest.mark.asyncio
async def test_detecting_the_language_still_reaches_the_provider():
    recorder = _TranscriptionRecorder()

    result = await _transcriber(recorder).transcribe(b"audio", "call.wav", language=None)

    # The request was actually made. Against the broken adapter this list was
    # empty: all three attempts died before the call.
    assert len(recorder.requests) == 1
    # Absent, not empty -- Whisper detects when the field is missing.
    assert "language" not in recorder.requests[0]
    # The provider's answer, not the retry fallback.
    assert result.language == "es"
    assert result.transcript == "Acordamos usar S3."


@pytest.mark.asyncio
async def test_an_explicit_language_is_sent_and_the_detected_one_returned():
    recorder = _TranscriptionRecorder()

    result = await _transcriber(recorder).transcribe(b"audio", "call.wav", language="en")

    assert len(recorder.requests) == 1
    # The argument survives to the request...
    assert recorder.requests[0]["language"] == "en"
    # ...and what comes back is still the provider's, which is what collapsing
    # the two onto one name destroyed. They disagree here on purpose.
    assert result.language == "es"


@pytest.mark.asyncio
async def test_a_blank_language_is_detection_rather_than_a_code_of_spaces():
    recorder = _TranscriptionRecorder()

    result = await _transcriber(recorder).transcribe(b"audio", "call.wav", language="   ")

    assert len(recorder.requests) == 1
    assert "language" not in recorder.requests[0]
    assert result.language == "es"
