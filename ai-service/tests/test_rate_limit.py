"""Rate-limit handling.

A 429 is an instruction to wait, not a failure. Treated as a failure it burns
every retry inside a few seconds and the brief comes back empty — a blank
summary for a meeting whose only sin was arriving soon after the last one.
"""

from __future__ import annotations

import pytest

from app.providers.openai_adapter import _rate_limit_wait, _with_retries


def _make_no_sleep():
    """An `asyncio.sleep` that returns at once, so backoff costs no wall time."""

    async def _sleep(_seconds):
        return None

    return _sleep


class _Resp:
    def __init__(self, headers: dict):
        self.headers = headers


class _RateLimitError(Exception):
    """Stands in for openai.RateLimitError, matched by class name."""

    def __init__(self, message: str, headers: dict | None = None):
        super().__init__(message)
        self.status_code = 429
        self.response = _Resp(headers) if headers is not None else None


def test_plain_failure_is_not_treated_as_a_rate_limit():
    assert _rate_limit_wait(ValueError("something broke")) is None


def test_delay_is_read_from_the_message():
    wait = _rate_limit_wait(_RateLimitError("Rate limit reached. Please try again in 21.52s."))
    assert wait == pytest.approx(21.62, abs=0.01)


def test_header_wins_over_the_message():
    wait = _rate_limit_wait(
        _RateLimitError("try again in 21.52s", headers={"retry-after": "5"})
    )
    assert wait == pytest.approx(5.1, abs=0.01)


def test_a_429_without_a_stated_delay_still_waits_properly():
    """Far longer than the generic backoff, which is the whole bug."""
    assert _rate_limit_wait(_RateLimitError("Rate limit reached.")) == 20.0


def test_an_absurd_delay_is_capped():
    wait = _rate_limit_wait(_RateLimitError("Please try again in 3600s."))
    assert wait == 65.0


def test_unparseable_header_falls_back_to_the_message():
    wait = _rate_limit_wait(
        _RateLimitError("try again in 12.0s", headers={"retry-after": "not-a-number"})
    )
    assert wait == pytest.approx(12.1, abs=0.01)


@pytest.mark.asyncio
async def test_retries_wait_the_requested_time_then_succeed(monkeypatch):
    slept: list[float] = []

    async def fake_sleep(seconds):
        slept.append(seconds)

    monkeypatch.setattr("app.providers.openai_adapter.asyncio.sleep", fake_sleep)

    calls = {"n": 0}

    async def op():
        calls["n"] += 1
        if calls["n"] == 1:
            raise _RateLimitError("Please try again in 21.52s.")
        return "ok"

    result = await _with_retries(op, attempts=3, fallback="fallback", label="t")

    assert result == "ok"
    # The wait must track the server's figure, not the 0.5s generic backoff.
    assert slept == [pytest.approx(21.62, abs=0.01)]


@pytest.mark.asyncio
async def test_non_rate_limit_errors_keep_the_short_backoff(monkeypatch):
    slept: list[float] = []

    async def fake_sleep(seconds):
        slept.append(seconds)

    monkeypatch.setattr("app.providers.openai_adapter.asyncio.sleep", fake_sleep)

    async def op():
        raise ValueError("transient")

    result = await _with_retries(op, attempts=3, fallback="fallback", label="t")

    assert result == "fallback"
    assert slept == [0.5, 1.0]


# --- what giving up means, which is not the same for every caller ----------- #
#
# `_with_retries` is shared between the analysis calls and transcription, and
# they want opposite things on exhaustion. Analysis degrades: a meeting with a
# transcript and no summary is readable, and the summary can be regenerated.
# Transcription cannot degrade, because its fallback is an empty transcript and
# nothing downstream distinguishes that from a recording with no speech in it.


class _PermanentError(Exception):
    """An OpenAI-style 4xx: the request itself was refused."""

    def __init__(self, status_code: int = 400):
        super().__init__(f"provider returned {status_code}")
        self.status_code = status_code


@pytest.mark.asyncio
async def test_analysis_still_degrades_to_its_fallback(monkeypatch):
    # The behaviour every summary/extraction caller relies on, unchanged.
    monkeypatch.setattr("app.providers.openai_adapter.asyncio.sleep", _make_no_sleep())
    calls = {"n": 0}

    async def op():
        calls["n"] += 1
        raise RuntimeError("provider is down")

    result = await _with_retries(op, attempts=3, fallback="fallback", label="summarize")

    assert result == "fallback"
    assert calls["n"] == 3


@pytest.mark.asyncio
async def test_a_caller_can_ask_to_be_told_instead(monkeypatch):
    # Transcription's choice. The retries still happen -- the failure was
    # transient -- but the caller hears about it rather than being handed an
    # empty transcript that looks like a successful one.
    monkeypatch.setattr("app.providers.openai_adapter.asyncio.sleep", _make_no_sleep())
    calls = {"n": 0}

    async def op():
        calls["n"] += 1
        raise RuntimeError("provider is down")

    with pytest.raises(RuntimeError):
        await _with_retries(
            op, attempts=3, fallback="fallback", label="transcribe",
            raise_on_exhaustion=True,
        )

    assert calls["n"] == 3


@pytest.mark.asyncio
async def test_a_permanent_failure_is_raised_without_burning_the_attempts():
    # No sleep patch on purpose: if this ever retried, the real backoff would
    # make the test visibly slow rather than quietly wrong.
    calls = {"n": 0}

    async def op():
        calls["n"] += 1
        raise _PermanentError(400)

    with pytest.raises(_PermanentError):
        await _with_retries(
            op, attempts=3, fallback="fallback", label="transcribe",
            retry_if=lambda exc: getattr(exc, "status_code", None) != 400,
        )

    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_retry_if_does_not_change_the_fallback_for_callers_that_want_one(monkeypatch):
    # `retry_if` and `raise_on_exhaustion` are independent. A caller may want to
    # stop retrying a hopeless request and still degrade rather than raise.
    monkeypatch.setattr("app.providers.openai_adapter.asyncio.sleep", _make_no_sleep())

    async def op():
        raise RuntimeError("transient")

    result = await _with_retries(
        op, attempts=2, fallback="fallback", label="summarize",
        retry_if=lambda exc: True,
    )

    assert result == "fallback"
