package com.reverie.observability;

import io.sentry.Sentry;
import io.sentry.SentryLevel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Tells Sentry that something broke, and deliberately does not tell it what.
 *
 * <h2>Why the exception is not captured</h2>
 *
 * <p>This service throws from code holding meeting transcripts, chat questions,
 * summaries and action items. An exception message is an arbitrary string built
 * by whatever failed: a JSON parse error quotes the document, a constraint
 * violation quotes the value, an HTTP client quotes the response body. None of
 * that is safe by assumption, and a stack trace carries the message of every
 * wrapped cause along with it. So {@code captureException} is not used
 * anywhere; the event is built by {@link #describe} from a fixed list of fields.
 *
 * <p>The cost is real and worth naming: Sentry cannot tell you what went wrong,
 * only that something did and of which type. It cannot even tell you which
 * request, deliberately — see {@link #describe}. The full stack is in this
 * server's own log, on infrastructure Reverie controls, found by time and by
 * exception type. Sentry is the pager; the log is the evidence.
 *
 * <h2>Why the core SDK and not the Spring starter</h2>
 *
 * <p>{@code sentry-spring-boot-starter} auto-instruments Spring MVC and would
 * attach request metadata — the URL with its query string, headers, and with
 * PII enabled the caller's address — to every event. That is the boundary this
 * class exists to hold, so the auto-instrumentation is not installed at all
 * rather than installed and then filtered.
 *
 * <h2>Best effort, in both directions</h2>
 *
 * <p>No DSN is the ordinary state of every local checkout and every CI run, and
 * costs nothing. A malformed DSN disables monitoring rather than preventing
 * startup, and a transmission failure is swallowed — a reporter that threw
 * would replace a considered 500 with an unconsidered one.
 */
@Component
public class SentryErrorReporter implements UnexpectedErrorReporter {

    private static final Logger log = LoggerFactory.getLogger(SentryErrorReporter.class);

    /** Which of the three Sentry projects this is. */
    private static final String SERVICE = "reverie-backend";

    /** The fixed label. Deliberately says nothing about the failure. */
    private static final String MESSAGE = "Unexpected server error";

    private final boolean enabled;

    public SentryErrorReporter(@Value("${sentry.dsn:}") String dsn,
                               @Value("${sentry.environment:development}") String environment) {
        String configured = dsn == null ? "" : dsn.trim();
        if (configured.isEmpty()) {
            this.enabled = false;
            log.info("SENTRY_DSN is not set; backend error monitoring is off.");
            return;
        }
        this.enabled = initialise(configured, environment);
    }

    /**
     * Configure the SDK explicitly and narrowly.
     *
     * <p>Every option below is set rather than left to a default, because the
     * defaults are chosen for products that are not holding somebody's meeting.
     * The DSN is never logged.
     *
     * @return whether monitoring is on — false when the SDK refused the
     *     configuration, which must not stop the service from serving requests
     */
    private static boolean initialise(String dsn, String environment) {
        try {
            Sentry.init(options -> {
                options.setDsn(dsn);
                options.setEnvironment(environment);

                // No automatic personal data: no caller address, no user.
                options.setSendDefaultPii(false);

                // Errors only. Tracing and profiling sample request timings and
                // call stacks across the whole application, which is a far
                // wider surface than the one event this class sends.
                options.setTracesSampleRate(0.0);
                options.setProfilesSampleRate(0.0);

                // The JVM's uncaught-exception handler would capture the raw
                // throwable -- message, stack and every wrapped cause --
                // bypassing `describe` entirely. It is the single most
                // important switch in this method.
                options.setEnableUncaughtExceptionHandler(false);

                // A manually reported message must not acquire a synthetic
                // stack trace or a thread dump on the way out.
                options.setAttachStacktrace(false);
                options.setAttachThreads(false);

                // Hostnames are infrastructure detail Reverie has no reason to
                // export; on Render they are container identifiers.
                options.setAttachServerName(false);

                // Dependency/version inventory is infrastructure detail, not needed for paging.
                options.setSendModules(false);

                // Nothing writes breadcrumbs, and a zero ceiling means nothing
                // can start to without this being reconsidered.
                options.setMaxBreadcrumbs(0);
                options.setEnableAutoSessionTracking(false);
            });
            log.info("Backend error monitoring is on (environment={}).", environment);
            return true;
        } catch (Throwable t) {
            // Including Errors. Monitoring must never be the reason a
            // deployment will not boot.
            log.warn("Sentry could not be initialised ({}); backend error monitoring is off.",
                    t.getClass().getSimpleName());
            return false;
        }
    }

    public boolean isEnabled() {
        return enabled;
    }

    @Override
    public void report(Throwable error) {
        try {
            transmit(describe(error));
        } catch (Throwable ignored) {
            // Monitoring is best effort. Whatever happened here, the caller is
            // in the middle of turning a fault into an HTTP response and must
            // be allowed to finish doing that.
        }
    }

    /**
     * Hand the finished event to the SDK.
     *
     * <p>Package-private and overridable so a test can prove that a failure in
     * here cannot escape {@link #report}. It is also the only method in this
     * class that touches Sentry, which keeps {@link #describe} testable without
     * an SDK at all.
     */
    void transmit(SafeErrorEvent event) {
        if (!enabled) {
            return;
        }
        Sentry.withScope(scope -> {
            scope.setLevel(SentryLevel.ERROR);
            event.tags().forEach(scope::setTag);
            Sentry.captureMessage(event.message());
        });
    }

    /**
     * Build the event. <b>This method is the privacy boundary.</b>
     *
     * <p>Nothing derived from the exception's message, its stack, the request or
     * application state appears in the result. What does:
     *
     * <ul>
     *   <li>the exception's class name, and its cause's — compile-time symbols,
     *       which cannot contain user data and carry most of the triage value;</li>
     * </ul>
     *
     * <p><b>Nothing request-derived is accepted at all</b>, including a
     * correlation id. {@code CorrelationIdFilter} takes {@code X-Correlation-Id}
     * from the request verbatim when the caller sends one and only generates a
     * UUID when they do not — so a UUID <em>shape</em> proves nothing about
     * where the value came from, and a caller can put whatever they like in a
     * tag simply by sending a well-formed one. Matching the shape looked like a
     * check and was not one.
     *
     * <p>So the contract takes a {@link Throwable} and nothing else. Correlation
     * ids stay in Reverie's own logs and in the HTTP error envelope, where the
     * caller seeing their own value is the entire point. Dropping it also keeps
     * this telemetry low-cardinality, which is what makes an alert aggregate
     * into "this is happening a lot" rather than into thousands of singletons.
     */
    static SafeErrorEvent describe(Throwable error) {
        Map<String, String> tags = new LinkedHashMap<>();
        tags.put("service", SERVICE);
        tags.put("exception_type", error == null ? "unknown" : error.getClass().getName());

        Throwable cause = error == null ? null : error.getCause();
        if (cause != null && cause != error) {
            // The outer throwable is frequently a wrapper -- an
            // UndeclaredThrowableException, a CompletionException -- and on its
            // own says nothing about what actually failed.
            tags.put("cause_type", cause.getClass().getName());
        }

        return new SafeErrorEvent(MESSAGE, Map.copyOf(tags));
    }
}
