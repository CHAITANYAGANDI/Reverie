"""Production must not be able to start wearing development's defaults.

The backend has refused this for a while. The AI service did not, and the
asymmetry mattered more here than it would in most services because every one
of these mistakes is invisible from outside: a mock provider returns plausible
summaries, a resilient Kafka worker retries a localhost broker forever without
crashing, and `/health` answers 200 through all of it. A deployment that is
wrong in any of these ways looks exactly like one that is right.
"""

from __future__ import annotations

import pytest

from app.config import Settings
from app.deployment_check import PUBLISHED_DEV_TOKEN, production_problems, verify_production


def production(**overrides) -> Settings:
    """A deployment that is correct, so each test can break exactly one thing."""
    base = dict(
        reverie_env="production",
        reverie_internal_token="a-real-generated-secret",
        ai_provider="openai",
        openai_api_key="sk-real",
        transcription_provider="assemblyai",
        assemblyai_api_key="aai-real",
        kafka_bootstrap_servers="pkc-xxxxx.us-east-1.aws.confluent.cloud:9092",
        kafka_security_protocol="SASL_SSL",
        spring_callback_url="https://reverie-backend.onrender.com",
        pg_host="ep-example.us-east-1.aws.neon.tech",
        pg_sslmode="require",
        s3_endpoint="https://account.r2.cloudflarestorage.com",
        s3_access_key="key",
        s3_secret_key="secret",
    )
    base.update(overrides)
    return Settings(**base)


class TestAGoodDeployment:
    def test_a_correct_production_configuration_passes(self) -> None:
        assert production_problems(production()) == []

    def test_and_starts(self) -> None:
        verify_production(production())  # does not raise


class TestLocalDefaultsStayUsable:
    def test_development_is_not_checked_at_all(self) -> None:
        # `docker compose up` with no configuration is the reason these defaults
        # exist. Checking them locally would make the checks the thing people
        # work around, which is how they stop meaning anything.
        verify_production(Settings())

    def test_the_shipped_defaults_would_fail_as_production(self) -> None:
        # Not a contradiction with the test above -- it is the point. The
        # defaults are wrong for production in several ways at once, and that is
        # exactly what must be refused when a deployment says it is production.
        assert len(production_problems(Settings(reverie_env="production"))) >= 5


class TestTheSecret:
    def test_a_missing_internal_token_is_refused(self) -> None:
        problems = production_problems(production(reverie_internal_token=""))
        assert any("REVERIE_INTERNAL_TOKEN" in p for p in problems)

    def test_the_published_development_token_is_refused(self) -> None:
        # It is in this repository. "Set" is not the same as "secret".
        problems = production_problems(production(reverie_internal_token=PUBLISHED_DEV_TOKEN))
        assert any("published" in p for p in problems)


class TestTheProvider:
    def test_mock_ai_is_refused(self) -> None:
        problems = production_problems(production(ai_provider="mock"))
        assert any("AI_PROVIDER" in p for p in problems)

    def test_openai_without_a_key_is_refused(self) -> None:
        problems = production_problems(production(ai_provider="openai", openai_api_key=None))
        assert any("OPENAI_API_KEY" in p for p in problems)

    def test_mock_transcription_is_refused(self) -> None:
        problems = production_problems(production(transcription_provider="mock"))
        assert any("TRANSCRIPTION_PROVIDER" in p for p in problems)

    def test_auto_with_no_keys_at_all_is_refused(self) -> None:
        # 'auto' picks whichever key exists; with none it picks the mock, which
        # is the silent failure this whole file is about.
        problems = production_problems(
            production(
                transcription_provider="auto",
                assemblyai_api_key=None,
                openai_api_key=None,
                ai_provider="mock",
            )
        )
        assert any("auto" in p for p in problems)


class TestTheNetwork:
    @pytest.mark.parametrize("broker", ["localhost:9092", "127.0.0.1:9092", "0.0.0.0:9092"])
    def test_a_local_broker_is_refused(self, broker: str) -> None:
        problems = production_problems(production(kafka_bootstrap_servers=broker))
        assert any("KAFKA_BOOTSTRAP_SERVERS" in p for p in problems)

    def test_plaintext_kafka_is_refused(self) -> None:
        problems = production_problems(production(kafka_security_protocol="PLAINTEXT"))
        assert any("KAFKA_SECURITY_PROTOCOL" in p for p in problems)

    def test_a_local_callback_url_is_refused(self) -> None:
        problems = production_problems(production(spring_callback_url="http://localhost:8080"))
        assert any("SPRING_CALLBACK_URL" in p for p in problems)


class TestDataStores:
    def test_no_database_is_refused(self) -> None:
        problems = production_problems(production(pg_host=None))
        assert any("PG_HOST" in p for p in problems)

    def test_a_connection_that_may_be_unencrypted_is_refused(self) -> None:
        # 'prefer' falls back to plaintext without saying so, which for a
        # managed database reached over the internet is the wrong default.
        problems = production_problems(production(pg_sslmode="prefer"))
        assert any("PG_SSLMODE" in p for p in problems)

    @pytest.mark.parametrize("sslmode", ["require", "verify-ca", "verify-full"])
    def test_stricter_modes_are_accepted(self, sslmode: str) -> None:
        assert production_problems(production(pg_sslmode=sslmode)) == []

    def test_an_external_database_may_not_disable_tls_either(self) -> None:
        # 'disable' is the same fault as 'prefer', minus the ambiguity: the
        # default fixture host is a managed database on the public internet.
        problems = production_problems(production(pg_sslmode="disable"))
        assert any("PG_SSLMODE" in p for p in problems)

    def test_missing_object_storage_is_refused(self) -> None:
        problems = production_problems(production(s3_endpoint=None))
        assert any("S3_ENDPOINT" in p for p in problems)


class TestTheSameHostDatabase:
    """The Oracle deployment runs PostgreSQL beside this service.

    It is a Compose service on a private bridge with no published port, so the
    connection never leaves the VM and there is no certificate to verify. That
    is the one place plaintext is correct, and the exception is written as the
    service name so it cannot quietly grow to cover anything else.
    """

    def test_the_compose_service_may_speak_plaintext(self) -> None:
        assert production_problems(production(pg_host="postgres", pg_sslmode="disable")) == []

    def test_but_not_with_fallback_semantics(self) -> None:
        # 'prefer' is not 'disable'. It means "encrypt if the server offers it,
        # otherwise do not", and a check that accepted it here would be
        # accepting an outcome nobody stated. The exception is for the one
        # configuration the Compose file actually sets.
        problems = production_problems(production(pg_host="postgres", pg_sslmode="prefer"))
        assert any("PG_SSLMODE" in p for p in problems)

    def test_the_exception_is_the_name_and_not_the_shape_of_the_name(self) -> None:
        # Nothing that merely looks private inherits it: not localhost, not a
        # bridge address, not a host that happens to contain the word.
        for host in ("localhost", "127.0.0.1", "10.0.0.5", "postgres.example.com", "my-postgres"):
            problems = production_problems(production(pg_host=host, pg_sslmode="disable"))
            assert any("PG_SSLMODE" in p for p in problems), host

    def test_it_may_still_use_tls_if_it_ever_gains_a_certificate(self) -> None:
        assert production_problems(production(pg_host="postgres", pg_sslmode="require")) == []

    @pytest.mark.parametrize("host", ["postgres", "  postgres  ", "POSTGRES"])
    @pytest.mark.parametrize("sslmode", ["disable", " disable", "DISABLE"])
    def test_spacing_and_case_are_not_the_difference(self, host: str, sslmode: str) -> None:
        # A value read from a Compose file or a .env line can arrive with either,
        # and a deployment that fails on one of them fails for no stated reason.
        assert production_problems(production(pg_host=host, pg_sslmode=sslmode)) == []


class TestHowItFails:
    def test_it_raises_rather_than_logging_and_carrying_on(self) -> None:
        with pytest.raises(RuntimeError):
            verify_production(production(ai_provider="mock"))

    def test_every_problem_is_reported_at_once(self) -> None:
        # Fixing a deploy one restart per missing variable is how an afternoon
        # goes. The message names all of them.
        with pytest.raises(RuntimeError) as caught:
            verify_production(
                production(ai_provider="mock", pg_host=None, kafka_security_protocol="PLAINTEXT")
            )

        message = str(caught.value)
        assert "AI_PROVIDER" in message
        assert "PG_HOST" in message
        assert "KAFKA_SECURITY_PROTOCOL" in message

    def test_no_secret_is_printed(self) -> None:
        # A startup log is not a private place.
        with pytest.raises(RuntimeError) as caught:
            verify_production(production(ai_provider="mock", openai_api_key="sk-super-secret"))

        assert "sk-super-secret" not in str(caught.value)
