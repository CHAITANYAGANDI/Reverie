package com.reverie.common;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The two renderings the logging policy rests on.
 *
 * <p>Every call site that stopped logging a filename or an exception message
 * now calls one of these instead, so a regression here is a regression
 * everywhere at once — and it would be a silent one, because a log line that
 * has started carrying a meeting title still looks like a working log line.
 *
 * <p>The markers below are synthetic. Nothing in this file is real user data,
 * and it has to stay that way: a privacy test whose fixtures are somebody's
 * meeting is the thing it is testing against.
 */
@DisplayName("LogSafe")
class LogSafeTest {

    private static final String PRIVATE_FILENAME = "Q4_layoffs_board_call.mp3";
    private static final String PRIVATE_BODY =
            "PRIVATE_MODEL_RESPONSE from secret.person@example.invalid";

    @Nested
    @DisplayName("objectKey")
    class ObjectKeys {

        @Test
        @DisplayName("drops the uploader's filename and keeps the prefix that finds it")
        void dropsFilenameKeepsPrefix() {
            String key = "meetings/user_2abc/meeting_9xyz/" + PRIVATE_FILENAME;

            String rendered = LogSafe.objectKey(key);

            assertThat(rendered).doesNotContain(PRIVATE_FILENAME);
            // "layoffs" on its own: the point is that no *word* of the name
            // survives, not merely that the string is not equal.
            assertThat(rendered).doesNotContain("layoffs");
            // Still actionable. The object is findable by listing this prefix,
            // which is what the log line was for.
            assertThat(rendered).isEqualTo("meetings/user_2abc/meeting_9xyz/<file>");
        }

        @Test
        @DisplayName("redacts a bare filename entirely, having no prefix to keep")
        void redactsBareName() {
            assertThat(LogSafe.objectKey(PRIVATE_FILENAME)).isEqualTo("<redacted>");
        }

        @Test
        @DisplayName("says so rather than printing null")
        void handlesAbsence() {
            assertThat(LogSafe.objectKey(null)).isEqualTo("<none>");
            assertThat(LogSafe.objectKey("  ")).isEqualTo("<none>");
        }
    }

    @Nested
    @DisplayName("stackTrace")
    class StackTraces {

        @Test
        @DisplayName("keeps the frames and drops the message, through the whole cause chain")
        void keepsFramesDropsMessages() {
            Throwable thrown = thrownHere();

            String rendered = LogSafe.stackTrace(thrown);

            // The liability: a RestClientResponseException renders the
            // ai-service response body into exactly this position.
            assertThat(rendered).doesNotContain(PRIVATE_BODY);
            assertThat(rendered).doesNotContain("PRIVATE_MODEL_RESPONSE");
            assertThat(rendered).doesNotContain("secret.person@example.invalid");
            assertThat(rendered).doesNotContain("Bearer TEST_SECRET_TOKEN");

            // The diagnostic: class names and the frame that threw.
            assertThat(rendered).contains("java.lang.IllegalStateException");
            assertThat(rendered).contains("java.lang.IllegalArgumentException");
            assertThat(rendered).contains("thrownHere");
            assertThat(rendered).contains("LogSafeTest.java");
        }

        @Test
        @DisplayName("terminates on a cause cycle instead of spinning")
        void survivesACycle() {
            Exception a = new IllegalStateException(PRIVATE_BODY);
            Exception b = new IllegalStateException(PRIVATE_BODY);
            a.initCause(b);
            b.initCause(a);

            String rendered = LogSafe.stackTrace(a);

            assertThat(rendered).doesNotContain("PRIVATE_MODEL_RESPONSE");
            assertThat(rendered).contains("Caused by: java.lang.IllegalStateException");
        }

        @Test
        @DisplayName("says so rather than printing null")
        void handlesAbsence() {
            assertThat(LogSafe.stackTrace(null)).isEqualTo("<none>");
        }
    }

    /** Thrown from a named method so the assertion on frames means something. */
    private static Throwable thrownHere() {
        try {
            try {
                throw new IllegalArgumentException("Bearer TEST_SECRET_TOKEN");
            } catch (IllegalArgumentException cause) {
                throw new IllegalStateException(PRIVATE_BODY, cause);
            }
        } catch (IllegalStateException caught) {
            return caught;
        }
    }
}
