import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * What is allowed to leave the browser when something throws.
 *
 * <p>This app holds meeting transcripts, recordings and the questions people
 * ask about them. A reporter that posts "whatever was in scope" is a
 * transcript-exfiltration feature with a support ticket attached, so the shape
 * of the payload is the security property and these tests are about that rather
 * than about delivery.
 *
 * <p>The URL matters as much as the body. Meeting URLs carry ids and share
 * links carry a capability token in the query string; a collector is a third
 * party by definition, and sending it a working share link would be publishing
 * the meeting.
 */
describe("error reporting", () => {
  const ORIGINAL = process.env.NEXT_PUBLIC_ERROR_REPORT_URL;

  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_ERROR_REPORT_URL = ORIGINAL;
    vi.restoreAllMocks();
  });

  async function load() {
    return import("@/lib/observability");
  }

  it("sends nothing at all when no collector is configured", async () => {
    delete process.env.NEXT_PUBLIC_ERROR_REPORT_URL;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { reportError } = await load();
    reportError(new Error("boom"), "app-shell");

    // Running locally with no DSN must be silent, not broken.
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("still writes the failure to the console, so nothing is lost", async () => {
    delete process.env.NEXT_PUBLIC_ERROR_REPORT_URL;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const { reportError } = await load();
    reportError(new Error("boom"), "app-shell");

    // The only diagnostic a deployment with no collector has. A boundary that
    // renders a friendly message and leaves nothing behind is how a bug
    // survives three reports of "it broke".
    expect(logged).toHaveBeenCalled();
  });

  it("sends only the named fields, and never the query string", async () => {
    process.env.NEXT_PUBLIC_ERROR_REPORT_URL =
      "https://collector.example/report";
    const fetchSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchSpy);
    // A share link: the token in the query is a capability, and the path is
    // enough to know which screen broke.
    window.history.replaceState(
      {},
      "",
      "/meetings/mtg_1?t=420&share=secret-token",
    );

    const { reportError } = await load();
    const error = Object.assign(new Error("Cannot read properties of null"), {
      digest: "1234567890",
    });
    reportError(error, "app-shell");

    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as { body: string }).body,
    );
    expect(body.path).toBe("/meetings/[id]");
    expect(JSON.stringify(body)).not.toContain("mtg_1");
    expect(JSON.stringify(body)).not.toContain("secret-token");
    expect(JSON.stringify(body)).not.toContain("t=420");
    expect(Object.keys(body).sort()).toEqual(
      ["boundary", "digest", "message", "path"].sort(),
    );
    vi.unstubAllGlobals();
  });

  it("redacts meeting identifiers from the reported path", async () => {
    process.env.NEXT_PUBLIC_ERROR_REPORT_URL =
      "https://collector.example/report";

    const fetchSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchSpy);

    window.history.replaceState({}, "", "/meetings/mtg_super_secret_123?t=420");

    const { reportError } = await load();
    reportError(new Error("boom"), "app-shell");

    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as { body: string }).body,
    );

    expect(body.path).toBe("/meetings/[id]");
    expect(JSON.stringify(body)).not.toContain("mtg_super_secret_123");

    vi.unstubAllGlobals();
  });

  it("redacts folder identifiers from the reported path", async () => {
    process.env.NEXT_PUBLIC_ERROR_REPORT_URL =
      "https://collector.example/report";

    const fetchSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchSpy);

    window.history.replaceState({}, "", "/folder/prj_private_456");

    const { reportError } = await load();
    reportError(new Error("boom"), "app-shell");

    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as { body: string }).body,
    );

    expect(body.path).toBe("/folder/[id]");
    expect(JSON.stringify(body)).not.toContain("prj_private_456");

    vi.unstubAllGlobals();
  });

  it("normalizes catch-all routes before reporting them", async () => {
    process.env.NEXT_PUBLIC_ERROR_REPORT_URL =
      "https://collector.example/report";

    const fetchSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchSpy);

    window.history.replaceState({}, "", "/settings/privacy");

    const { reportError } = await load();
    reportError(new Error("boom"), "app-shell");

    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as { body: string }).body,
    );

    expect(body.path).toBe("/settings/[[...tab]]");

    vi.unstubAllGlobals();
  });

  it("does not send raw exception text that may contain user content", async () => {
    process.env.NEXT_PUBLIC_ERROR_REPORT_URL =
      "https://collector.example/report";

    const fetchSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchSpy);

    const secret = "CONFIDENTIAL transcript fragment";
    const error = new Error(`Failed while processing: ${secret}`);
    error.stack =
      `Error: Failed while processing: ${secret}\n` +
      "    at MeetingPage (meeting-page.tsx:42:7)";

    const { reportError } = await load();
    reportError(error, "app-shell");

    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as { body: string }).body,
    );

    const serialized = JSON.stringify(body);

    expect(serialized).not.toContain(secret);
    expect(body.message).toBe("Unexpected error");
    expect(body.stack).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("names which boundary caught it", async () => {
    process.env.NEXT_PUBLIC_ERROR_REPORT_URL =
      "https://collector.example/report";
    const fetchSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchSpy);

    const { reportError } = await load();
    reportError(new Error("boom"), "root-layout");

    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as { body: string }).body,
    );
    expect(body.boundary).toBe("root-layout");
    vi.unstubAllGlobals();
  });

  it("survives a collector that is itself broken", async () => {
    // A reporter that throws inside an error handler replaces a rendered error
    // with a blank page, which is strictly worse than losing the report.
    process.env.NEXT_PUBLIC_ERROR_REPORT_URL =
      "https://collector.example/report";
    vi.stubGlobal("fetch", () => {
      throw new Error("network is down");
    });

    const { reportError } = await load();

    expect(() => reportError(new Error("boom"), "app-shell")).not.toThrow();
    vi.unstubAllGlobals();
  });

  it("uses keepalive, so a report survives the navigation after it", async () => {
    process.env.NEXT_PUBLIC_ERROR_REPORT_URL =
      "https://collector.example/report";
    const fetchSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchSpy);

    const { reportError } = await load();
    reportError(new Error("boom"), "app-shell");

    expect(
      (fetchSpy.mock.calls[0][1] as { keepalive: boolean }).keepalive,
    ).toBe(true);
    vi.unstubAllGlobals();
  });
});
