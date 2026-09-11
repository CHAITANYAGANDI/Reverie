"""Refuses to serve production while still wearing development clothes.

The Spring side has had this for a while, and the asymmetry was the problem:
`DeploymentCheck` would not let the backend start in production without Clerk
configuration, a real internal token and a direct database endpoint, while the
AI service next to it would start happily with `AI_PROVIDER=mock`, a Kafka
broker on localhost and the internal token published in this repository.

That asymmetry is worse than it looks, because the AI service degrades quietly.
A mock provider returns plausible summaries. A localhost Kafka broker is
retried in the background by a worker built never to crash on a broker outage.
A callback URL pointing at localhost fails per-meeting, long after deploy. None
of them stop the service answering `/health` with `200`, so a deployment that
is wrong in any of these ways looks exactly like one that is right — until
somebody reads a summary the model never wrote.

So the mode declares itself. Under `REVERIE_ENV=production` the values that can
only be development mistakes are refused at startup, before a request is
served. Everything else keeps the local defaults that make `docker compose up`
work with no configuration at all, which is the reason those defaults exist.

Problems are collected and reported together rather than raised one at a time:
fixing a deploy one restart per missing variable is how an afternoon goes.

Nothing here prints a value. The checks say which variable is wrong and why,
never what it currently contains -- these are secrets, and a startup log is not
a private place.
"""

from __future__ import annotations

import logging

from app.config import Settings

logger = logging.getLogger("ai-service.deployment-check")

#: The internal token this repository ships. Public, therefore not a secret.
PUBLISHED_DEV_TOKEN = "dev-internal-token"

#: Hosts that cannot be right when two services are deployed separately.
_LOCAL_HOSTS = ("localhost", "127.0.0.1", "0.0.0.0", "::1")


def _is_local(value: str) -> bool:
    lowered = (value or "").lower()
    return any(host in lowered for host in _LOCAL_HOSTS)


def production_problems(settings: Settings) -> list[str]:
    """Everything wrong with this configuration for a production deployment.

    Returned rather than raised so the caller decides what a problem means, and
    so the whole list can be tested without catching anything.
    """
    problems: list[str] = []

    # --- Identity between the two services --------------------------------- #
    token = (settings.reverie_internal_token or "").strip()
    if not token:
        problems.append(
            "REVERIE_INTERNAL_TOKEN is not set. The /ai routes refuse every "
            "request without it, so the backend cannot reach this service."
        )
    elif token == PUBLISHED_DEV_TOKEN:
        problems.append(
            "REVERIE_INTERNAL_TOKEN is the development value published in this "
            "repository. Anyone who can reach this service knows it."
        )

    # --- The provider, which is the one that fails silently ----------------- #
    if settings.ai_provider == "mock":
        problems.append(
            "AI_PROVIDER is 'mock'. The mock adapter returns invented summaries "
            "and invented answers, and nothing downstream can tell them from "
            "real ones."
        )
    if settings.ai_provider == "openai" and not (settings.openai_api_key or "").strip():
        problems.append("AI_PROVIDER is 'openai' but OPENAI_API_KEY is not set.")

    if settings.transcription_provider == "mock":
        problems.append(
            "TRANSCRIPTION_PROVIDER is 'mock'. Every meeting would be "
            "transcribed into fixture text."
        )
    if settings.transcription_provider == "assemblyai" and not (
        settings.assemblyai_api_key or ""
    ).strip():
        problems.append(
            "TRANSCRIPTION_PROVIDER is 'assemblyai' but ASSEMBLYAI_API_KEY is not set."
        )
    if settings.transcription_provider == "auto" and not (
        (settings.assemblyai_api_key or "").strip()
        or (settings.openai_api_key or "").strip()
    ):
        # 'auto' picks whichever key exists, so no keys means it picks the mock.
        problems.append(
            "TRANSCRIPTION_PROVIDER is 'auto' and neither ASSEMBLYAI_API_KEY nor "
            "OPENAI_API_KEY is set, which leaves it nothing real to choose."
        )

    # --- The things that are only wrong once this is not one machine -------- #
    if _is_local(settings.kafka_bootstrap_servers):
        problems.append(
            "KAFKA_BOOTSTRAP_SERVERS points at localhost. The worker retries a "
            "broker outage forever in the background, so this fails as a queue "
            "that is always empty rather than as an error."
        )
    if settings.kafka_security_protocol.upper() == "PLAINTEXT":
        problems.append(
            "KAFKA_SECURITY_PROTOCOL is PLAINTEXT. A managed broker reached over "
            "the internet needs SASL_SSL."
        )
    if _is_local(settings.spring_callback_url):
        problems.append(
            "SPRING_CALLBACK_URL points at localhost. Transcription would run and "
            "then have nowhere to deliver the result."
        )

    # --- Retrieval and storage ---------------------------------------------- #
    if not (settings.pg_host or "").strip():
        problems.append(
            "PG_HOST is not set, which disables RAG entirely: chat and semantic "
            "search answer from nothing."
        )
    elif settings.pg_sslmode.lower() not in ("require", "verify-ca", "verify-full"):
        problems.append(
            "PG_SSLMODE is '" + settings.pg_sslmode + "'. A managed database "
            "reached over the internet needs 'require' or stricter; 'prefer' "
            "silently accepts an unencrypted connection."
        )

    if not (settings.s3_endpoint or "").strip():
        problems.append("S3_ENDPOINT is not set, so no meeting audio can be read.")
    if not (settings.s3_access_key or "").strip() or not (settings.s3_secret_key or "").strip():
        problems.append("S3_ACCESS_KEY / S3_SECRET_KEY are not both set.")

    return problems


def verify_production(settings: Settings) -> None:
    """Stop the process if this is production and the configuration is not.

    A failed deploy is a far better outcome than a running service that is
    quietly not doing its job -- the whole point of the checks above is that
    every one of them is invisible from outside.
    """
    if (settings.reverie_env or "").strip().lower() != "production":
        return

    problems = production_problems(settings)
    if not problems:
        logger.info("Production configuration checks passed.")
        return

    listed = "\n  - ".join(problems)
    raise RuntimeError(
        "REVERIE_ENV is 'production' but this deployment is still configured "
        f"for development:\n  - {listed}"
    )
