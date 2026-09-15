"""When the worker is allowed to acknowledge a message, and when it is not.

The failure this replaces was silent. With `enable_auto_commit=True` the offset
advanced about five seconds after the message was handed to the loop, so a
worker that died during a twelve-minute transcription came back with the job
already acknowledged and never ran it again — the meeting sat in QUEUED with no
error, no retry and nothing in the bell.

Every test here is about the boundary that replaced it: an offset is committed
only once Spring has written down a terminal outcome, or has said in as many
words that it never will.

Nothing sleeps for a real backoff; the worker takes its own timings so the
tests can set them to zero.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import httpx
import pytest

from app.callback import Delivery, JobState
from app.kafka_worker import (
    SAFE_PROCESSING_FAILURE_MESSAGE,
    KafkaWorker,
    Outcome,
    is_retryable,
)
from app.providers.assemblyai_adapter import (
    AudioUnreachableError,
    TranscriptionConfigurationError,
)
from app.schemas import MeetingUploadedEvent
from app.storage import AudioDownloadTooLargeError


EVENT = MeetingUploadedEvent(
    meetingId="mtg_1",
    userId="usr_1",
    objectKey="meetings/usr_1/mtg_1/audio.m4a",
)


class RecordingCallback:
    """A Spring that says yes, unless told otherwise."""

    def __init__(
        self,
        *,
        result: Delivery = Delivery.ACCEPTED,
        status: Delivery = Delivery.ACCEPTED,
        state: "JobState | None" = None,
    ) -> None:
        self.result_delivery = result
        self.status_delivery = status
        self.statuses: list[str] = []
        self.messages: list[str | None] = []
        self.attempts: list[int | None] = []
        self.results = 0
        # What Spring says when asked whether the job is still worth running.
        # The default is a meeting mid-flight on run 1, which is every test
        # below that is not about the skip itself.
        self.state = state if state is not None else JobState(status="QUEUED", attempt=1)
        self.state_reads = 0

    async def job_state(self, meeting_id) -> "JobState | None":
        self.state_reads += 1
        return self.state

    async def post_result(self, meeting_id, result, *, attempt=None) -> Delivery:
        self.results += 1
        self.attempts.append(attempt)
        return self.result_delivery

    async def post_status(self, meeting_id, event, *, attempt=None) -> Delivery:
        self.statuses.append(event.status)
        self.messages.append(event.message)
        self.attempts.append(attempt)
        return self.status_delivery


def worker(callback, *, max_attempts: int = 5) -> KafkaWorker:
    return KafkaWorker(
        settings=SimpleNamespace(
            kafka_bootstrap_servers="localhost:9092",
            kafka_topic_meeting_uploaded="meeting_uploaded",
            kafka_consumer_group="ai-service",
            kafka_security_protocol="PLAINTEXT",
            kafka_max_poll_interval_ms=6_000_000,
            kafka_session_timeout_ms=45_000,
            kafka_heartbeat_interval_ms=10_000,
        ),
        pipeline=None,
        callback=callback,
        rag=None,
        max_attempts=max_attempts,
        retry_backoff_seconds=0.0,
    )


def drive(w: KafkaWorker, process, *, failures: int = 0, event=EVENT) -> Outcome:
    """Run one message through `_handle` with the pipeline stubbed out."""
    w._process_source = process  # noqa: SLF001 — the seam under test is around it
    return asyncio.run(w._handle(event, failures=failures))  # noqa: SLF001


async def _succeeds(event, progress_hook, transcript_hook):
    return SimpleNamespace(transcript="hello", segments=[])


# --------------------------------------------------------------------------- #
# Success
# --------------------------------------------------------------------------- #
def test_success_commits_only_after_the_result_is_accepted():
    cb = RecordingCallback()

    assert drive(worker(cb), _succeeds) is Outcome.COMMIT
    assert cb.results == 1
    assert "READY" in cb.statuses


def test_a_rejected_result_callback_is_not_committed():
    # Everything was computed and none of it is written down anywhere. This is
    # exactly the case auto-commit acknowledged.
    cb = RecordingCallback(result=Delivery.UNDELIVERED)

    assert drive(worker(cb), _succeeds) is Outcome.RETRY
    assert "READY" not in cb.statuses


def test_a_lost_ready_frame_does_not_hold_the_offset():
    # applyResult has already persisted the brief and flipped the meeting to
    # READY, so the terminal state exists. Redelivering the whole meeting to
    # re-send one WebSocket frame would re-run a paid transcription.
    cb = RecordingCallback(status=Delivery.UNDELIVERED)

    assert drive(worker(cb), _succeeds) is Outcome.COMMIT


def test_handle_starting_is_not_an_acknowledgement():
    # The old behaviour in one assertion: beginning work must not be enough.
    started = asyncio.Event()

    async def never_finishes(event, progress_hook, transcript_hook):
        started.set()
        raise httpx.ConnectError("provider unreachable")

    cb = RecordingCallback()
    assert drive(worker(cb), never_finishes) is Outcome.RETRY
    assert started.is_set()
    assert cb.results == 0


# --------------------------------------------------------------------------- #
# Failure
# --------------------------------------------------------------------------- #
def test_a_retryable_failure_is_left_uncommitted():
    async def transient(event, progress_hook, transcript_hook):
        raise httpx.ConnectError("connection reset")

    cb = RecordingCallback()
    assert drive(worker(cb), transient) is Outcome.RETRY
    # Nothing was reported as failed: the meeting is still going to be retried,
    # and telling the user it failed would be wrong.
    assert "FAILED" not in cb.statuses


def test_a_terminal_failure_commits_once_failed_is_accepted():
    async def refused(event, progress_hook, transcript_hook):
        raise TranscriptionConfigurationError("that parameter is not valid")

    cb = RecordingCallback()
    assert drive(worker(cb), refused) is Outcome.COMMIT
    assert cb.statuses[-1] == "FAILED"


def test_terminal_failure_does_not_expose_provider_error_text():
    sensitive_provider_text = (
        "provider response contained transcript-secret-93847 and api details"
    )

    async def refused(event, progress_hook, transcript_hook):
        raise TranscriptionConfigurationError(sensitive_provider_text)

    cb = RecordingCallback()

    assert drive(worker(cb), refused) is Outcome.COMMIT
    assert cb.statuses[-1] == "FAILED"
    assert cb.messages[-1] == SAFE_PROCESSING_FAILURE_MESSAGE
    assert sensitive_provider_text not in cb.messages[-1]


def test_a_terminal_failure_nobody_heard_is_not_committed():
    # The failure is real and unrecorded. Acknowledging here loses it the same
    # way auto-commit did.
    async def refused(event, progress_hook, transcript_hook):
        raise TranscriptionConfigurationError("that parameter is not valid")

    cb = RecordingCallback(status=Delivery.UNDELIVERED)
    assert drive(worker(cb), refused) is Outcome.RETRY


def test_audio_that_could_not_be_fetched_is_terminal():
    # It only escapes the adapter once the byte-upload fallback has been tried,
    # so there is no second path left.
    async def unreachable(event, progress_hook, transcript_hook):
        raise AudioUnreachableError("could not connect to the host")

    cb = RecordingCallback()
    assert drive(worker(cb), unreachable) is Outcome.COMMIT
    assert cb.statuses[-1] == "FAILED"


def test_retries_are_bounded_so_one_message_cannot_block_the_partition():
    # meeting_uploaded has a single partition. A message that is never
    # committed is not just stuck itself -- every later meeting queues behind
    # it, so "retry forever" is an outage.
    async def transient(event, progress_hook, transcript_hook):
        raise httpx.ConnectError("connection reset")

    cb = RecordingCallback()
    w = worker(cb, max_attempts=3)

    assert drive(w, transient, failures=0) is Outcome.RETRY
    assert drive(w, transient, failures=1) is Outcome.RETRY
    # The third failure gives up and records it, rather than holding the queue.
    assert drive(w, transient, failures=2) is Outcome.COMMIT
    assert cb.statuses[-1] == "FAILED"


# --------------------------------------------------------------------------- #
# Refusal — Spring read it and said no, and will say no again
# --------------------------------------------------------------------------- #
def test_a_refused_result_is_finished_rather_than_retried():
    # The obsolete-run case. Spring declined the result because a reprocess has
    # overtaken it, so there is no version of this message that can succeed and
    # holding the single partition open for it is an outage with no upside.
    cb = RecordingCallback(result=Delivery.REFUSED)

    assert drive(worker(cb), _succeeds) is Outcome.COMMIT
    # And it does not go on to announce a meeting it was refused.
    assert "READY" not in cb.statuses


def test_a_refused_failure_report_is_also_finished():
    async def broken(event, progress_hook, transcript_hook):
        raise TranscriptionConfigurationError("that parameter is not valid")

    cb = RecordingCallback(status=Delivery.REFUSED)
    assert drive(worker(cb), broken) is Outcome.COMMIT


# --------------------------------------------------------------------------- #
# Classification
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("code", [408, 425, 429, 500, 502, 503, 504])
def test_transient_http_statuses_are_retryable(code):
    exc = httpx.HTTPStatusError(
        "x", request=httpx.Request("POST", "http://x"), response=httpx.Response(code)
    )
    assert is_retryable(exc) is True


@pytest.mark.parametrize("code", [400, 401, 403, 404, 422])
def test_a_request_that_was_wrong_is_not_retryable(code):
    exc = httpx.HTTPStatusError(
        "x", request=httpx.Request("POST", "http://x"), response=httpx.Response(code)
    )
    assert is_retryable(exc) is False


def test_a_recording_over_the_memory_ceiling_is_not_retryable():
    # The ceiling is a fact about the object and this container, not about the
    # attempt: redelivery cannot make the recording smaller. Retrying would
    # re-download up to the ceiling, fail the same way, and hold the single
    # partition while every queued meeting waits behind it.
    assert is_retryable(AudioDownloadTooLargeError("too large")) is False


@pytest.mark.parametrize(
    "exc",
    [
        httpx.ConnectError("x"),
        httpx.ReadTimeout("x"),
        asyncio.TimeoutError(),
        ConnectionResetError(),
        OSError("broken pipe"),
    ],
)
def test_infrastructure_failures_are_retryable(exc):
    assert is_retryable(exc) is True


def test_an_unrecognised_failure_is_retryable_by_default():
    # A blip is far more likely than a permanently poisoned recording, and the
    # attempt bound is what stops the default being dangerous.
    assert is_retryable(ValueError("something odd")) is True


def test_a_refused_request_is_never_retried():
    assert is_retryable(TranscriptionConfigurationError("bad parameter")) is False


# --------------------------------------------------------------------------- #
# A redelivery must not cost a second transcription
#
# Delivery is at-least-once by design, and the provider bills per run. Before
# this guard a redelivered job was re-transcribed in full: one 42-minute upload
# was submitted to AssemblyAI three times (07:25, 07:29, 07:39) because the
# consumer kept being evicted mid-run, and the meeting's status walked backwards
# from EXTRACTING to TRANSCRIBING while somebody watched it.
#
# `_handle` now asks Spring what state the meeting is in before it spends
# anything. `_never_runs` is the assertion that carries these: if the pipeline
# is entered at all, the money is already gone.
# --------------------------------------------------------------------------- #
async def _never_runs(event, progress_hook, transcript_hook):
    raise AssertionError("the pipeline ran for a job that was already settled")


@pytest.mark.parametrize("status", ["READY", "FAILED"])
def test_a_redelivery_of_a_finished_run_is_skipped_not_re_transcribed(status):
    cb = RecordingCallback(state=JobState(status=status, attempt=1))

    assert drive(worker(cb), _never_runs) is Outcome.COMMIT
    assert cb.results == 0
    # Not reported either. The run already said its piece; a second READY frame
    # over a FAILED meeting would be worse than silence.
    assert cb.statuses == []


def test_a_meeting_that_was_deleted_is_not_transcribed():
    # What Stop leaves behind. The worker used to transcribe the whole recording
    # and only then discover, in applyResult, that there was nothing to write it
    # to -- a full bill for a meeting the user had cancelled.
    cb = RecordingCallback(state=JobState(status="", attempt=0, missing=True))

    assert drive(worker(cb), _never_runs) is Outcome.COMMIT
    assert cb.results == 0


def test_a_run_a_reprocess_has_replaced_is_skipped():
    # The reprocess enqueued its own message; finishing this one would produce a
    # result applyResult is going to refuse anyway.
    cb = RecordingCallback(state=JobState(status="TRANSCRIBING", attempt=4))

    assert drive(worker(cb), _never_runs) is Outcome.COMMIT


def test_a_reprocess_is_processed_rather_than_skipped():
    """A reprocess of a meeting that has already been READY once.

    `MeetingService.reprocess` moves the status to QUEUED and bumps the attempt
    in one transaction, and the outbox publishes after that commits -- so the
    row this reads says (QUEUED, 2), never (READY, 2). It has to be processed:
    skipping it would leave the meeting on its old transcript with a QUEUED
    badge and nobody coming back for it, having charged the user for the run.
    """
    cb = RecordingCallback(state=JobState(status="QUEUED", attempt=2))
    event = MeetingUploadedEvent(
        meetingId="mtg_1", userId="usr_1",
        objectKey="meetings/usr_1/mtg_1/audio.m4a",
        processingAttempt=2,
    )

    assert drive(worker(cb), _succeeds, event=event) is Outcome.COMMIT
    assert cb.results == 1


def test_terminal_is_judged_per_run_and_not_by_status_alone():
    """Why `pointless_for` takes the run at all.

    READY on the row is only a reason to stop if it is *this* run's READY. A
    guard written as "status is terminal, skip" would read the previous run's
    result and refuse to do the new one -- so this pins the pairing rather than
    the status.
    """
    # Same status, opposite answers, and the run is the only difference.
    assert JobState(status="READY", attempt=1).pointless_for(1) is not None
    assert JobState(status="READY", attempt=1).pointless_for(2) is None


def test_an_unreachable_spring_processes_the_meeting_anyway():
    """Fails open, and the direction is the whole point.

    A meeting billed twice is a cost. A meeting never processed is a bug that
    leaves somebody's recording in QUEUED for ever with nothing coming back for
    it -- which is the exact failure the hand-committed offset was introduced to
    eliminate, and it must not be reintroduced by an optimisation.
    """
    cb = RecordingCallback(state=None)
    cb.state = None  # what job_state returns when Spring cannot be reached

    assert drive(worker(cb), _succeeds) is Outcome.COMMIT
    assert cb.results == 1


def test_the_state_is_read_once_per_delivery():
    cb = RecordingCallback()

    drive(worker(cb), _succeeds)

    assert cb.state_reads == 1


# --- provider errors that are not httpx ------------------------------------- #
#
# The OpenAI SDK does not raise `httpx.HTTPStatusError`. Its errors carry the
# same information under `status_code` on an exception class of its own, so a
# classifier that only understands httpx read a deterministic 400 as "unknown"
# and fell through to the retryable default.
#
# That is how a meeting whose request Whisper had already refused was redelivered
# until the attempt bound gave up, instead of being reported FAILED the first
# time. Modelled rather than imported: the contract being relied on is the
# attribute, not the vendor's class, and depending on the class would make this
# test a test of the SDK.
class _OpenAiStyleError(Exception):
    """An SDK error that exposes a real HTTP status without being an httpx one."""

    def __init__(self, status_code: int) -> None:
        super().__init__(f"provider returned {status_code}")
        self.status_code = status_code


@pytest.mark.parametrize("code", [400, 401, 403, 404, 422])
def test_a_provider_request_that_was_wrong_is_not_retryable(code):
    # Whisper will refuse the identical bytes identically. Redelivering costs
    # the queue head and changes nothing.
    assert is_retryable(_OpenAiStyleError(code)) is False


@pytest.mark.parametrize("code", [408, 425, 429, 500, 502, 503, 504])
def test_transient_provider_statuses_are_retryable(code):
    assert is_retryable(_OpenAiStyleError(code)) is True


def test_a_provider_error_without_a_status_keeps_the_retryable_default():
    # Connection resets and SDK wrappers that never reached the server have no
    # status to read, and the default is the safe one.
    class _NoStatus(Exception):
        pass

    assert is_retryable(_NoStatus("connection reset")) is True


def test_a_non_integer_status_is_not_trusted_as_a_classification():
    # Mocks and older SDK versions have been seen carrying a string or a
    # property object here. Guessing from it would be worse than the default.
    exc = _OpenAiStyleError(400)
    exc.status_code = "400"  # type: ignore[assignment]

    assert is_retryable(exc) is True


def test_a_provider_refusal_is_reported_failed_on_the_first_attempt():
    # The whole point of the classification. A meeting Whisper has refused is
    # finished: it is reported FAILED, the offset is committed, and the queue
    # head moves on. Previously this was redelivered until the attempt bound
    # gave up, and the user watched it sit in QUEUED for five rounds.
    async def refused(event, progress_hook, transcript_hook):
        raise _OpenAiStyleError(400)

    cb = RecordingCallback()
    assert drive(worker(cb), refused) is Outcome.COMMIT
    assert cb.statuses[-1] == "FAILED"


def test_a_transient_provider_failure_is_still_left_for_redelivery():
    # 503 is the opposite case and must keep the old behaviour: nothing is
    # reported, because the meeting has not failed yet.
    async def overloaded(event, progress_hook, transcript_hook):
        raise _OpenAiStyleError(503)

    cb = RecordingCallback()
    assert drive(worker(cb), overloaded) is Outcome.RETRY
    assert "FAILED" not in cb.statuses


def test_a_transient_provider_failure_still_ends_after_the_attempt_bound():
    # And it does not retry forever. The bound is unchanged; this only pins
    # that raising from transcription did not escape it.
    async def overloaded(event, progress_hook, transcript_hook):
        raise _OpenAiStyleError(503)

    cb = RecordingCallback()
    outcome = drive(worker(cb, max_attempts=3), overloaded, failures=2)

    assert outcome is Outcome.COMMIT
    assert cb.statuses[-1] == "FAILED"


@pytest.mark.parametrize(
    "code", [400, 401, 403, 404, 408, 422, 425, 429, 500, 502, 503, 504]
)
def test_both_retry_layers_agree_about_what_a_status_means(code):
    """The in-process retry and the redelivery decision must not disagree.

    They are separate functions in separate modules by necessity -- the worker
    does not import the OpenAI SDK and the adapter knows nothing about Kafka --
    and a status one gives up on immediately while the other retries would send
    the same doomed request five more times.
    """
    from app.providers.openai_adapter import _is_retryable_provider_error

    exc = _OpenAiStyleError(code)

    assert is_retryable(exc) is _is_retryable_provider_error(exc)
