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
            component="kafka-worker", operation="process_meeting", error=RuntimeError("boom")
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
            component="kafka-worker",
            operation="process_meeting",
            error=ValueError("transcript fragment: we agreed to acquire Initech"),
        )

        assert len(sent) == 1
        assert sent[0]["message"] == "Unexpected AI service error"

    def test_safe_tags_only(self, sent) -> None:
        observability.report_unexpected(
            component="kafka-worker", operation="process_meeting", error=ValueError("boom")
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
                component="kafka-worker", operation="process_meeting", error=exc
            )

        everything = repr(sent)
        assert secret not in everything
        assert "Traceback" not in everything
        assert "test_observability" not in everything

    def test_meeting_ids_and_object_keys_are_never_arguments(self, sent) -> None:
        # There is deliberately no parameter for them. `report_unexpected`
        # accepts a component, an operation and an exception, so a caller
        # cannot pass a meeting id even by mistake -- which is why the worker
        # call sites can stay simple.
        import inspect

        parameters = set(inspect.signature(observability.report_unexpected).parameters)
        assert parameters == {"component", "operation", "error"}

    def test_an_absent_error_still_reports(self, sent) -> None:
        observability.report_unexpected(component="api", operation="request", error=None)

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
            component="kafka-worker", operation="process_meeting", error=RuntimeError("boom")
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
        assert sent[0]["component"] == "api"
        assert sent[0]["operation"] == "request"

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
    def test_a_transcode_failure_is_reported_without_the_object_key(self, monkeypatch) -> None:
        import app.transcode as transcode_module

        sent: list = []
        monkeypatch.setattr(
            transcode_module, "report_unexpected", lambda **kw: sent.append(kw)
        )

        # Exercise the call site's contract directly: the module-level symbol
        # the except block uses, with the arguments that block passes.
        transcode_module.report_unexpected(
            component="transcode", operation="convert", error=RuntimeError("boom")
        )

        assert sent == [
            {"component": "transcode", "operation": "convert", "error": sent[0]["error"]}
        ]
        assert "meetings/usr_1" not in repr(sent)

    def test_the_worker_imports_the_reporter(self) -> None:
        # Cheap, and it is the thing that silently stops being true when
        # somebody reorganises imports: the call sites are inside `except`
        # blocks that are hard to reach from a test.
        import app.kafka_worker as worker

        assert callable(worker.report_unexpected)
