import { describe, it, expect } from "vitest";
import { inApp, refusalFrom, sessionTask, ssoFailure, taskRefusal } from "@/lib/sso-return";

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

describe("a step Clerk wants that Reverie has no answer to", () => {
  const OURS = "https://reverie.example";

  it("names the organization step, which is the reported one", () => {
    /*
     * Reported: a Google sign-up came back to
     * `/sign-up#/tasks/choose-organization`, which drew the sign-up form again
     * and read as the sign-up having failed. It had not — the account was made.
     * The instance has organizations enabled with force organization selection;
     * Reverie has no organizations at all.
     */
    expect(taskRefusal("/sign-up#/tasks/choose-organization")).toBe(
      "That sign-in needs an organization, and Reverie does not use them.",
    );
  });

  it("reads a task off a path as well as a fragment", () => {
    // Clerk routes these under a hash, and under a path where the surrounding
    // component is path-routed.
    expect(sessionTask("/sign-up#/tasks/choose-organization")).toBe("choose-organization");
    expect(
      sessionTask("https://touching-locust-18.accounts.dev/sign-up/tasks/choose-organization"),
    ).toBe("choose-organization");
  });

  it("stops for a task it has never heard of rather than navigating to it", () => {
    // Whatever it is, this app does not draw it, and a navigation to a screen
    // that does not exist is the loop being fixed.
    expect(taskRefusal("/sign-in#/tasks/some-future-step")).toBeTruthy();
  });

  it("says nothing at all about an ordinary navigation", () => {
    for (const to of ["/home", "/sign-up", "https://reverie.example/welcome", "/meetings/m1"]) {
      expect(sessionTask(to)).toBeNull();
      expect(taskRefusal(to)).toBeNull();
    }
  });

  it("drops a fragment rather than routing to one", () => {
    /*
     * The backstop. Nothing in this app reads a hash, so a route with one
     * behind it is just the sign-up form looking like it failed.
     */
    expect(inApp("/sign-up#/tasks/choose-organization", OURS)).toBe("/sign-up");
    expect(inApp("/#/tasks/choose-organization", OURS)).toBe("/home");
  });
});

describe("reading a failure off Clerk's own resources", () => {
  /*
   * THE BUG THESE EXIST FOR.
   *
   * <p>Cancelling at Google left the callback screen saying "Signing you in"
   * forever. `refusalFrom` was supposed to catch it and could not: the
   * `error=access_denied` Google sends goes to *Clerk's* callback, which
   * consumes it, records it on the verification, and redirects here with a
   * clean query string. Nothing was on the URL to find.
   *
   * <p>And it could not be left to `handleRedirectCallback` either, because
   * `@clerk/nextjs` wraps it as `(params) => clerkjs?.handleRedirectCallback(params)`
   * — one parameter, so the navigate this app passes as the second is
   * dropped, and the returned value is `undefined` rather than the promise.
   * Nothing to await, nothing to catch, no navigation of ours.
   */
  it("reads a cancelled consent screen as a cancellation, with nothing to say", () => {
    /*
     * No message, deliberately. They pressed Cancel and know they did; the
     * callback answers it with the sign-in form rather than a screen about it.
     */
    expect(
      ssoFailure([
        {
          status: "failed",
          error: { code: "oauth_access_denied", longMessage: "The user did not grant access." },
        },
      ]),
    ).toEqual({ kind: "cancelled" });
  });

  it("finds it on the sign-up half as well", () => {
    // A Google *sign-up* records the same refusal on the external account.
    expect(
      ssoFailure([null, { status: "failed", error: { code: "oauth_access_denied" } }]),
    ).toEqual({ kind: "cancelled" });
  });

  it("passes on what the provider actually said, rather than guessing", () => {
    expect(
      ssoFailure([
        {
          status: "failed",
          error: { code: "oauth_email_domain_reserved", longMessage: "That domain is reserved." },
        },
      ]),
    ).toEqual({ kind: "failed", message: "That domain is reserved." });
  });

  it("still says something when there are no words with the code", () => {
    expect(ssoFailure([{ status: "expired", error: { code: "verification_expired" } }])).toEqual({
      kind: "failed",
      message: "Google did not complete that sign-in.",
    });
  });

  it("counts a refusal that never reached a status", () => {
    // `unverified` with an error is a round-trip that came back refused, not a
    // verification that has not started.
    expect(ssoFailure([{ status: "unverified", error: { code: "oauth_access_denied" } }])).toEqual(
      { kind: "cancelled" },
    );
  });

  it("says nothing about a client that has not attempted anything", () => {
    // The ordinary arrival. Claiming a failure here would stop every sign-in.
    expect(ssoFailure([])).toBeNull();
    expect(ssoFailure([null, undefined])).toBeNull();
    expect(ssoFailure([{ status: "unverified" }, { status: "unverified" }])).toBeNull();
    expect(ssoFailure([{ status: "verified" }])).toBeNull();
  });

  it("leaves the two states clerk-js resolves by itself alone", () => {
    /*
     * `external_account_exists` is a sign-in that is really a sign-up, and
     * `identifier_already_signed_in` is an identity already signed in on this
     * browser. Both work. Reporting either as a failure would stop a sign-in
     * that was about to succeed, which is worse than the bug being fixed.
     */
    expect(
      ssoFailure([{ status: "transferable", error: { code: "external_account_exists" } }]),
    ).toBeNull();
    expect(
      ssoFailure([{ status: "failed", error: { code: "identifier_already_signed_in" } }]),
    ).toBeNull();
  });

  it("does not claim a second factor as a failure", () => {
    // The password was right and the verification is through; what is left is
    // another step, not a refusal.
    expect(ssoFailure([{ status: "verified", error: null }])).toBeNull();
  });
});

describe("what the callback says when it did not work", () => {
  it("says nothing when nothing went wrong", () => {
    expect(refusalFrom("")).toBeNull();
    expect(refusalFrom("?__clerk_status=complete")).toBeNull();
  });

  it("names a cancelled consent screen as a cancellation", () => {
    // `access_denied` is what pressing Cancel at Google produces, and a
    // cancellation carries no message: the answer is the form, not a screen.
    expect(refusalFrom("?error=access_denied")).toEqual({ kind: "cancelled" });
  });

  it("passes on what the provider actually said, rather than guessing", () => {
    /*
     * Reporting "you cancelled" over a refused scope or a provider outage tells
     * somebody to retry a thing that will not work.
     */
    expect(
      refusalFrom("?error=invalid_scope&error_description=Scope%20not%20permitted"),
    ).toEqual({ kind: "failed", message: "Scope not permitted" });
  });

  it("still says something when the provider gave a code and no words", () => {
    expect(refusalFrom("?error=server_error")).toEqual({
      kind: "failed",
      message: "Google did not complete that sign-in.",
    });
  });
});
