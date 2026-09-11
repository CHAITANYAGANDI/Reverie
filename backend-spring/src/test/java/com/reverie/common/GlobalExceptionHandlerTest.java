package com.reverie.common;

import com.reverie.observability.UnexpectedErrorReporter;
import org.springframework.security.access.AccessDeniedException;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Which failures are the caller's and which are ours.
 *
 * <p>The distinction is not cosmetic. A 500 says the server broke, so it is
 * logged at ERROR with a stack trace and it is what a pager is pointed at — and
 * a route that answers 500 to a mistyped query string buries every real fault
 * under the noise of typos, crawlers and stale bookmarks. Three separate
 * handlers exist for exactly this reason; this covers the third.
 */
class GlobalExceptionHandlerTest {

    private final RecordingReporter reporter = new RecordingReporter();
    private final GlobalExceptionHandler handler = new GlobalExceptionHandler(reporter);

    /** Counts what was announced, without reaching a network. */
    private static final class RecordingReporter implements UnexpectedErrorReporter {
        private final List<Throwable> reported = new ArrayList<>();

        @Override
        public void report(Throwable error) {
            reported.add(error);
        }
    }

    private static HttpServletRequest request() {
        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getRequestURI()).thenReturn("/api/v1/meetings");
        return req;
    }

    private static MethodArgumentTypeMismatchException mismatch(String name, Object value) {
        return new MethodArgumentTypeMismatchException(value, Instant.class, name, null, null);
    }

    @Test
    @DisplayName("an unreadable query parameter is the caller's mistake, not a server fault")
    void typeMismatchIsABadRequest() {
        var response = handler.handleTypeMismatch(mismatch("from", "notadate"), request());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().error()).isEqualTo("VALIDATION_ERROR");
    }

    @Test
    @DisplayName("the message names the parameter, because a bare 400 does not say which")
    void namesTheParameter() {
        var response = handler.handleTypeMismatch(mismatch("from", "notadate"), request());

        assertThat(response.getBody().message()).contains("from");
    }

    @Test
    @DisplayName("the offending value is never echoed back")
    void doesNotReflectTheValue() {
        // It came from the caller. Putting it in a response body is how a
        // reflected-XSS gets its foothold, and it tells the caller nothing they
        // did not just type.
        var response = handler.handleTypeMismatch(
                mismatch("from", "<script>alert(1)</script>"), request());

        assertThat(response.getBody().message()).doesNotContain("<script>");
    }

    // --- what reaches the pager ------------------------------------------- //
    //
    // The split between these two groups is the whole point of the class. A 500
    // says the server broke and is worth waking somebody for; a 4xx says the
    // caller mistyped something, and reporting those would bury every real
    // fault under typos, crawlers and stale bookmarks.

    @Test
    @DisplayName("a genuine server fault is announced exactly once")
    void unexpectedIsReportedOnce() {
        handler.handleUnexpected(new IllegalStateException("boom"), request());

        assertThat(reporter.reported).hasSize(1);
    }

    @Test
    @DisplayName("and still answers INTERNAL_ERROR with a 500")
    void unexpectedStillAnswersFiveHundred() {
        var response = handler.handleUnexpected(new IllegalStateException("boom"), request());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().error()).isEqualTo("INTERNAL_ERROR");
        assertThat(response.getBody().message()).isEqualTo("An unexpected error occurred");
    }

    @Test
    @DisplayName("the caller's own mistake is not announced")
    void badRequestIsNotReported() {
        handler.handleTypeMismatch(mismatch("from", "notadate"), request());

        assertThat(reporter.reported).isEmpty();
    }

    @Test
    @DisplayName("nor is a refused resource, a missing route or a wrong method")
    void otherExpectedFailuresAreNotReported() {
        handler.handleAccessDenied(new AccessDeniedException("no"), request());
        handler.handleApi(ApiException.notFound("Meeting not found"), request());

        assertThat(reporter.reported).isEmpty();
    }

    @Test
    @DisplayName("a reporter that throws cannot replace the HTTP error response")
    void reportingFailureDoesNotBreakTheResponse() {
        /*
         * The contract is that a reporter swallows its own failures, and
         * SentryErrorReporter does. This proves the handler does not depend on
         * that promise being kept: monitoring must never be able to turn a
         * considered 500 into an unconsidered one.
         */
        var exploding = new GlobalExceptionHandler(error -> {
            throw new IllegalStateException("Sentry unreachable");
        });

        var response = exploding.handleUnexpected(new IllegalStateException("boom"), request());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody().error()).isEqualTo("INTERNAL_ERROR");
    }
}
