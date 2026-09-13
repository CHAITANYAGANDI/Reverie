package com.reverie.common;

import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;

/**
 * Renderings of values that are useful in a log and safe to leave there.
 *
 * <p>Not a logging framework and not a wrapper: two static methods, used at the
 * handful of sites that would otherwise have to repeat the same redaction and
 * would eventually disagree about it.
 */
public final class LogSafe {

    private LogSafe() {
    }

    /**
     * An object key with the uploader's filename removed.
     *
     * <p>Keys are built as {@code meetings/{userId}/{meetingId}/{filename}}, and
     * the filename is the one the person chose. {@code sanitize} only replaces
     * punctuation with underscores, so "Q4 layoffs board call.mp3" arrives as
     * "Q4_layoffs_board_call.mp3" — the words survive intact, and a filename is
     * frequently a better summary of a private meeting than the transcript is.
     *
     * <p>The prefix is kept because it is what makes the log actionable: the
     * meeting is still identified and the object is still findable by listing
     * that prefix. Only the last segment goes.
     *
     * @return the key up to and including the final separator, with the
     *     filename replaced; or a fixed placeholder when there is nothing
     *     structured to keep
     */
    public static String objectKey(String key) {
        if (key == null || key.isBlank()) {
            return "<none>";
        }
        int lastSlash = key.lastIndexOf('/');
        if (lastSlash < 0) {
            // No prefix to preserve, and the whole value is the part that may
            // carry the filename.
            return "<redacted>";
        }
        return key.substring(0, lastSlash + 1) + "<file>";
    }

    /**
     * A stack trace with every exception message left out.
     *
     * <p>Passing a {@code Throwable} as the last argument to SLF4J prints
     * {@code ClassName: message} for the exception and for each of its causes.
     * The frames are the diagnostic; the messages are the liability, and two
     * routes make that concrete rather than theoretical:
     *
     * <ul>
     *   <li>{@code RestClientResponseException.getMessage()} embeds the
     *       ai-service response body, and FastAPI's 422 echoes the field it
     *       rejected — so a chat question comes back inside the message.
     *   <li>{@code HttpMessageNotReadableException.getMessage()} quotes the
     *       fragment of the request body Jackson choked on, which on a
     *       transcript edit is transcript.
     * </ul>
     *
     * <p>A PostgreSQL error is the third: libpq puts {@code DETAIL: Failing row
     * contains (...)} into the message of a not-null or check violation, so a
     * failed insert reports the whole row it was inserting.
     *
     * <p>Causes are walked, because "what threw" is usually three frames down.
     * Cycles are guarded: {@code initCause} makes them possible and a logger is
     * the wrong place to discover one.
     */
    public static String stackTrace(Throwable thrown) {
        if (thrown == null) {
            return "<none>";
        }
        StringBuilder out = new StringBuilder();
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        Throwable current = thrown;
        while (current != null && seen.add(current)) {
            if (out.length() > 0) {
                out.append("Caused by: ");
            }
            out.append(current.getClass().getName()).append('\n');
            for (StackTraceElement frame : current.getStackTrace()) {
                out.append("\tat ").append(frame).append('\n');
            }
            current = current.getCause();
        }
        return out.toString();
    }
}
