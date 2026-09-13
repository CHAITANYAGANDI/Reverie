"""The two renderings the ai-service logging policy rests on.

Every site that stopped logging an object key or an exception message now calls
one of these, so a regression here is a regression everywhere at once -- and a
silent one, because a log line that has started carrying a transcript still
looks like a working log line.

The markers are synthetic. Nothing here is real user data, and it has to stay
that way: a privacy test whose fixtures are somebody's meeting is the thing it
is testing against.

Each constant's *name* differs from its *value* on purpose. ``format_tb``
prints the source line of every frame, so a fixture written as a literal on the
raising line would appear in the traceback as source and fail an assertion that
is really about values. Naming them keeps the two apart -- and the test at the
bottom pins that distinction so it is not rediscovered as a bug.
"""

from __future__ import annotations

import pytest

from app.log_safety import frames, safe_key

FILENAME = "Q4_layoffs_board_call.mp3"
TRANSCRIPT = "PRIVATE_TRANSCRIPT_MARKER"
EMAIL = "secret.person@example.invalid"
MODEL_RESPONSE = "PRIVATE_MODEL_RESPONSE"
TOKEN = "Bearer TEST_SECRET_TOKEN"


class TestSafeKey:
    def test_drops_the_filename_and_keeps_the_prefix_that_finds_it(self) -> None:
        key = f"meetings/user_2abc/meeting_9xyz/{FILENAME}"

        rendered = safe_key(key)

        assert FILENAME not in rendered
        # "layoffs" on its own: no *word* of the name may survive, not merely
        # the whole string.
        assert "layoffs" not in rendered
        # Still actionable -- the object is findable by listing this prefix,
        # which is what the log line was for.
        assert rendered == "meetings/user_2abc/meeting_9xyz/<file>"

    def test_redacts_a_bare_filename_having_no_prefix_to_keep(self) -> None:
        assert safe_key(FILENAME) == "<redacted>"

    @pytest.mark.parametrize("absent", [None, ""])
    def test_says_so_rather_than_printing_none(self, absent: str | None) -> None:
        assert safe_key(absent) == "<none>"


def _raised() -> BaseException:
    """Raised from a named function so the assertion on frames means something."""
    try:
        try:
            raise ValueError(MODEL_RESPONSE)
        except ValueError as cause:
            raise RuntimeError(TRANSCRIPT) from cause
    except RuntimeError as caught:
        return caught


class TestFrames:
    def test_keeps_the_frames_and_drops_the_message(self) -> None:
        rendered = frames(_raised())

        # The liability: httpx renders a provider response body into exactly
        # this position, and `logger.exception` used to print it.
        assert TRANSCRIPT not in rendered

        # The diagnostic: the frame that raised, by file and function.
        assert "_raised" in rendered
        assert "test_log_safety.py" in rendered

    def test_does_not_walk_the_cause_chain_back_to_its_message(self) -> None:
        # `__cause__` carries its own message; format_tb must not reach it.
        raised = _raised()
        assert raised.__cause__ is not None
        assert MODEL_RESPONSE not in frames(raised)

    def test_drops_a_provider_response_body(self) -> None:
        # The shape that actually occurs: a provider error whose message is the
        # response body, which is the model's own words.
        body = f'{{"error": {{"message": "{MODEL_RESPONSE}"}}}}'
        message = f"400 Bad Request: {body}"
        try:
            raise RuntimeError(message)
        except RuntimeError as exc:
            rendered = frames(exc)

        assert MODEL_RESPONSE not in rendered
        assert "400 Bad Request" not in rendered

    def test_drops_a_credential_that_reached_an_exception_message(self) -> None:
        message = f"rejected {TOKEN}"
        try:
            raise PermissionError(message)
        except PermissionError as exc:
            assert "TEST_SECRET_TOKEN" not in frames(exc)

    def test_drops_an_address_a_parser_quoted_back(self) -> None:
        message = f"invalid recipient: {EMAIL}"
        try:
            raise ValueError(message)
        except ValueError as exc:
            assert EMAIL not in frames(exc)

    def test_prints_source_lines_but_never_the_values_they_held(self) -> None:
        """The property the fixtures above are named around.

        A frame's source line is printed as written. That is source, not data:
        the name appears, what it referred to at runtime does not. Locals are
        not captured, which is the difference from `capture_locals=True`.
        """
        secret = TRANSCRIPT
        try:
            raise RuntimeError(secret)
        except RuntimeError as exc:
            rendered = frames(exc)

        assert "raise RuntimeError(secret)" in rendered  # the source line
        assert TRANSCRIPT not in rendered  # never what it held

    def test_says_so_rather_than_printing_none(self) -> None:
        assert frames(None) == "<no traceback>"
        # An exception constructed but never raised has no traceback.
        assert frames(ValueError(TRANSCRIPT)) == "<no traceback>"
