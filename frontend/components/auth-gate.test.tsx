import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Nothing authenticated renders before there is a token to authenticate with.
 *
 * <h2>The first bug</h2>
 *
 * <p>A hard refresh brought the app up with empty panels and errors behind
 * them; refreshing again usually fixed it. Every request in that first pass had
 * gone out with no `Authorization` header and come back 401. The cause was
 * ordering: `ClerkBridge` registers the token getter in an effect, effects run
 * after the subtree below has mounted, and RTK Query hooks fire on mount.
 *
 * <h2>The second bug, which these tests are now about</h2>
 *
 * <p>Holding the subtree back until the getter existed left a narrower version
 * of the same race. `tokenGetter !== null && isLoaded` says nothing about
 * anybody being signed in — this component's provider wraps `/` and `/sign-in`
 * too, so both halves were already true while the visitor was signed out. The
 * gate therefore opened in the same commit that a completed sign-in redirected
 * into `/home`, ahead of Clerk adopting the session, and roughly a dozen hooks
 * sent uncredentialed requests.
 *
 * <p>So the gate now reads one thing: has a token for the session the browser
 * is in <em>right now</em> actually been obtained. The machine behind that
 * answer is asserted in lib/auth-store.test; this file asserts that the gate
 * obeys it, and that nothing renders in the four states that are not ready.
 *
 * <p>These run in clerk mode, which is the default when `NEXT_PUBLIC_AUTH_MODE`
 * is unset (it fails closed — see auth-store).
 */

import * as React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthGate } from "@/components/auth-gate";
import {
  authStore,
  setTokenGetter,
  publishAuthState,
  resolveTokenProbe,
  claimApiCache,
  resetAuthReadiness,
  isAuthReady,
  authPhase,
  tokenProbeAttempt,
  buildAuthHeaders,
  type TokenStatus,
} from "@/lib/auth-store";
import { forgetAccountRefusal, markAccountRefusal } from "@/lib/account-refused";

/*
 * The refusal screen is the one state with an action that leaves, so it is the
 * one state that reads the auth context. Mocked rather than wrapped in a real
 * provider: what is asserted is where it sends somebody, and a real provider
 * would put Clerk in the middle of that question.
 */
const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ signOut }),
}));

/** Counts renders, standing in for any component that queries on mount. */
const childRendered = vi.fn();

function QueryingChild() {
  childRendered();
  return <div>workspace</div>;
}

function renderGate() {
  return render(
    <AuthGate>
      <QueryingChild />
    </AuthGate>,
  );
}

/**
 * Everything the gate requires: a credential for this session, and an API cache
 * this session owns. Both, because either alone is a state the app must not
 * open in.
 */
function fullyReady(sessionId = "sess_1") {
  act(() => {
    setTokenGetter(async () => "tok_123");
    publishAuthState({ sessionId, phase: "preparing-session" });
    resolveTokenProbe(sessionId, true);
    claimApiCache(sessionId);
  });
}

describe("AuthGate", () => {
  beforeEach(() => {
    childRendered.mockClear();
    signOut.mockClear();
    authStore.mode = "clerk";
    setTokenGetter(null);
    resetAuthReadiness();
    // A module store, so it outlives an unmount and would otherwise decide
    // every test that ran after the refusal ones.
    forgetAccountRefusal();
  });

  it("is in clerk mode, so the race is real", () => {
    expect(authStore.mode).toBe("clerk");
  });

  it("does not mount the authenticated subtree before Clerk has loaded", () => {
    renderGate();

    expect(screen.queryByText("workspace")).toBeNull();
    expect(childRendered).not.toHaveBeenCalled();
  });

  it("does not mount the authenticated subtree while nobody is signed in", () => {
    // The state the old gate could not see. `ClerkBridge` is mounted on
    // `/sign-in` as well, so this is where a visitor sits while typing a
    // password — and the old condition was fully satisfied here.
    act(() => {
      setTokenGetter(async () => "tok_123");
      publishAuthState({ sessionId: null, phase: "signed-out" });
    });

    renderGate();

    expect(screen.queryByText("workspace")).toBeNull();
  });

  it("does not mount while the token for this session is still being fetched", () => {
    // Signed in, getter registered, request in flight. This is the exact
    // instant the first authenticated navigation after a sign-in used to open
    // the whole application in.
    act(() => {
      setTokenGetter(async () => "tok_123");
      publishAuthState({ sessionId: "sess_1", phase: "preparing-session" });
    });

    renderGate();

    expect(screen.queryByText("workspace")).toBeNull();
  });

  it("does not mount when the token came back empty", () => {
    act(() => {
      setTokenGetter(async () => null);
      publishAuthState({ sessionId: "sess_1", phase: "preparing-session" });
      resolveTokenProbe("sess_1", false);
    });

    renderGate();

    expect(screen.queryByText("workspace")).toBeNull();
  });

  it.each<TokenStatus>(["loading", "signed-out", "preparing-session", "failed"])(
    "refuses to mount in the %s phase",
    (phase) => {
      act(() => {
        setTokenGetter(async () => "tok_123");
        publishAuthState({ sessionId: "sess_1", phase });
      });

      renderGate();

      expect(screen.queryByText("workspace")).toBeNull();
    },
  );

  it("does not mount on a proven token while the cache is another session's", () => {
    /*
     * THE remaining race. Clerk has a credential for this session and the store
     * is still full of the previous one's meetings, folders and usage -- every
     * cache key here is endpoint + argument with no user in it, so the first
     * request is a hit on the old entry. This is the state the app used to
     * mount in, and the state a manual refresh was curing.
     */
    act(() => {
      setTokenGetter(async () => "tok_123");
      publishAuthState({ sessionId: "sess_B", phase: "preparing-session" });
      resolveTokenProbe("sess_B", true);
    });

    renderGate();

    expect(screen.queryByText("workspace")).toBeNull();
  });

  it("does not mount on an owned cache while the token is still being fetched", () => {
    act(() => {
      publishAuthState({ sessionId: "sess_B", phase: "preparing-session" });
      claimApiCache("sess_B");
    });

    renderGate();

    expect(screen.queryByText("workspace")).toBeNull();
  });

  it("mounts once the token is proven and the cache is this session's", () => {
    fullyReady();

    renderGate();

    expect(screen.getByText("workspace")).toBeInTheDocument();
    expect(childRendered).toHaveBeenCalledTimes(1);
  });

  it("lets children in the moment readiness arrives, without a remount", () => {
    // Not a remount: the subtree that appears is the same one that stays, so a
    // hook does not fire, unmount and fire again.
    renderGate();
    expect(childRendered).not.toHaveBeenCalled();

    fullyReady();

    expect(screen.getByText("workspace")).toBeInTheDocument();
    expect(childRendered).toHaveBeenCalledTimes(1);
  });

  it("follows the whole sign-in, and mounts only at the end of it", () => {
    /*
     * The production sequence, in order:
     *   loaded + signed out  ->  signed in, session known  ->  token in hand.
     * Nothing authenticated may exist for the first two.
     */
    renderGate();
    const seenAt: Record<string, number> = {};

    act(() => {
      publishAuthState({ sessionId: null, phase: "signed-out" });
    });
    seenAt["signed-out"] = childRendered.mock.calls.length;

    act(() => {
      setTokenGetter(async () => "tok_123");
      publishAuthState({ sessionId: "sess_1", phase: "preparing-session" });
    });
    seenAt["preparing-session"] = childRendered.mock.calls.length;

    act(() => {
      resolveTokenProbe("sess_1", true);
    });
    seenAt["token-ready"] = childRendered.mock.calls.length;

    act(() => {
      claimApiCache("sess_1");
    });
    seenAt["app-ready"] = childRendered.mock.calls.length;

    expect(seenAt).toEqual({
      "signed-out": 0,
      "preparing-session": 0,
      "token-ready": 0,
      "app-ready": 1,
    });
  });

  it("closes again when the session ends under an open page", () => {
    fullyReady();
    renderGate();
    expect(screen.getByText("workspace")).toBeInTheDocument();

    act(() => {
      publishAuthState({ sessionId: null, phase: "signed-out" });
    });

    expect(screen.queryByText("workspace")).toBeNull();
  });

  it("closes when the session changes, until the new one is proven", () => {
    fullyReady("sess_A");
    renderGate();

    act(() => {
      publishAuthState({ sessionId: "sess_B", phase: "preparing-session" });
    });
    expect(screen.queryByText("workspace")).toBeNull();

    act(() => {
      resolveTokenProbe("sess_B", true);
      claimApiCache("sess_B");
    });
    expect(screen.getByText("workspace")).toBeInTheDocument();
  });

  it("is not opened for one session by another session's late answer", () => {
    // Session A's `getToken()` resolving after B is current says nothing about
    // B. Opening the app here would put B in front of A's credential.
    renderGate();
    act(() => {
      publishAuthState({ sessionId: "sess_A", phase: "preparing-session" });
      publishAuthState({ sessionId: "sess_B", phase: "preparing-session" });
      resolveTokenProbe("sess_A", true);
      claimApiCache("sess_A");
    });

    expect(screen.queryByText("workspace")).toBeNull();
  });

  it("says the sign-in could not be finished, rather than waiting for ever", () => {
    /*
     * `failed` is not a wait. The probe finished and there is no credential --
     * the network went while the token was being minted, or the only token on
     * offer belongs to a session that has ended. Drawing the shape of something
     * arriving, indefinitely, is the same lie as an empty state over a failed
     * request, and the only way out of it used to be a reload.
     */
    act(() => {
      publishAuthState({ sessionId: "sess_1", phase: "preparing-session" });
      resolveTokenProbe("sess_1", false);
    });

    renderGate();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/couldn't finish signing you in/i)).toBeInTheDocument();
    expect(screen.queryByText(/loading your workspace/i)).toBeNull();
    expect(screen.queryByText("workspace")).toBeNull();
  });

  it("offers a way to try again that is not a reload", async () => {
    act(() => {
      publishAuthState({ sessionId: "sess_1", phase: "preparing-session" });
      resolveTokenProbe("sess_1", false);
    });
    renderGate();

    const before = tokenProbeAttempt();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    // A counter the bridge watches, bumped by a person. Nothing schedules it.
    expect(tokenProbeAttempt()).toBe(before + 1);
    expect(authPhase()).toBe("preparing-session");
    expect(screen.getByText(/loading your workspace/i)).toBeInTheDocument();
  });

  it("shows a busy state rather than an empty screen while it waits", () => {
    renderGate();

    expect(screen.getByText(/loading your workspace/i)).toBeInTheDocument();
  });

  it("never falls back to dev auth when Clerk is slow", async () => {
    // A timer-based fallback to `X-Dev-User` would be an authentication bypass.
    act(() => {
      publishAuthState({ sessionId: null, phase: "loading" });
    });

    expect(isAuthReady()).toBe(false);
    await expect(buildAuthHeaders()).rejects.toThrow();
  });

  it("sends the bearer token once a session is ready", async () => {
    fullyReady();

    await expect(buildAuthHeaders()).resolves.toEqual({
      Authorization: "Bearer tok_123",
    });
  });
});

describe("AuthGate in dev mode", () => {
  beforeEach(() => {
    childRendered.mockClear();
    authStore.mode = "dev";
    resetAuthReadiness();
  });

  it("mounts immediately, with no getter and no session", () => {
    // Dev mode has nothing to wait for: the `X-Dev-User` header comes from a
    // value hydrated at module load. Gating it would make the "runs with no
    // keys at all" story a lie.
    setTokenGetter(null);

    renderGate();

    expect(screen.getByText("workspace")).toBeInTheDocument();
    expect(childRendered).toHaveBeenCalledTimes(1);
  });
});

describe("AuthGate — an identity that cannot have an account", () => {
  /*
   * THE FOURTH STATE, AND IT IS NOT A WAIT.
   *
   * <p>The free allowance belongs to the person rather than to the row, so an
   * identity that has spent all 100 minutes and asks for a *new* account is
   * refused at provisioning -- before a users row exists. The API answers 403
   * `FREE_TIER_EXHAUSTED` to every query the session makes.
   *
   * <p>Which is not a state of the credential: the token is valid and Clerk is
   * perfectly happy. Nothing in the other three states can express it, and
   * letting the app mount would mean eleven screens drawing eleven "couldn't
   * load" states, retry buttons and all, over a condition no retry can change.
   */
  const MESSAGE =
    "This email address has already used all 100 free transcription minutes.";

  beforeEach(() => {
    childRendered.mockClear();
    signOut.mockClear();
    authStore.mode = "clerk";
    setTokenGetter(null);
    resetAuthReadiness();
    forgetAccountRefusal();
  });

  it("does not mount the app, and says why", () => {
    act(() => markAccountRefusal(MESSAGE));

    renderGate();

    expect(screen.queryByText("workspace")).toBeNull();
    expect(childRendered).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(MESSAGE);
  });

  it("shows the server's own sentence rather than a second copy of it", () => {
    // The server owns the number in it. A sentence written here as well would
    // be two places to keep 100 in step, and they would disagree.
    act(() => markAccountRefusal("something else entirely"));

    renderGate();

    expect(screen.getByRole("alert")).toHaveTextContent("something else entirely");
  });

  it("outranks the wait, because waiting cannot change it", () => {
    /*
     * Nothing is ready here -- no token getter, no session -- which is
     * ordinarily the skeleton. A skeleton would be a promise that something is
     * arriving, for ever.
     */
    act(() => markAccountRefusal(MESSAGE));

    renderGate();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(document.querySelector("[aria-busy=\"true\"]")).toBeNull();
  });

  it("outranks a failed credential too", () => {
    // Both are true at once in the real sequence, and this is the more
    // specific and more permanent of the two.
    act(() => {
      setTokenGetter(async () => null);
      publishAuthState({ sessionId: "sess_1", phase: "preparing-session" });
      resolveTokenProbe("sess_1", false);
      markAccountRefusal(MESSAGE);
    });

    renderGate();

    expect(screen.getByRole("alert")).toHaveTextContent(MESSAGE);
    expect(screen.queryByText(/couldn.t finish signing you in/i)).toBeNull();
  });

  it("offers a way out, and it is not Try again", () => {
    /*
     * Every other full-screen state here offers a retry, because every other
     * one is a request that might succeed. This one cannot, and sending
     * somebody back to sign in would be worse than useless: signing in
     * *works*, which is exactly how a person ends up in a loop that always
     * ends on this screen.
     */
    act(() => markAccountRefusal(MESSAGE));

    renderGate();

    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("signs out to the landing page rather than to sign-in", async () => {
    act(() => markAccountRefusal(MESSAGE));
    renderGate();

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(signOut).toHaveBeenCalledWith("/");
  });

  it("lets an ordinary session through, once nothing has been refused", () => {
    // The guard against a gate that has learned to refuse everybody.
    fullyReady();

    renderGate();

    expect(screen.getByText("workspace")).toBeInTheDocument();
  });
});
