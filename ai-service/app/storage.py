"""Audio retrieval — and, better, audio *not* retrieved.

Two ways to get a recording to a transcription provider:

1. Download the whole file here, then upload the whole file there. Two
   transfers of an hour of audio through a worker that does nothing with the
   bytes but pass them on.
2. Hand the provider a URL and let it fetch the file once, directly.

The second is what `presigned_get_url` exists for. The bucket stays private —
this mints a signature valid for minutes, for one object, for GET only — so
nothing is made public to save a hop. Where a signature cannot be produced
(no S3 credentials, a provider that will not fetch) the byte path is still
there and still correct.

The URL is a credential for one object and is never logged.

Both byte paths are bounded by `download_max_bytes`. This container has 1 GiB
and Spring accepts uploads of 500 MiB, so an unbounded read here is an
OOM-kill waiting for a long enough meeting — and it takes the queue head with
it, not just the one job. The limit is on *this service's memory*, not on what
a user may upload: the normal AssemblyAI path never reads the bytes here at
all.
"""

from __future__ import annotations

import logging
import os
from urllib.parse import urlparse

import httpx

from app.config import Settings
from app.log_safety import safe_key

logger = logging.getLogger("ai-service.storage")


class AudioDownloadTooLargeError(RuntimeError):
    """A recording is larger than this service may hold in memory.

    Not a statement about the upload limit, which is Spring's and is larger.
    This is the point at which materialising the bytes here would threaten the
    container, and failing the job is better than being OOM-killed: a killed
    worker loses the meeting it was running *and* holds the single partition
    every meeting behind it is queued on.

    The message carries a size and nothing else. The only identifier in scope at
    the throw sites is a presigned URL or an object key, and neither belongs in
    an exception that is logged, reported and may reach a callback.
    """


def _too_large(actual: int | None, limit: int) -> AudioDownloadTooLargeError:
    """The error, worded so it cannot carry a URL, a key or a signature."""
    size = "unknown size" if actual is None else f"{actual / 1048576:.1f} MiB"
    return AudioDownloadTooLargeError(
        f"The recording is too large for this service to download "
        f"({size}; limit {limit / 1048576:.0f} MiB)."
    )


def _filename_from_url(url: str) -> str:
    path = urlparse(url).path
    name = os.path.basename(path) or "audio"
    return name


async def download_from_url(url: str, settings: Settings) -> tuple[bytes, str]:
    """Download audio bytes from an HTTP(S) URL, bounded by `download_max_bytes`.

    Streamed rather than buffered. `resp.content` on a plain `get` has already
    read the whole body into memory by the time there is anything to check, so
    a size check after it is a check that runs after the damage.

    Content-Length is honoured when present because it refuses the transfer
    before it starts, but it is not *trusted*: it is absent on a chunked
    response and a server is free to misstate it. The running total is what
    actually enforces the limit, and it stops at the first chunk that crosses —
    the rest of an oversized body is never read.
    """
    limit = settings.download_max_bytes
    logger.info("Downloading audio from URL.")
    async with httpx.AsyncClient(
        timeout=settings.download_timeout_seconds, follow_redirects=True
    ) as client:
        async with client.stream("GET", url) as resp:
            resp.raise_for_status()

            declared = resp.headers.get("content-length")
            if declared is not None:
                try:
                    if int(declared) > limit:
                        # Refused before a byte of body is read.
                        raise _too_large(int(declared), limit)
                except ValueError:
                    # An unparseable header proves nothing either way; the
                    # running total below is the real guard.
                    pass

            # A bytearray extended in place, not a list of chunks joined at the
            # end. The join would hold every chunk object alive until the moment
            # it allocated the result, which on a long stream is thousands of
            # objects and a fragmented heap; extending amortises the growth and
            # keeps one buffer. The final `bytes()` below still copies once, so
            # the honest peak is about twice the recording either way — bounded,
            # which is the point, at roughly 256 MiB for the default limit.
            buffer = bytearray()
            async for chunk in resp.aiter_bytes():
                buffer.extend(chunk)
                if len(buffer) > limit:
                    # Leaving the `async with` closes the response, so the
                    # remainder is never transferred.
                    raise _too_large(len(buffer), limit)

            return bytes(buffer), _filename_from_url(url)


def download_from_s3(object_key: str, settings: Settings) -> tuple[bytes, str]:
    """Download audio bytes from S3/MinIO by object key (blocking boto3 call).

    Bounded by `download_max_bytes` in two places, and both are needed.
    `ContentLength` comes back with the response and lets an oversized object be
    refused without reading its body at all — but it is the store's word for it,
    so the read is bounded as well. `read(limit + 1)` is the whole trick: one
    byte past the limit is enough to know the object is too big, and is all that
    is ever allocated beyond it.

    The body is closed on every path out. `get_object` has already opened the
    response by the time any of these checks run, and the two refusals here both
    leave bytes unread — a declared-oversized object is refused without reading
    at all, and a bounded read that crosses the limit abandons the remainder.
    Leaving those to the garbage collector strands a pooled connection until it
    runs, which on a worker that fails a run of large recordings is how a
    connection pool quietly empties.
    """
    import boto3  # imported lazily; only needed for the S3 path

    limit = settings.download_max_bytes
    logger.info("Downloading audio from S3 object key.")
    client = boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
    )
    obj = client.get_object(Bucket=settings.s3_bucket, Key=object_key)

    # Bound to the stream from here on, so the `finally` cannot be reached
    # without something to close.
    body = obj["Body"]
    try:
        declared = obj.get("ContentLength")
        if isinstance(declared, int) and declared > limit:
            # Before `body.read()`, which is the only way the bytes could arrive.
            raise _too_large(declared, limit)

        data = body.read(limit + 1)
        if len(data) > limit:
            raise _too_large(None, limit)

        return data, os.path.basename(object_key) or "audio"
    finally:
        body.close()


def presigned_get_url(
    object_key: str,
    settings: Settings,
    *,
    expires_seconds: int = 3600,
) -> str | None:
    """A short-lived GET URL for one object, or None if one cannot be made.

    None rather than an exception: this is an optimisation, and the caller has
    a working path without it. A deployment with no S3 credentials, or with a
    storage endpoint the provider cannot reach, should transcribe exactly as it
    did before rather than fail.

    <p><b>The lifetime is the whole point.</b> An hour is long enough for a
    provider to queue and fetch a long recording, and short enough that a URL
    recovered from anywhere afterwards opens nothing.

    <p><b>Requires `s3_public_endpoint` explicitly.</b> It used to fall back to
    `s3_endpoint`, and that fallback caused the exact failure the docstring
    above was warning about: a URL signed against `http://minio:9000` is
    perfectly valid, completely unreachable from outside the compose network,
    and AssemblyAI answers it with "could not connect to the host" after
    accepting the job. Three retries later the meeting had no transcript and
    nothing on screen said why.

    <p>There is no safe default here. The internal endpoint is wrong by
    definition, and guessing a public one from it would be guessing. Unset
    means "do not hand out URLs", which costs one extra file transfer and
    cannot fail.
    """
    if not object_key or not settings.s3_public_endpoint:
        return None
    try:
        import boto3
        from botocore.config import Config

        client = boto3.client(
            "s3",
            endpoint_url=settings.s3_public_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
            config=Config(signature_version="s3v4"),
        )
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_bucket, "Key": object_key},
            ExpiresIn=max(60, int(expires_seconds)),
        )
    except Exception as exc:  # noqa: BLE001 — boto3 raises a wide range.
        logger.info(
            "No presigned URL for %s (%s); falling back to bytes.",
            safe_key(object_key), type(exc).__name__,
        )
        return None


async def fetch_audio(
    settings: Settings,
    *,
    audio_url: str | None = None,
    object_key: str | None = None,
) -> tuple[bytes, str]:
    """Fetch audio via URL when available, else via S3 object key.

    Returns (b"", "audio") when neither is provided — the mock provider ignores
    the bytes, so keyless/urlless demos still work end to end.

    `AudioDownloadTooLargeError` propagates, deliberately. Swallowing it would
    hand back `b""`, which is indistinguishable from a silent recording to
    everything downstream — the same failure shape that let an empty transcript
    reach a user once already. Letting it out costs nothing that matters:
    speaker refinement already treats an audio_loader failure as "keep the
    provider's labels", and the Kafka worker reports processing failures to
    Spring with its own generic message rather than this one.
    """
    if audio_url:
        return await download_from_url(audio_url, settings)
    if object_key and settings.s3_endpoint:
        import anyio

        return await anyio.to_thread.run_sync(download_from_s3, object_key, settings)
    logger.warning("No audioUrl or objectKey provided; returning empty audio bytes.")
    return b"", "audio"
