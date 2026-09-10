import { describe, it, expect, vi } from "vitest";
import { signOutAndLeave } from "@/lib/sign-out";

/**
 * That signing out ends somewhere else.
 *
 * <h2>The bug these exist for</h2>
 *
 * <p>Deleting an account left somebody on the Settings page of an account that
 * no longer existed, until they refreshed by hand — and the refresh went to the
 * sign-in form, because the middleware decided where to send them rather than
 * the app.
 *
 * <p>The cause is one line of clerk-js: `signOut` returns immediately when the
 * client has no sessions left, which is exactly what destroying the identity
 * leaves behind. No revoke, no rejection, no navigation, nothing to catch. The
 * first test below is that shape of `signOut`, and it is the reported case.
 */
describe("leaving", () => {
  it("leaves when Clerk does nothing at all", async () => {
    /*
     * THE REPORTED CASE. `clerk.signOut` opens with
     * `if (!this.client || this.client.sessions.length === 0) return;` — so
     * after `user.delete()` it resolves without touching the callback it was
     * given and without navigating anywhere.
     */
    const navigate = vi.fn();
    const doesNothing = vi.fn(async () => undefined);

    await signOutAndLeave(doesNothing, "/sign-up", navigate);

    expect(navigate).toHaveBeenCalledWith("/sign-up");
  });

  it("leaves once when Clerk does call the callback", async () => {
    // The ordinary sign-out: there is a session, it is revoked, and clerk-js
    // awaits the callback in place of its own navigation.
    const navigate = vi.fn();
    const revokes = vi.fn(async (callback: () => void) => {
      callback();
    });

    await signOutAndLeave(revokes, "/sign-in", navigate);

    // Twice would be a second document load of the page just loaded.
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/sign-in");
  });

  it("leaves when the revoke fails", async () => {
    /*
     * Somebody who asked to leave leaves. A sign-out that silently keeps you
     * signed in on a shared machine is worse than one that fails loudly.
     */
    const navigate = vi.fn();
    const fails = vi.fn(async () => {
      throw new Error("network");
    });

    await expect(signOutAndLeave(fails, "/sign-in", navigate)).resolves.toBeUndefined();
    expect(navigate).toHaveBeenCalledWith("/sign-in");
  });

  it("still revokes rather than only navigating", async () => {
    // The navigation is the half that was missing, not a replacement for
    // ending the session.
    const signOut = vi.fn(async () => undefined);

    await signOutAndLeave(signOut, "/sign-in", vi.fn());

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("hands Clerk a callback rather than a URL to navigate to", async () => {
    /*
     * Given a function clerk-js awaits it instead of navigating, which is what
     * keeps this to one navigation. Passing `redirectUrl` instead would leave
     * clerk-js navigating as well, and on the deleted-account path it would
     * not navigate at all.
     */
    const signOut = vi.fn<(callback: () => void) => Promise<void>>(async () => undefined);

    await signOutAndLeave(signOut, "/sign-up", vi.fn());

    expect(typeof signOut.mock.calls[0][0]).toBe("function");
  });
});
