package com.reverie.observability;

/**
 * Where an unexpected server fault is announced to whoever is on call.
 *
 * <p>An interface rather than a direct Sentry call in the exception handler, for
 * two reasons. The handler's job is to turn a fault into an HTTP response, and
 * that job must not acquire a network dependency it can fail on. And the thing
 * that decides <em>what</em> may be transmitted is a privacy decision that
 * deserves its own place to live and its own tests — see
 * {@link SentryErrorReporter#describe}.
 *
 * <p>Implementations must be silent about their own failures. Monitoring is
 * best effort: a reporter that throws would replace a considered 500 with an
 * unconsidered one, which is worse than not reporting at all.
 */
public interface UnexpectedErrorReporter {

    /**
     * Announce a fault. Never throws, whatever happens inside.
     *
     * @param error the exception that reached the last-resort handler. What, if
     *     anything, is derived from it is entirely the implementation's choice;
     *     callers must not assume it is transmitted.
     */
    void report(Throwable error);

    /**
     * A reporter for deployments with no monitoring configured.
     *
     * <p>The absence of a DSN is an ordinary, supported state — every local
     * checkout and every test runs in it — so it is represented by a working
     * object rather than by a null that every call site has to remember.
     */
    UnexpectedErrorReporter NONE = error -> { };
}
