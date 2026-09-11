"""Who may call the AI service.

The `/ai/*` routes are internal: Spring calls them and browsers never do. Before
this the only thing enforcing that was Render's private network, which is a
deployment fact rather than an application one -- true until a service
definition changes, until another component inside the network is talked into
making the request, or until someone maps the port in `docker compose`.

These routes take `user_id` from the caller and use it as the tenant. RLS still
means a caller cannot read another tenant's rows, and that is tested elsewhere
and unaffected by any of this. What service auth adds is that an unauthenticated
caller cannot spend OpenAI and AssemblyAI credit, or index text into a tenant it
merely named.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app

TOKEN = Settings().reverie_internal_token

# A route that needs no provider and no database, so what is under test is the
# guard rather than whatever the endpoint would go on to do.
GUARDED = "/ai/templates"


@pytest.fixture
def anonymous() -> TestClient:
    """No credential at all, which is what a stray caller looks like."""
    return TestClient(app)


class TestRefusal:
    def test_no_token_is_refused(self, anonymous: TestClient) -> None:
        assert anonymous.get(GUARDED).status_code == 401

    def test_wrong_token_is_refused(self, anonymous: TestClient) -> None:
        assert (
            anonymous.get(GUARDED, headers={"X-Internal-Token": "not-the-token"}).status_code
            == 401
        )

    def test_empty_token_is_refused(self, anonymous: TestClient) -> None:
        # A header present but blank is not "no header" and must not read as one.
        assert anonymous.get(GUARDED, headers={"X-Internal-Token": ""}).status_code == 401

    def test_refusal_does_not_echo_the_secret(self, anonymous: TestClient) -> None:
        # A caller learns that it was refused, never how close it got.
        body = anonymous.get(GUARDED, headers={"X-Internal-Token": "guess"}).text
        assert TOKEN not in body
        assert "guess" not in body


class TestAcceptance:
    def test_correct_token_reaches_the_endpoint(self, anonymous: TestClient) -> None:
        response = anonymous.get(GUARDED, headers={"X-Internal-Token": TOKEN})

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_health_stays_open(self, anonymous: TestClient) -> None:
        # Render polls this to decide whether the service is up. A health check
        # that needs a secret reports "down" for a misconfiguration that has not
        # happened, which is worse than the exposure of saying "I am running".
        assert anonymous.get("/health").status_code == 200


class TestPostRoutes:
    """The expensive ones, which are the reason this exists."""

    @pytest.mark.parametrize(
        "path",
        ["/ai/chat", "/ai/workspace-chat", "/ai/index", "/ai/semantic-search", "/ai/summarize"],
    )
    def test_refused_before_the_body_is_considered(
        self, anonymous: TestClient, path: str
    ) -> None:
        # An empty body would be a 422 if it got as far as validation. 401 says
        # the guard ran first, which is the ordering that matters: nothing is
        # parsed, no provider is called, and no tenant is named.
        assert anonymous.post(path, json={}).status_code == 401


class TestUnconfigured:
    def test_a_blank_configured_token_refuses_everything(self) -> None:
        """Fails closed, rather than becoming open to everyone.

        A service that accepted every request because nobody set the variable
        would look exactly like a working one -- and that is the class of
        mistake this guard exists to catch, so it cannot be its own default.
        """
        from app.config import get_settings

        # Keyed on the original dependency, which is what `Depends` captured.
        app.dependency_overrides[get_settings] = lambda: Settings(reverie_internal_token="")
        try:
            with TestClient(app) as c:
                response = c.get(GUARDED, headers={"X-Internal-Token": TOKEN})
            assert response.status_code == 503
        finally:
            app.dependency_overrides.clear()
