"""What the AI service is willing to tell an external observability provider.

Everything this service touches is sensitive: audio, transcripts, the prompts
built from them and the model output built from those. Exception strings here
are worse than in most services, because the things that fail are parsers and
HTTP clients handling exactly that material -- a JSON decode error quotes the
document, a provider client quotes the response body, a `KeyError` names a key
that came from a transcript.

So no exception object is ever handed to Sentry. Events are constructed from a
fixed vocabulary: a generic message, the service, the component, the operation
and the exception's type name. These tests are the enforcement of that.
"""

from __future__ import annotations

import asyncio
import logging

import pytest

from app import observability
from app.config import Settings


@pytest.fixture(autouse=True)
def _reset_between_tests():
    """Each test decides for itself whether monitoring is on."""
    observability.reset_for_tests()
    yield
    observability.reset_for_tests()


def settings(**overrides) -> Settings:
    base = dict(sentry_dsn=None, reverie_env="development")
    base.update(overrides)
    return Settings(**base)


class TestWithoutADsn:
    def test_missing_dsn_leaves_monitoring_off(self) -> None:
        # The ordinary state of every local checkout, every test run and any
        # deployment that has not configured monitoring. It must cost nothing.
        assert observability.init_sentry(settings()) is False
        assert observability.is_enabled() is False

    def test_blank_dsn_is_treated_as_missing(self) -> None:
        # A Render variable that exists but was never filled in is "off", not a
        # half-initialised SDK.
        assert observability.init_sentry(settings(sentry_dsn="   ")) is False

    def test_reporting_without_a_dsn_is_a_silent_no_op(self) -> None:
        observability.init_sentry(settings())

        # Must not raise and must not attempt to reach anything.
        observability.report_unexpected(
            site=observability.FailureSite.KAFKA_PROCESS_MEETING,
            error=RuntimeError("boom"),
        )

    def test_a_malformed_dsn_does_not_stop_startup(self) -> None:
        # Observability is best effort in both directions: it must not report,
        # and it must not be the reason the service will not boot.
        assert observability.init_sentry(settings(sentry_dsn="not-a-dsn")) is False
        assert observability.is_enabled() is False


class TestInitialisationIsNarrow:
    def test_every_automatic_collector_is_disabled(self, monkeypatch) -> None:
        """The configuration is the privacy boundary, so it is asserted.

        The Python SDK's defaults are the problem this test guards. Left alone
        it installs a LoggingIntegration that forwards every `logger.error` and
        `logger.exception` as an event -- and this codebase logs meeting ids and
        exception strings through exactly those calls -- plus FastAPI/Starlette
        integrations that attach request URL, query string and headers.
        """
        captured: dict = {}

        def fake_init(**kwargs):
            captured.update(kwargs)

        monkeypatch.setattr(observability.sentry_sdk, "init", fake_init)
        observability.init_sentry(settings(sentry_dsn="https://public@example.ingest.sentry.io/1"))

        # No integration is installed, automatically or otherwise. This single
        # pair of flags is what keeps logging, FastAPI, Starlette, asyncio and
        # stdlib instrumentation out.
        assert captured["default_integrations"] is False
        assert captured["auto_enabling_integrations"] is False
        assert captured["integrations"] == []

        assert captured["send_default_pii"] is False
        assert captured["traces_sample_rate"] == 0
        assert captured["profiles_sample_rate"] == 0
        assert captured["attach_stacktrace"] is False
        assert captured["max_breadcrumbs"] == 0
        # Hostnames are infrastructure detail; on Render they are container ids.
        assert captured["server_name"] == "reverie-ai"
        assert captured["environment"] == "development"

    def test_the_dsn_is_never_logged(self, monkeypatch, caplog) -> None:
        dsn = "https://publickey@o123.ingest.sentry.io/456"
        monkeypatch.setattr(observability.sentry_sdk, "init", lambda **_: None)

        with caplog.at_level(logging.DEBUG):
            observability.init_sentry(settings(sentry_dsn=dsn))

        assert dsn not in caplog.text
        assert "publickey" not in caplog.text


class TestWhatIsReported:
    @pytest.fixture
    def sent(self, monkeypatch):
        calls: list = []
        monkeypatch.setattr(observability.sentry_sdk, "init", lambda **_: None)
        observability.init_sentry(settings(sentry_dsn="https://public@example.ingest.sentry.io/1"))

        def fake_capture(message, level=None, scope=None, **kwargs):
            calls.append({"message": message, "level": level, "kwargs": kwargs})

        monkeypatch.setattr(observability, "_capture", lambda event: calls.append(event))
        return calls

    def test_the_message_is_generic(self, sent) -> None:
        observability.report_unexpected(
            site=observability.FailureSite.KAFKA_PROCESS_MEETING,
            error=ValueError("transcript fragment: we agreed to acquire Initech"),
        )

        assert len(sent) == 1
        assert sent[0]["message"] == "Unexpected AI service error"

    def test_safe_tags_only(self, sent) -> None:
        observability.report_unexpected(
            site=observability.FailureSite.KAFKA_PROCESS_MEETING, error=ValueError("boom")
        )

        assert sent[0]["tags"] == {
            "service": "reverie-ai",
            "component": "kafka-worker",
            "operation": "process_meeting",
            "error_type": "ValueError",
        }

    def test_no_exception_string_or_traceback_escapes(self, sent) -> None:
        secret = "we agreed to acquire Initech"
        try:
            raise KeyError(f"missing speaker in transcript: {secret}")
        except KeyError as exc:
            observability.report_unexpected(
                site=observability.FailureSite.KAFKA_PROCESS_MEETING, error=exc
            )

        everything = repr(sent)
        assert secret not in everything
        assert "Traceback" not in everything
        assert "test_observability" not in everything

    def test_the_only_way_to_name_a_site_is_the_enum(self, sent) -> None:
        """The signature is the boundary.

        It used to take `component` and `operation` as free strings, with a
        comment claiming a meeting id could not be passed by mistake. That was
        false: `operation=meeting_id` would have tagged the event with it. The
        parameters are now the whole guarantee, so they are asserted.
        """
        import inspect

        parameters = set(inspect.signature(observability.report_unexpected).parameters)
        assert parameters == {"site", "error"}

    def test_an_arbitrary_string_is_not_reported(self, sent) -> None:
        # Fail closed. A type hint is checked by a linter, not by the
        # interpreter, so the runtime guard is what actually stops a caller who
        # ignores the annotation -- or a refactor that passes a string through.
        observability.report_unexpected(
            site="meeting_123",  # type: ignore[arg-type]
            error=RuntimeError("boom"),
        )

        assert sent == []

    def test_a_site_shaped_impostor_is_not_reported(self, sent) -> None:
        # Duck typing is not membership. Something that merely has `.component`
        # and `.operation` is exactly how a meeting id would get smuggled in
        # if the check were `hasattr` rather than `isinstance`.
        class Impostor:
            component = "kafka-worker"
            operation = "mtg_private_789"

        observability.report_unexpected(site=Impostor(), error=RuntimeError("boom"))  # type: ignore[arg-type]

        assert sent == []

    def test_every_site_carries_only_fixed_strings(self, sent) -> None:
        # The complete vocabulary, enumerated. A new member is a deliberate,
        # reviewable edit; this makes the current set visible in the test too.
        assert {(s.component, s.operation) for s in observability.FailureSite} == {
            ("api", "request"),
            ("kafka-worker", "handle_message"),
            ("kafka-worker", "process_meeting"),
            ("transcode", "convert"),
        }

    def test_an_absent_error_still_reports(self, sent) -> None:
        observability.report_unexpected(
            site=observability.FailureSite.API_REQUEST, error=None
        )

        assert sent[0]["tags"]["error_type"] == "unknown"


class TestBestEffort:
    def test_a_capture_failure_never_reaches_the_caller(self, monkeypatch) -> None:
        """The worker must not change behaviour because monitoring broke.

        A raise here would escape into a Kafka handler's `except` block, be
        caught as if it were the original processing failure, and alter which
        outcome the message gets -- monitoring silently changing retry
        semantics.
        """
        monkeypatch.setattr(observability.sentry_sdk, "init", lambda **_: None)
        observability.init_sentry(settings(sentry_dsn="https://public@example.ingest.sentry.io/1"))

        def explode(_event):
            raise RuntimeError("Sentry unreachable")

        monkeypatch.setattr(observability, "_capture", explode)

        observability.report_unexpected(
            site=observability.FailureSite.KAFKA_PROCESS_MEETING,
            error=RuntimeError("boom"),
        )

    def test_an_init_failure_never_reaches_the_caller(self, monkeypatch) -> None:
        def explode(**_kwargs):
            raise RuntimeError("SDK refused")

        monkeypatch.setattr(observability.sentry_sdk, "init", explode)

        assert observability.init_sentry(settings(sentry_dsn="https://public@x.sentry.io/1")) is False


class TestApiReporting:
    """Genuine server faults are reported; callers' mistakes are not."""

    def test_an_unexpected_api_failure_is_reported_and_answers_500(self, monkeypatch) -> None:
        from fastapi.testclient import TestClient

        from app.config import Settings as _S
        from app.main import app

        sent: list = []
        monkeypatch.setattr(
            observability, "report_unexpected", lambda **kw: sent.append(kw)
        )
        # main.py imported the symbol directly, so patch it where it is used.
        import app.main as main_module

        monkeypatch.setattr(main_module, "report_unexpected", lambda **kw: sent.append(kw))

        @app.get("/__boom__")
        async def boom():  # pragma: no cover - raises by design
            raise RuntimeError("transcript fragment: we agreed to acquire Initech")

        with TestClient(app, raise_server_exceptions=False) as client:
            client.headers.update({"X-Internal-Token": _S().reverie_internal_token})
            response = client.get("/__boom__")

        assert response.status_code == 500
        # The client is told nothing about the failure.
        assert "Initech" not in response.text

        assert len(sent) == 1
        assert sent[0]["site"] is observability.FailureSite.API_REQUEST

    def test_a_refused_request_is_not_reported(self, monkeypatch) -> None:
        """401 from the internal-token guard is a caller's problem, not a fault."""
        from fastapi.testclient import TestClient

        from app.main import app

        sent: list = []
        import app.main as main_module

        monkeypatch.setattr(main_module, "report_unexpected", lambda **kw: sent.append(kw))

        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/ai/templates")  # no internal token

        assert response.status_code == 401
        assert sent == []


class TestWorkerReporting:
    """These drive the real `except` blocks, not the reporter in isolation.

    The first version of these tests monkeypatched the reporter and then called
    it directly, which proved only that a function can be called with
    arguments. It would have passed just as happily if the production `except`
    block had never mentioned the reporter at all.
    """

    async def test_a_transcode_crash_reports_the_real_failure_path(self, monkeypatch) -> None:
        import app.transcode as transcode_module
        from app.transcode import FAILED, Mp3Transcoder

        sent: list = []
        monkeypatch.setattr(
            transcode_module, "report_unexpected", lambda **kw: sent.append(kw)
        )

        secret_key = "meetings/usr_1/mtg_private_789/standup.m4a"
        boom = RuntimeError("boto3 exploded while reading the recording")

        def convert(source: str, target: str) -> None:
            # The dependency that fails, so the real `_run` except block runs.
            # No ffmpeg, no network, no bucket.
            raise boom

        service = Mp3Transcoder(
            transcode_module.Settings(), convert=convert, exists=lambda key: False
        )

        state = await service.ensure(secret_key, secret_key + ".mp3")
        assert state.status == transcode_module.RUNNING
        # Await the conversion task itself. This used to spin on twenty
        # `sleep(0)` ticks, which is not a synchronisation primitive: the
        # failure arrives through `to_thread`, so it is a worker thread and a
        # `call_soon_threadsafe` that have to finish, and no fixed number of
        # event-loop ticks is guaranteed to outlast them. It failed about half
        # the time on this machine.
        await asyncio.gather(*tuple(service._tasks))

        # Reported once, from the real failure, naming the site by enum.
        assert len(sent) == 1
        assert sent[0]["site"] is observability.FailureSite.TRANSCODE_CONVERT
        # The exception object reaches the reporter -- which reads only its
        # type -- and nothing else does.
        assert sent[0]["error"] is boom
        assert set(sent[0]) == {"site", "error"}

        # The object key is the name of somebody's recording. It is in the log
        # and it is not in what was handed to observability.
        assert "mtg_private_789" not in repr(sent[0]["site"])

        # And the existing behaviour is untouched: the failure is remembered
        # once, reported to the caller, and the guard is released.
        reported = await service.ensure(secret_key, secret_key + ".mp3")
        assert reported.status == FAILED

    def test_a_meeting_processing_failure_reports_the_real_failure_path(
        self, monkeypatch
    ) -> None:
        """Driven through `_handle`, the method the production seam lives in."""
        import app.kafka_worker as worker_module

        sent: list = []
        monkeypatch.setattr(
            worker_module, "report_unexpected", lambda **kw: sent.append(kw)
        )

        from tests.test_kafka_commit import RecordingCallback, drive, worker

        # Deliberately non-retryable. A retryable failure returns RETRY higher
        # up and never reaches the reporting seam -- which is correct, and is
        # why the first draft of this test passed nothing to assert on.
        from app.providers.assemblyai_adapter import TranscriptionConfigurationError

        boom = TranscriptionConfigurationError(
            "that parameter is not valid for mtg_private_789"
        )

        async def explodes(event, progress_hook, transcript_hook):
            raise boom

        outcome = drive(worker(RecordingCallback()), explodes)

        assert len(sent) == 1
        assert sent[0]["site"] is observability.FailureSite.KAFKA_PROCESS_MEETING
        assert sent[0]["error"] is boom
        # Retry semantics are the worker's, not observability's. A
        # non-retryable failure is still committed rather than redelivered.
        assert outcome is worker_module.Outcome.COMMIT
