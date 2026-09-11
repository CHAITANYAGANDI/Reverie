"""Shared pytest fixtures. Forces mock provider; no network required."""

from __future__ import annotations

import os

os.environ.setdefault("AI_PROVIDER", "mock")
# Point Kafka at an unroutable broker; the worker retries in the background and
# never blocks the app, so tests run fully offline.
os.environ.setdefault("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")

import pytest
from fastapi.testclient import TestClient

from app.main import app


def rag_settings(**overrides):
    """Real `Settings`, with the RAG knobs a retrieval test wants to move.

    The stubs these replaced were hand-written classes carrying the two or three
    attributes their test happened to read, so adding a setting to config.py
    broke them all with an AttributeError from inside the code under test. This
    also means a test asserting on a default is asserting on the shipped
    default, which is the only version of that assertion worth having.
    """
    from app.config import Settings

    return Settings(**overrides)


@pytest.fixture(scope="session")
def client() -> TestClient:
    """The app as Spring reaches it: authenticated to the internal router.

    Every `/ai/*` route now requires the shared internal token, so a client
    without it exercises the 401 path rather than the endpoint. Setting the
    header here rather than overriding the dependency keeps the guard itself in
    the path for every test -- an override would switch off the thing most
    likely to break the whole surface at once.

    `tests/test_service_auth.py` deliberately builds its own client without
    this, which is where refusal is asserted.
    """
    from app.config import Settings

    # The context manager runs startup/shutdown (lifespan) once for the session.
    with TestClient(app) as c:
        c.headers.update({"X-Internal-Token": Settings().reverie_internal_token})
        yield c
