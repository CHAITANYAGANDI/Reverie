"""Renderings of values that are useful in a log and safe to leave there.

Not a logging framework and not a wrapper: two functions, used at the handful of
sites that would otherwise repeat the same redaction and eventually disagree
about it.

Why this service needs them more than the backend does
------------------------------------------------------

Everything here is one step from user content. The exceptions raised in this
process come from parsers and HTTP clients handling audio, transcripts, prompts
and model output, so their *messages* quote that material as a matter of course:
``httpx.HTTPStatusError`` carries the provider's response body, a JSON decode
error quotes the document, a ``KeyError`` names a key that came from a
transcript.

That makes ``logger.exception`` -- which appends a traceback whose final line is
``ExceptionType: message`` -- the quiet way user content reaches a log file.
"""

from __future__ import annotations

import traceback

#: What a redacted path segment is replaced with.
FILENAME_PLACEHOLDER = "<file>"


def safe_key(object_key: str | None) -> str:
    """An object key with the uploader's filename removed.

    Keys are ``meetings/{user_id}/{meeting_id}/{filename}`` and the filename is
    the one the person chose; the backend only replaces punctuation with
    underscores, so "Q4 layoffs board call.mp3" survives as
    "Q4_layoffs_board_call.mp3". A filename is frequently a better summary of a
    private meeting than the transcript is.

    The prefix is kept because it is what makes the log actionable: the meeting
    is still identified and the object still findable by listing that prefix.
    """
    if not object_key:
        return "<none>"
    head, sep, _ = object_key.rpartition("/")
    if not sep:
        return "<redacted>"
    return f"{head}/{FILENAME_PLACEHOLDER}"


def frames(exc: BaseException | None) -> str:
    """A traceback with the exception message left out.

    ``logger.exception`` and ``traceback.format_exc`` both end with
    ``ExceptionType: message``, and that message is the part that can quote a
    provider response body or a transcript. ``format_tb`` formats only the stack
    frames -- file, line, function and the *source* line -- so the diagnostic
    that actually matters survives and the payload does not.

    The source line is source, not data: ``raise TranscodeError(message)`` is
    printed as written, with the name rather than what it held. Local variables
    are not captured at all, which is the difference between this and
    ``TracebackException(capture_locals=True)``.

    Chained causes are deliberately not walked: each one would bring its own
    message back.
    """
    if exc is None or exc.__traceback__ is None:
        return "<no traceback>"
    return "".join(traceback.format_tb(exc.__traceback__)).rstrip()
