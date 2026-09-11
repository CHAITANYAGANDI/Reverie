import * as Sentry from "@sentry/browser";

/**
 * Where an unexpected frontend exception goes.
 *
 * <h2>Privacy boundary</h2>
 *
 * <p>Reverie handles meeting transcripts, recordings and the questions people
 * ask about them. Error reporting therefore cannot forward an exception object
 * wholesale: messages, stacks, URLs and application state can contain user
 * content or identifiers.
 *
 * <p>All external reporting passes through this function. The payload is
 * deliberately reduced to a fixed set of safe fields: a generic error label,
 * Next digest, fault boundary and normalized route shape. No raw exception
 * message or stack, request or response bodies, query strings, tokens,
 * resource ids or user content are sent to the observability provider.
 *
 * <p>Sentry is the production error reporter. It receives only the sanitized
 * values constructed here.
 *
 * <p>The browser console deliberately keeps the original exception. That is a
 * local diagnostic visible to the person running the browser rather than data
 * exported to an observability provider.
 */

/**
 * The fixed shape allowed to leave the browser.
 *
 * Widening this interface is a privacy decision, not a convenience one.
 */
export interface ErrorReport {
  /**
   * Deliberately generic. Exception messages can contain transcript text,
   * titles, API responses or other user-derived content.
   */
  message: string;

  /** Next's build-time hash for a server-rendered error, when there is one. */
  digest?: string;

  /** Which fault boundary caught it, e.g. "app-shell" or "root-layout". */
  boundary: string;

  /** Normalized route shape, never ids or query strings. */
  path?: string;
}

/**
 * Return a privacy-safe route shape.
 *
 * Concrete resource ids, optional route parameters and query strings must
 * never leave the browser through observability.
 */
function safePath(): string | undefined {
  if (typeof window === "undefined") return undefined;

  const pathname = window.location.pathname;

  // Dynamic resource ids are useful to Reverie but not to an external
  // observability provider. Report the route shape instead.
  if (/^\/meetings\/[^/]+\/?$/.test(pathname)) {
    return "/meetings/[id]";
  }

  if (/^\/folder\/[^/]+\/?$/.test(pathname)) {
    return "/folder/[id]";
  }

  // Optional catch-all routes can contain arbitrary path segments. Collapse
  // them to their Next route shape so none of those values leave the browser.
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "/settings/[[...tab]]";
  }

  if (pathname === "/sign-in" || pathname.startsWith("/sign-in/")) {
    return "/sign-in/[[...sign-in]]";
  }

  if (pathname === "/sign-up" || pathname.startsWith("/sign-up/")) {
    return "/sign-up/[[...sign-up]]";
  }

  // `pathname` only. Never `href`: query strings can contain timestamps,
  // return paths or capability-bearing share tokens.
  return pathname;
}

export function reportError(
  error: Error & { digest?: string },
  boundary: string,
): void {
  const report: ErrorReport = {
    message: "Unexpected error",
    digest: error?.digest,
    boundary,
    path: safePath(),
  };

  // Keep the real exception locally for debugging. It must not be copied into
  // the external telemetry payload below.
  console.error(
    `[reverie:${boundary}]`,
    error?.message ?? "Unknown error",
    error,
  );

  // Sentry receives only the sanitized report constructed above.
  //
  // `captureMessage` is intentional. `captureException(error)` would hand
  // Sentry the original exception message and stack that this privacy boundary
  // exists specifically to withhold.
  try {
    Sentry.captureMessage(report.message, {
      level: "error",
      tags: {
        boundary: report.boundary,
        ...(report.path ? { route: report.path } : {}),
        ...(report.digest ? { digest: report.digest } : {}),
      },
    });
  } catch {
    // Observability is best effort. A monitoring failure must never interfere
    // with Reverie's own error boundary or replace it with another failure.
  }
}
