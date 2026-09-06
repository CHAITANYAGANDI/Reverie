import { describe, it, expect } from "vitest";
import { inApp, refusalFrom } from "@/lib/sso-return";

/**
 * Where a Google round-trip is allowed to put somebody.
 *
 * <h2>The two bugs these exist for</h2>
 *
 * <p><b>Pressing Cancel stranded people.</b> Google returns to the callback
 * with nothing to exchange, and the screen went on saying "Signing you in"
 * indefinitely. Telling Clerk where the sign-in form was should have been
 * enough and, reported back from the real instance, was not.
 *
 * <p><b>A transferred sign-in left the product.</b> `transferable` defaults to
 * true, so a Google identity with no Clerk user turns a sign-in into a sign-up,
 * and Clerk finished that by navigating to its own hosted sign-up on
 * `accounts.dev` — a different domain wearing a different brand, reached by
 * pressing "Continue with Google" on Reverie's own form.
 *
 * <p>Both are now decided here rather than delegated, which is also what makes
 * them testable without a browser or a Clerk key.
 */
describe("where the callback is allowed to send somebody", () => {
  const OURS = "https://reverie.example";

  it("keeps a Reverie path as it is", () => {
    expect(inApp("/home", OURS)).toBe("/home");
    expect(inApp("/meetings/mtg_1", OURS)).toBe("/meetings/mtg_1");
  });

  it("drops the host from one of our own absolute URLs, query included", () => {
    // The query can carry the page somebody originally asked for.
    expect(inApp(`${OURS}/sign-in?redirect_url=%2Fmeetings%2Fm1`, OURS)).toBe(
      "/sign-in?redirect_url=%2Fmeetings%2Fm1",
    );
  });

  it("brings Clerk's hosted pages back into the product", () => {
    // The reported bug, exactly: "Continue with Google" on Reverie's sign-in
    // form ending on accounts.dev/sign-up.
    expect(inApp("https://touching-locust-18.accounts.dev/sign-up", OURS)).toBe("/sign-up");
    expect(inApp("https://touching-locust-18.accounts.dev/sign-in", OURS)).toBe("/sign-in");
  });

  it("folds the hosted continue-sign-up page back into the product", () => {
    /*
     * Reported: signing up with Google landed on
     * accounts.dev/sign-up/continue — "Fill in missing fields", asking for a
     * username Reverie does not collect. The sign-up is normally finished
     * before anybody gets here; this is the backstop for when it cannot be.
     */
    expect(inApp("https://touching-locust-18.accounts.dev/sign-up/continue", OURS)).toBe(
      "/sign-up",
    );
  });

  it("folds Clerk's sub-steps onto the one screen this app draws", () => {
    // Clerk routes these beneath the form; Reverie has a single sign-in screen
    // that handles its own stages.
    expect(inApp("https://touching-locust-18.accounts.dev/sign-in/factor-one", OURS)).toBe(
      "/sign-in",
    );
    expect(inApp("/sign-up/verify-email-address", OURS)).toBe("/sign-up");
  });

  it("never sends anybody back to the callback, or to a bare portal root", () => {
    // Both are loops rather than destinations.
    expect(inApp("/sso-callback", OURS)).toBe("/home");
    expect(inApp("/sso-callback?after=1", OURS)).toBe("/home");
    expect(inApp("https://touching-locust-18.accounts.dev/", OURS)).toBe("/home");
  });

  it("refuses anything that is not a path on this site", () => {
    /*
     * `//evil.example` is read by a browser as a host, which is how an open
     * redirect gets in — and this value arrives from a third party.
     */
    expect(inApp("//evil.example/steal", OURS)).toBe("/sign-in");
    expect(inApp("javascript:alert(1)", OURS)).toBe("/sign-in");
    expect(inApp("not a url at all", OURS)).toBe("/sign-in");
  });

  it("still answers when the origin is not known", () => {
    // Server-rendered, or called before there is a window to ask.
    expect(inApp("/home")).toBe("/home");
    expect(inApp("https://touching-locust-18.accounts.dev/sign-up")).toBe("/sign-up");
  });
});

describe("what the callback says when it did not work", () => {
  it("says nothing when nothing went wrong", () => {
    expect(refusalFrom("")).toBeNull();
    expect(refusalFrom("?__clerk_status=complete")).toBeNull();
  });

  it("names a cancelled consent screen as a cancellation", () => {
    // `access_denied` is what pressing Cancel at Google produces.
    expect(refusalFrom("?error=access_denied")).toBe("You cancelled that sign-in.");
  });

  it("passes on what the provider actually said, rather than guessing", () => {
    /*
     * Reporting "you cancelled" over a refused scope or a provider outage tells
     * somebody to retry a thing that will not work.
     */
    expect(refusalFrom("?error=invalid_scope&error_description=Scope%20not%20permitted")).toBe(
      "Scope not permitted",
    );
  });

  it("still says something when the provider gave a code and no words", () => {
    expect(refusalFrom("?error=server_error")).toBe("Google did not complete that sign-in.");
  });
});
