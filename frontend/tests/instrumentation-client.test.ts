import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
}));

vi.mock("@sentry/browser", () => ({
  init: sentry.init,
}));

describe("browser Sentry initialization", () => {
  const ORIGINAL_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

  beforeEach(() => {
    vi.resetModules();
    sentry.init.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_DSN === undefined) {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    } else {
      process.env.NEXT_PUBLIC_SENTRY_DSN = ORIGINAL_DSN;
    }

    vi.restoreAllMocks();
  });

  it("is disabled when no DSN is configured", async () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    await import("@/instrumentation-client");

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: undefined,
        enabled: false,
      }),
    );
  });

  it("enables only privacy-restricted error reporting when configured", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      "https://public@example.ingest.sentry.io/123";

    await import("@/instrumentation-client");

    expect(sentry.init).toHaveBeenCalledWith({
      dsn: "https://public@example.ingest.sentry.io/123",
      enabled: true,
      sendDefaultPii: false,
      defaultIntegrations: false,
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      attachStacktrace: false,
    });
  });
});
