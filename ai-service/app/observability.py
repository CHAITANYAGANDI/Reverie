"""Where an unexpected AI-service failure is announced, and what is withheld.

Everything this service touches is sensitive: audio, the transcript made from
it, the prompt built from that and the model output built from the prompt. That
makes exception strings more dangerous here than in most services, because the
things that fail are parsers and HTTP clients handling exactly that material --
a JSON decode error quotes the document, a provider client quotes the response
body, a ``KeyError`` names a key that came from a transcript.

So no exception object is ever handed to Sentry. ``capture_exception`` is not
used anywhere in this codebase, and neither is the logging integration: this
module logs meeting ids and exception strings through ``logger.exception`` all
over the worker, and Sentry's default ``LoggingIntegration`` would forward every
one of those as an event. Events here are constructed from a fixed vocabulary --
service, component, operation, exception type -- and nothing else.

The traceback stays in this service's own log, where Reverie controls the
infrastructure. Sentry is told that something broke and where; the log says
what.

Best effort, always. A missing DSN is the ordinary local state. A malformed one
disables monitoring rather than stopping startup. A capture failure is
swallowed, because a raise from here would escape into a Kafka handler's
``except`` block, be caught as if it were the original processing failure, and
change which outcome the message gets -- monitoring quietly altering retry
semantics.
"""

from __future__ import annotations

import logging

import sentry_sdk

from app.config import Settings

logger = logging.getLogger("ai-service.observability")

#: Which of the three Sentry projects this is.
SERVICE = "reverie-ai"

#: The fixed label. Deliberately says nothing about the failure.
MESSAGE = "Unexpected AI service error"

_enabled = False


def is_enabled() -> bool:
    """Whether anything is actually being reported."""
    return _enabled


def reset_for_tests() -> None:
    """Forget initialisation, so each test decides its own state."""
    global _enabled
    _enabled = False


def init_sentry(settings: Settings) -> bool:
    """Configure the SDK explicitly and narrowly, or stay off.

    Every option is passed rather than left to a default, because the defaults
    are chosen for products that are not holding somebody's meeting. The two
    that matter most are ``default_integrations`` and
    ``auto_enabling_integrations``: together they keep out the logging
    integration (which would forward this service's own ``logger.exception``
    calls, meeting ids and all) and the FastAPI/Starlette integrations (which
    attach request URL, query string and headers).

    :return: whether monitoring is on. Never raises; a failure here must not be
        the reason the service will not boot.
    """
    global _enabled
    _enabled = False

    dsn = (settings.sentry_dsn or "").strip()
    if not dsn:
        logger.info("SENTRY_DSN is not set; AI-service error monitoring is off.")
        return False

    try:
        sentry_sdk.init(
            dsn=dsn,
            environment=settings.reverie_env,
            # No integrations at all, automatic or otherwise. This is the whole
            # privacy boundary of the configuration.
            default_integrations=False,
            auto_enabling_integrations=False,
            integrations=[],
            # No user, no client address.
            send_default_pii=False,
            # Errors only. Tracing and profiling sample call stacks and timings
            # across the whole service, which is far wider than the one event
            # this module sends.
            traces_sample_rate=0,
            profiles_sample_rate=0,
            # A manually reported message must not acquire a synthetic stack.
            attach_stacktrace=False,
            # Nothing writes breadcrumbs; a zero ceiling means nothing can start
            # to without this being reconsidered.
            max_breadcrumbs=0,
            # Hostnames are infrastructure detail; on Render they are container
            # identifiers. Fixed, so nothing is auto-detected and sent.
            server_name=SERVICE,
        )
    except Exception:  # noqa: BLE001 - monitoring must never block startup
        # Deliberately no exception argument: a malformed DSN can appear in the
        # SDK's own error text, and this line must not be how it gets logged.
        logger.warning("Sentry could not be initialised; AI-service error monitoring is off.")
        return False

    _enabled = True
    logger.info("AI-service error monitoring is on (environment=%s).", settings.reverie_env)
    return True


def _capture(event: dict) -> None:
    """Hand the finished event to the SDK.

    Separated so the privacy-relevant part of :func:`report_unexpected` can be
    asserted without an SDK, and so a test can prove a transmission failure
    cannot escape.
    """
    with sentry_sdk.new_scope() as scope:
        for key, value in event["tags"].items():
            scope.set_tag(key, value)
        sentry_sdk.capture_message(event["message"], level="error")


def report_unexpected(
    *,
    component: str,
    operation: str,
    error: BaseException | None = None,
) -> None:
    """Announce a genuine failure, without describing it.

    The signature is the privacy design. There is no parameter for a meeting id,
    an object key, a file name or a message body, so a call site cannot pass one
    even by mistake -- which is why the worker call sites can stay one line.

    :param component: which part of the service, e.g. ``"kafka-worker"``
    :param operation: which step, e.g. ``"process_meeting"``. A fixed string
        chosen by the call site, never derived from data.
    :param error: used only for its type name. Its message, arguments and
        traceback are not read.
    """
    if not _enabled:
        return

    try:
        event = {
            "message": MESSAGE,
            "tags": {
                "service": SERVICE,
                "component": component,
                "operation": operation,
                # The class name only. A compile-time symbol, so it cannot
                # contain user data, and it is most of the triage value.
                "error_type": type(error).__name__ if error is not None else "unknown",
            },
        }
        _capture(event)
    except Exception:  # noqa: BLE001 - see the module docstring
        # Never logged either: this runs inside an `except` block that is
        # already reporting the real failure, and a second line about the
        # monitoring of it is noise in the moment somebody is reading for the
        # first one.
        pass
