import * as Sentry from "@sentry/browser";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * Browser-side Sentry is deliberately narrow.
 *
 * Reverie handles meeting transcripts, recordings and questions, so Sentry is
 * not allowed to install global exception handlers, collect breadcrumbs,
 * record sessions or trace navigation. The application's existing
 * `reportError` seam decides explicitly what is safe to report.
 *
 * An absent DSN is the normal local-development state and must be harmless.
 */
Sentry.init({
  dsn,
  enabled: Boolean(dsn),

  // Never attach user/IP information automatically.
  sendDefaultPii: false,

  // No global onerror/unhandled-rejection capture, breadcrumbs or automatic
  // browser instrumentation. Reverie reports only explicitly sanitized events.
  defaultIntegrations: false,

  // Error tracking only for the initial production integration.
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // A manually reported message must not acquire a synthetic stack trace.
  attachStacktrace: false,
});
