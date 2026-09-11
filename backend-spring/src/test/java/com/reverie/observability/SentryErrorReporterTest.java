package com.reverie.observability;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * What Reverie is willing to tell an external observability provider.
 *
 * <h2>Why the exception is not sent</h2>
 *
 * <p>This backend throws from code holding meeting transcripts, chat questions,
 * summaries and action items. An exception message is an arbitrary string built
 * by whatever failed — a JSON parse error quotes the document, a constraint
 * violation quotes the value, a provider client quotes the response body. None
 * of that can be assumed safe, and a stack trace carries the messages of every
 * wrapped cause with it.
 *
 * <p>So the event is constructed rather than captured. {@code describe} is the
 * whole of the privacy boundary and is tested here directly, which is also why
 * it is separate from the transmission: a test that had to mock a static SDK
 * call to find out what leaves would be testing Mockito.
 *
 * <p>What does go is deliberately smaller: the service name and exception class
 * names. Class names are compile-time symbols and cannot contain user data.
 *
 * <p><b>No request-derived identifier is accepted by this reporting contract.</b>
 * A correlation id was sent at first, gated on matching a UUID. That was wrong:
 * {@code CorrelationIdFilter} takes {@code X-Correlation-Id} from the request
 * verbatim when the caller supplies one, so a UUID shape proves only that the
 * caller can format a UUID. It remains in Reverie's own logs and in the HTTP
 * error envelope, and nowhere else.
 */
class SentryErrorReporterTest {

    @Nested
    @DisplayName("what the event may contain")
    class TheEvent {

        @Test
        @DisplayName("the message is generic, never the exception's own")
        void messageIsGeneric() {
            var event = SentryErrorReporter.describe(new IllegalStateException("Transcript segment 'we agreed to acquire Initech' is malformed"));

            assertThat(event.message()).isEqualTo("Unexpected server error");
            assertThat(event.toString()).doesNotContain("Initech");
        }

        @Test
        @DisplayName("the exception type is sent, because a class name is not user data")
        void typeIsSent() {
            var event = SentryErrorReporter.describe(new IllegalStateException("boom"));

            assertThat(event.tags()).containsEntry("exception_type", "java.lang.IllegalStateException");
        }

        @Test
        @DisplayName("the cause's type is sent too, since the outer one is often a wrapper")
        void causeTypeIsSent() {
            var cause = new NumberFormatException("For input string: \"Cindy's meeting\"");
            var event = SentryErrorReporter.describe(new RuntimeException("wrapped", cause));

            assertThat(event.tags()).containsEntry("cause_type", "java.lang.NumberFormatException");
            assertThat(event.toString()).doesNotContain("Cindy");
        }

        @Test
        @DisplayName("no cause tag when there is no cause, rather than a placeholder")
        void noCauseTagWithoutACause() {
            var event = SentryErrorReporter.describe(new IllegalStateException("boom"));

            assertThat(event.tags()).doesNotContainKey("cause_type");
        }

        @Test
        @DisplayName("the service names itself, so three projects cannot be confused")
        void namesTheService() {
            var event = SentryErrorReporter.describe(new RuntimeException());

            assertThat(event.tags()).containsEntry("service", "reverie-backend");
        }

        @Test
        @DisplayName("no message, stack, URL, header or body reaches the tags")
        void nothingElseLeaks() {
            var cause = new IllegalArgumentException("token=sk_live_abcdef user@example.com");
            var error = new RuntimeException("POST /api/v1/meetings/mtg_123?share=secret failed", cause);

            var event = SentryErrorReporter.describe(error);

            String everything = event.toString();
            assertThat(everything).doesNotContain("sk_live_abcdef");
            assertThat(everything).doesNotContain("user@example.com");
            assertThat(everything).doesNotContain("mtg_123");
            assertThat(everything).doesNotContain("secret");
            assertThat(everything).doesNotContain("SentryErrorReporterTest");
            // THE COMPLETE PERMITTED SENTRY TAG VOCABULARY. There is no
            // fourth key, and adding one is a privacy decision that has to be
            // made deliberately, here, in this list.
            assertThat(event.tags()).containsOnlyKeys(
                    "service", "exception_type", "cause_type");
        }

        @Test
        @DisplayName("a null throwable does not become a null tag")
        void survivesANullThrowable() {
            var event = SentryErrorReporter.describe(null);

            assertThat(event.tags()).containsEntry("exception_type", "unknown");
        }
    }

    @Nested
    @DisplayName("a deployment with no DSN")
    class WithoutADsn {

        @Test
        @DisplayName("is a supported state, not a broken one")
        void reportsNothingAndDoesNotThrow() {
            // Every local checkout and every CI run is in this state. It must
            // cost nothing and must not touch the network.
            var reporter = new SentryErrorReporter("", "test");

            assertThat(reporter.isEnabled()).isFalse();
            assertThatCode(() -> reporter.report(new RuntimeException("boom")))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("treats whitespace as absent, so a blank Render value is not a half-configured SDK")
        void blankIsAbsent() {
            assertThat(new SentryErrorReporter("   ", "test").isEnabled()).isFalse();
            assertThat(new SentryErrorReporter(null, "test").isEnabled()).isFalse();
        }

        @Test
        @DisplayName("a malformed DSN disables monitoring rather than failing startup")
        void malformedDsnDoesNotPreventStartup() {
            // Observability is best effort in both directions: it must not
            // report, and it must not be the reason the service will not boot.
            assertThatCode(() -> new SentryErrorReporter("not-a-dsn", "test"))
                    .doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("reporting never becomes the failure")
    class BestEffort {

        @Test
        @DisplayName("an exception inside transmission is swallowed")
        void transmissionFailureIsSwallowed() {
            var reporter = new SentryErrorReporter("", "test") {
                @Override
                void transmit(SafeErrorEvent event) {
                    throw new IllegalStateException("Sentry unreachable");
                }
            };

            assertThatCode(() -> reporter.report(new RuntimeException("boom")))
                    .doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("the event carries only strings")
    class Shape {

        @Test
        @DisplayName("tags are plain values, so nothing can be serialized in by accident")
        void tagsAreStrings() {
            Map<String, String> tags = SentryErrorReporter
                    .describe(new RuntimeException()).tags();

            assertThat(tags.values()).allSatisfy(v -> assertThat(v).isNotBlank());
        }
    }
}
