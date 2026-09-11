import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureMessage: vi.fn(),
}));

vi.mock("@sentry/browser", () => ({
  captureMessage: sentry.captureMessage,
}));

describe("error reporting", () => {
  beforeEach(() => {
    vi.resetModules();
    sentry.captureMessage.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function load() {
    return import("@/lib/observability");
  }

  it("still writes the original failure to the local console", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("local diagnostic");

    const { reportError } = await load();
    reportError(error, "app-shell");

    expect(logged).toHaveBeenCalledWith(
      "[reverie:app-shell]",
      "local diagnostic",
      error,
    );
  });

  it("hands only sanitized metadata to Sentry", async () => {
    window.history.replaceState(
      {},
      "",
      "/meetings/mtg_private_789?share=secret-token",
    );

    const { reportError } = await load();

    const error = Object.assign(new Error("CONFIDENTIAL transcript fragment"), {
      digest: "digest-123",
    });

    reportError(error, "app-shell");

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);

    expect(sentry.captureMessage).toHaveBeenCalledWith("Unexpected error", {
      level: "error",
      tags: {
        boundary: "app-shell",
        route: "/meetings/[id]",
        digest: "digest-123",
      },
    });

    const sent = JSON.stringify(sentry.captureMessage.mock.calls);

    expect(sent).not.toContain("CONFIDENTIAL transcript fragment");
    expect(sent).not.toContain("mtg_private_789");
    expect(sent).not.toContain("secret-token");
  });

  it("redacts meeting identifiers and query strings", async () => {
    window.history.replaceState(
      {},
      "",
      "/meetings/mtg_super_secret_123?t=420&share=secret-token",
    );

    const { reportError } = await load();
    reportError(new Error("boom"), "app-shell");

    expect(sentry.captureMessage).toHaveBeenCalledWith("Unexpected error", {
      level: "error",
      tags: {
        boundary: "app-shell",
        route: "/meetings/[id]",
      },
    });

    const sent = JSON.stringify(sentry.captureMessage.mock.calls);

    expect(sent).not.toContain("mtg_super_secret_123");
    expect(sent).not.toContain("secret-token");
    expect(sent).not.toContain("t=420");
  });

  it("redacts folder identifiers", async () => {
    window.history.replaceState({}, "", "/folder/prj_private_456");

    const { reportError } = await load();
    reportError(new Error("boom"), "app-shell");

    expect(sentry.captureMessage).toHaveBeenCalledWith("Unexpected error", {
      level: "error",
      tags: {
        boundary: "app-shell",
        route: "/folder/[id]",
      },
    });

    expect(JSON.stringify(sentry.captureMessage.mock.calls)).not.toContain(
      "prj_private_456",
    );
  });

  it("normalizes settings catch-all routes", async () => {
    window.history.replaceState({}, "", "/settings/privacy");

    const { reportError } = await load();
    reportError(new Error("boom"), "app-shell");

    expect(sentry.captureMessage).toHaveBeenCalledWith("Unexpected error", {
      level: "error",
      tags: {
        boundary: "app-shell",
        route: "/settings/[[...tab]]",
      },
    });
  });

  it("normalizes sign-in catch-all routes", async () => {
    window.history.replaceState({}, "", "/sign-in/sso-callback");

    const { reportError } = await load();
    reportError(new Error("boom"), "root-layout");

    expect(sentry.captureMessage).toHaveBeenCalledWith("Unexpected error", {
      level: "error",
      tags: {
        boundary: "root-layout",
        route: "/sign-in/[[...sign-in]]",
      },
    });
  });

  it("normalizes sign-up catch-all routes", async () => {
    window.history.replaceState({}, "", "/sign-up/verify-email");

    const { reportError } = await load();
    reportError(new Error("boom"), "app-shell");

    expect(sentry.captureMessage).toHaveBeenCalledWith("Unexpected error", {
      level: "error",
      tags: {
        boundary: "app-shell",
        route: "/sign-up/[[...sign-up]]",
      },
    });
  });

  it("does not send raw exception message or stack", async () => {
    const secret = "CONFIDENTIAL transcript fragment";

    const error = new Error(`Failed while processing: ${secret}`);

    error.stack =
      `Error: Failed while processing: ${secret}\n` +
      "    at MeetingPage (meeting-page.tsx:42:7)";

    const { reportError } = await load();
    reportError(error, "app-shell");

    const sent = JSON.stringify(sentry.captureMessage.mock.calls);

    expect(sent).not.toContain(secret);
    expect(sent).not.toContain("MeetingPage");
  });

  it("names the fault boundary", async () => {
    const { reportError } = await load();

    reportError(new Error("boom"), "root-layout");

    expect(sentry.captureMessage).toHaveBeenCalledWith("Unexpected error", {
      level: "error",
      tags: {
        boundary: "root-layout",
        route: "/",
      },
    });
  });

  it("does not perform direct HTTP error reporting", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchSpy);

    const { reportError } = await load();
    reportError(new Error("boom"), "app-shell");

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("survives Sentry itself failing", async () => {
    sentry.captureMessage.mockImplementation(() => {
      throw new Error("Sentry unavailable");
    });

    const { reportError } = await load();

    expect(() => reportError(new Error("boom"), "app-shell")).not.toThrow();
  });
});
