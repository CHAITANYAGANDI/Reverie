"""The ceiling on what ai-service will hold in memory at once.

This container has 1 GiB. Spring accepts uploads of 500 MiB, and the bytes are
held twice on the way through — once by whatever accumulated them, once by
whatever was handed them — so an unbounded read here is an OOM-kill waiting for
a long enough meeting. The cost is not one job: the worker dies holding the
single partition every queued meeting is behind.

The normal path never comes near this. AssemblyAI fetches the presigned object
URL itself and the recording never enters this process; what these tests cover
are the fallback paths that genuinely need the bytes locally — a provider that
uploads a file rather than fetching a URL, a presigned URL the provider could
not reach, a deployment with no public endpoint.

The limits used below are tiny so the tests stay fast and allocate nothing of
consequence. The production default is 128 MiB.
"""

from __future__ import annotations

import httpx
import pytest

from app.config import Settings
from app.storage import (
    AudioDownloadTooLargeError,
    download_from_s3,
    download_from_url,
    fetch_audio,
)

URL = "https://storage.example.invalid/meetings/usr_1/mtg_1/audio.m4a?X-Amz-Signature=abc"
KEY = "meetings/usr_1/mtg_1/audio.m4a"


def _settings(limit: int) -> Settings:
    return Settings(download_max_bytes=limit, download_timeout_seconds=5.0)


@pytest.fixture()
def http(monkeypatch):
    """Lets a test install a response without reaching the network.

    `download_from_url` builds its own AsyncClient, so the seam is the class.
    The real one is bound before the patch goes in: `app.storage.httpx` *is*
    the httpx module, so patching through it replaces the global, and a factory
    that then called `httpx.AsyncClient` would call itself.
    """
    real_client = httpx.AsyncClient

    def install(handler):
        def _factory(*_args, **_kwargs):
            # The timeout and follow_redirects the caller passes are dropped:
            # MockTransport answers directly, so neither has anything to do.
            return real_client(transport=httpx.MockTransport(handler))

        monkeypatch.setattr("app.storage.httpx.AsyncClient", _factory)

    return install


# --- A. the server says up front that it is too big ------------------------- #
@pytest.mark.asyncio
async def test_an_oversized_content_length_is_refused_before_the_body(http):
    read = {"bytes": 0}

    def handler(request):
        # A body that would blow the limit if it were ever read. The assertion
        # below is that it is not.
        body = b"x" * 4096
        read["bytes"] += len(body)
        return httpx.Response(200, content=body, headers={"content-length": "999999999"})

    http(handler)

    with pytest.raises(AudioDownloadTooLargeError):
        await download_from_url(URL, _settings(1024))


# --- B. and when it lies, or says nothing ----------------------------------- #
@pytest.mark.asyncio
async def test_a_body_that_exceeds_the_limit_is_stopped_while_streaming(http):
    # No content-length at all: this is what a chunked response looks like, and
    # it is why the header cannot be the only guard.
    def handler(request):
        return httpx.Response(200, content=b"y" * 5000)

    http(handler)

    with pytest.raises(AudioDownloadTooLargeError):
        await download_from_url(URL, _settings(1024))


@pytest.mark.asyncio
async def test_a_content_length_that_understates_the_body_is_still_caught(http):
    # A server claiming 10 bytes and sending 5000. Trusting the header here
    # would let the whole body through.
    def handler(request):
        return httpx.Response(200, content=b"z" * 5000, headers={"content-length": "10"})

    http(handler)

    with pytest.raises(AudioDownloadTooLargeError):
        await download_from_url(URL, _settings(1024))


@pytest.mark.asyncio
async def test_an_unparseable_content_length_falls_through_to_the_real_guard(http):
    def handler(request):
        return httpx.Response(200, content=b"q" * 5000, headers={"content-length": "banana"})

    http(handler)

    with pytest.raises(AudioDownloadTooLargeError):
        await download_from_url(URL, _settings(1024))


# --- C. the ordinary case, unchanged ---------------------------------------- #
@pytest.mark.asyncio
async def test_a_normal_recording_is_returned_intact(http):
    payload = b"RIFF" + b"a" * 500

    def handler(request):
        return httpx.Response(200, content=payload)

    http(handler)

    audio, filename = await download_from_url(URL, _settings(1024))

    assert audio == payload
    assert isinstance(audio, bytes)
    # The query string is not part of the name, signature and all.
    assert filename == "audio.m4a"


@pytest.mark.asyncio
async def test_a_recording_exactly_at_the_limit_is_allowed(http):
    # The limit is a maximum, not a value to be under. An off-by-one here would
    # refuse a file of exactly the configured size.
    payload = b"m" * 1024

    def handler(request):
        return httpx.Response(200, content=payload)

    http(handler)

    audio, _ = await download_from_url(URL, _settings(1024))

    assert len(audio) == 1024


@pytest.mark.asyncio
async def test_an_http_error_still_raises_before_any_size_check(http):
    def handler(request):
        return httpx.Response(404, content=b"not found")

    http(handler)

    with pytest.raises(httpx.HTTPStatusError):
        await download_from_url(URL, _settings(1024))


# --- the S3/R2 path --------------------------------------------------------- #
class _Body:
    """Stands in for botocore's StreamingBody, recording how it was used.

    `closed` is the point of the tracking: `get_object` has already opened the
    HTTP response, and both refusal paths leave bytes unread, so a body that is
    not closed strands a pooled connection until the collector gets to it.

    `raise_on_read` covers the fourth exit -- the read itself failing -- which
    has to close the body too.
    """

    def __init__(self, payload: bytes, *, raise_on_read: Exception | None = None) -> None:
        self._payload = payload
        self._raise_on_read = raise_on_read
        self.read_calls: list[int | None] = []
        self.closed = False

    def read(self, amt=None):
        self.read_calls.append(amt)
        if self._raise_on_read is not None:
            raise self._raise_on_read
        return self._payload if amt is None else self._payload[:amt]

    def close(self):
        self.closed = True


class _S3:
    def __init__(self, body: _Body, content_length: int | None) -> None:
        self.body = body
        self._content_length = content_length

    def get_object(self, **_kwargs):
        obj = {"Body": self.body}
        if self._content_length is not None:
            obj["ContentLength"] = self._content_length
        return obj


@pytest.fixture()
def s3(monkeypatch):
    """Installs a fake boto3 client for the lazily-imported S3 path."""

    def install(payload: bytes, content_length: int | None, *, raise_on_read=None):
        body = _Body(payload, raise_on_read=raise_on_read)
        fake = _S3(body, content_length)
        import sys
        import types

        module = types.ModuleType("boto3")
        module.client = lambda *a, **k: fake  # noqa: ARG005
        monkeypatch.setitem(sys.modules, "boto3", module)
        return body

    return install


# --- D. the store says it is too big ---------------------------------------- #
def test_an_oversized_object_is_refused_without_reading_the_body(s3):
    body = s3(b"x" * 5000, content_length=999_999_999)

    with pytest.raises(AudioDownloadTooLargeError):
        download_from_s3(KEY, _settings(1024))

    # The point of checking ContentLength first: nothing was transferred.
    assert body.read_calls == []
    # ...but the response was already open, so it still has to be closed.
    assert body.closed is True


# --- E. ...and when the store's own number is wrong ------------------------- #
def test_an_understated_content_length_is_caught_by_the_bounded_read(s3):
    body = s3(b"y" * 5000, content_length=10)

    with pytest.raises(AudioDownloadTooLargeError):
        download_from_s3(KEY, _settings(1024))

    # Read once, bounded to one byte past the limit -- never the whole object.
    assert body.read_calls == [1025]
    # The remainder is abandoned, which is exactly when closing matters.
    assert body.closed is True


def test_a_missing_content_length_is_caught_by_the_bounded_read(s3):
    body = s3(b"z" * 5000, content_length=None)

    with pytest.raises(AudioDownloadTooLargeError):
        download_from_s3(KEY, _settings(1024))

    assert body.read_calls == [1025]
    assert body.closed is True


# --- F. the ordinary case, unchanged ---------------------------------------- #
def test_a_normal_object_is_returned_with_its_filename(s3):
    payload = b"RIFF" + b"a" * 100
    body = s3(payload, content_length=len(payload))

    audio, filename = download_from_s3(KEY, _settings(1024))

    assert audio == payload
    assert filename == "audio.m4a"
    # The success path leaks a connection just as easily as a failure.
    assert body.closed is True


def test_the_body_is_closed_even_when_the_read_itself_fails(s3):
    # The fourth exit. A read that raises leaves the response open in exactly
    # the same way, and the `finally` is what covers all four.
    body = s3(b"", content_length=10, raise_on_read=OSError("connection reset"))

    with pytest.raises(OSError):
        download_from_s3(KEY, _settings(1024))

    assert body.closed is True


def test_an_object_exactly_at_the_limit_is_allowed(s3):
    s3(b"m" * 1024, content_length=1024)

    audio, _ = download_from_s3(KEY, _settings(1024))

    assert len(audio) == 1024


# --- the error itself ------------------------------------------------------- #
@pytest.mark.asyncio
async def test_the_error_names_no_url_no_key_and_no_signature(http):
    def handler(request):
        return httpx.Response(200, content=b"y" * 5000)

    http(handler)

    with pytest.raises(AudioDownloadTooLargeError) as caught:
        await download_from_url(URL, _settings(1024))

    message = str(caught.value)
    # It is logged, reported and may travel; a presigned URL is a credential.
    assert "X-Amz-Signature" not in message
    assert "storage.example.invalid" not in message
    assert URL not in message
    assert KEY not in message
    # What it does say is the part an operator needs.
    assert "too large" in message.lower()


def test_the_s3_error_names_no_object_key(s3):
    s3(b"y" * 5000, content_length=999_999_999)

    with pytest.raises(AudioDownloadTooLargeError) as caught:
        download_from_s3(KEY, _settings(1024))

    assert KEY not in str(caught.value)
    assert "usr_1" not in str(caught.value)


# --- it reaches the caller, rather than becoming empty bytes ---------------- #
@pytest.mark.asyncio
async def test_fetch_audio_lets_the_size_failure_out(http):
    # Swallowing it would return b"", which downstream cannot tell apart from a
    # silent recording -- the same shape as the empty-transcript bug.
    def handler(request):
        return httpx.Response(200, content=b"y" * 5000)

    http(handler)

    with pytest.raises(AudioDownloadTooLargeError):
        await fetch_audio(_settings(1024), audio_url=URL)


@pytest.mark.asyncio
async def test_fetch_audio_still_returns_nothing_when_given_nothing():
    # Unchanged: keyless, urlless demos run against the mock provider.
    audio, filename = await fetch_audio(_settings(1024))

    assert audio == b""
    assert filename == "audio"


# --- the rest of an oversized body is never pulled -------------------------- #
@pytest.mark.asyncio
async def test_an_oversized_stream_is_abandoned_rather_than_drained(http):
    """The limit has to stop the transfer, not just the return value.

    Reading to the end and *then* refusing would allocate exactly what this
    exists to prevent. The counter below is what proves it did not: the body is
    a hundred 1 KiB chunks and the limit is 4 KiB, so a handful are pulled and
    the rest are left on the wire.
    """
    pulled = {"chunks": 0}

    class _CountingStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            for _ in range(100):
                pulled["chunks"] += 1
                yield b"a" * 1024

    def handler(request):
        return httpx.Response(200, stream=_CountingStream())

    http(handler)

    with pytest.raises(AudioDownloadTooLargeError):
        await download_from_url(URL, _settings(4096))

    # Five: four to reach the limit, the fifth to cross it.
    assert pulled["chunks"] == 5
    assert pulled["chunks"] < 100
