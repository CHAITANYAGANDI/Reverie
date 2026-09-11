/**
 * Where an unexpected exception goes.
 *
 * <h2>Why this exists as a seam rather than as a provider</h2>
 *
 * <p>Reverie has no error-reporting provider. Every one of these failures is
 * currently visible only to the person it happened to, which means a production
 * fault is discovered by a user deciding to mention it — and most do not.
 *
 * <p>What it does not do is pick the provider. Wiring Sentry (or any of them)
 * into three services is a dependency, an account, a DSN and a privacy review,
 * and none of those are decisions to make on somebody's behalf inside a
 * hardening pass. So this is the shape of the thing: one function the app calls
 * at its fault boundaries, configuration-driven, silent and harmless when no
 * destination is set. Dropping `Sentry.captureException` into {@link
 * reportError} is then a two-line change with the call sites already in place.
 *
 * <h2>What must never leave the browser</h2>
 *
 * <p>This app holds meeting transcripts, recordings and the questions people
 * ask about them. A reporter that posts "whatever was in scope" is a
 * transcript-exfiltration feature with a support ticket attached. So the
 * payload is a fixed, named set of fields — message, stack, digest, a
 * coarse location — and nothing derived from application state. No request or
 * response bodies, no query strings, no tokens, no user content.
 *
 * <p>The URL is stripped to its path for the same reason. Meeting URLs carry
 * ids, and share links carry capability tokens in the query string; the path
 * is enough to know which screen broke.
 */

/**
 * The fixed shape of a report. Widening this is a privacy decision, not a
 * convenience one — every field here was chosen against "could this contain a
 * sentence somebody said in a meeting?".
 */
export interface ErrorReport {
  message: string;
  stack?: string;
  /** Next's build-time hash for a server-rendered error, when there is one. */
  digest?: string;
  /** Which fault boundary caught it, e.g. "app-shell" or "root-layout". */
  boundary: string;
  /** Path only, never the query string. */
  path?: string;
}

/** Set to a collector endpoint to turn reporting on. Absent locally, and fine. */
const ENDPOINT = process.env.NEXT_PUBLIC_ERROR_REPORT_URL;

/** The page, with anything identifying or capability-bearing removed. */
function safePath(): string | undefined {
  if (typeof window === "undefined") return undefined;
  // `pathname` only. `href` would carry `?t=` on a meeting and the share token
  // on a public link, and a collector is a third party by definition.
  return window.location.pathname;
}

export function reportError(
  error: Error & { digest?: string },
  boundary: string,
): void {
  const report: ErrorReport = {
    message: error?.message ?? "Unknown error",
    stack: error?.stack,
    digest: error?.digest,
    boundary,
    path: safePath(),
  };

  // Always. The console is the only diagnostic a self-hosted deployment with no
  // collector has, and an error boundary that renders a friendly message and
  // leaves nothing behind is how a bug survives three reports of "it broke".
  console.error(`[reverie:${boundary}]`, report.message, report);

  if (!ENDPOINT) return;

  try {
    // `keepalive` because a fault boundary is often followed by a navigation,
    // and a normal fetch is cancelled by it -- losing exactly the reports worth
    // having. Failures here are swallowed: a reporter that throws inside an
    // error handler replaces a rendered error with a blank page.
    void fetch(ENDPOINT, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    }).catch(() => {});
  } catch {
    /* reporting is best effort, always */
  }
}
