import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

/**
 * Dev mode has to be asked for by name now.
 *
 * <p>`AUTH_MODE` used to be "clerk if the variable says clerk, otherwise dev",
 * so an unset value selected the mode that trusts an `X-Dev-User` header — an
 * authentication bypass arrived at by a missing environment variable. It fails
 * closed now, which means these tests, which are *about* dev mode, have to say
 * so rather than inherit it.
 *
 * <p>`vi.hoisted` because `AUTH_MODE` is computed when lib/auth-store is first
 * evaluated, and ESM imports are hoisted above everything else in the file.
 */
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_AUTH_MODE = "dev";
});

import * as React from "react";
import { render, screen, act, cleanup } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { readPreferences, writePreference } from "@/lib/preference-store";

/**
 * What signing out has to take with it.
 *
 * <p>Dev mode is the awkward case and the reason this file exists. Anything
 * stored per sign-in is stamped with a session key, and a read under a
 * different one gets nothing — which handles a session that expired, a sign-out
 * in another tab, and a second person on the same browser, without anyone
 * having to remember to call something.
 *
 * <p>Dev mode has no sessions. It signs back in under the same id, so the stamp
 * is unchanged and the whole mechanism silently does nothing. `signOut` has to
 * clear up after itself, and that is what is pinned here.
 *
 * <p>Only the dev provider is exercised: the Clerk one is loaded lazily and
 * needs a publishable key and the SDK to render at all. Its `signOut` makes the
 * same call, one line above `void signOut()`.
 */

/** Reads the context out so a test can drive it. */
function Probe() {
  const { sessionKey, isLoaded, signOut, onboardingCompleted, completeOnboarding, deleteIdentity } =
    useAuth();
  return (
    <div>
      <span data-testid="session">{isLoaded ? sessionKey : "…"}</span>
      <span data-testid="onboarded">{onboardingCompleted ? "yes" : "no"}</span>
      <button onClick={() => signOut?.()}>Sign out</button>
      <button onClick={() => signOut?.("/")}>Close account</button>
      <button onClick={() => void completeOnboarding()}>Finish onboarding</button>
      <button onClick={() => void deleteIdentity()}>Delete identity</button>
    </div>
  );
}

/**
 * Somewhere to record the navigation jsdom will not perform.
 *
 * <p>Assigning `window.location.href` in jsdom is a no-op that logs "not
 * implemented", so the destination cannot be read back off the real object.
 * This replaces it with something that simply remembers.
 */
function watchNavigation() {
  const spot = { href: "" };
  Object.defineProperty(window, "location", {
    value: spot,
    writable: true,
    configurable: true,
  });
  return spot;
}

beforeEach(() => {
  window.localStorage.clear();
  // signOut navigates, which jsdom cannot do. The warning it logs is expected
  // and says nothing about whether this worked.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("signing out of dev mode", () => {
  it("names the sign-in it is currently under", async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
    });

    // The dev user id, because there is nothing else that distinguishes one dev
    // sign-in from another.
    expect(screen.getByTestId("session")).toHaveTextContent("usr_dev");
  });

  it("forgets the filters on the way out", async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
    });
    writePreference("usr_dev", "home.scope", "all");
    expect(readPreferences("usr_dev")["home.scope"]).toBe("all");

    await act(async () => {
      screen.getByRole("button", { name: "Sign out" }).click();
    });

    // Signing back in as the same dev user produces the same stamp, so nothing
    // but this would put the filter back to its default.
    expect(readPreferences("usr_dev")).toEqual({});
  });
});

/**
 * Where it leaves you.
 *
 * <p>Signing out used to land on the public landing page, which is the screen
 * for somebody who has not decided yet — not for somebody who has just left
 * their own account. It goes to the sign-in form.
 *
 * <p>Closing an account is the exception, and it shares this function, so it is
 * pinned beside it: offering to sign into an account that has just been deleted
 * would be the product not having noticed.
 */
describe("where signing out lands", () => {
  it("goes to the sign-in form rather than the landing page", async () => {
    const spot = watchNavigation();
    await act(async () => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
    });

    await act(async () => {
      screen.getByRole("button", { name: "Sign out" }).click();
    });

    expect(spot.href).toBe("/sign-in");
  });

  it("goes where it is told, which is how closing an account leaves", async () => {
    const spot = watchNavigation();
    await act(async () => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
    });

    await act(async () => {
      screen.getByRole("button", { name: "Close account" }).click();
    });

    expect(spot.href).toBe("/");
  });
});

/**
 * The onboarding flag, across the two things that end a session.
 *
 * <p>Dev mode has no identity provider, so the flag lives beside the dev user
 * id in the browser rather than on a Clerk user. That makes the distinction
 * this file has to pin an easy one to get wrong: signing out is not losing
 * anything, and it briefly did clear the flag — which made dev mode ask the two
 * questions again on every single sign-in, to the same person, who had already
 * answered them.
 */
describe("what onboarding survives", () => {
  async function mount() {
    await act(async () => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
    });
  }

  async function press(name: string) {
    await act(async () => {
      screen.getByRole("button", { name }).click();
    });
  }

  it("remembers being finished", async () => {
    await mount();
    expect(screen.getByTestId("onboarded")).toHaveTextContent("no");

    await press("Finish onboarding");

    expect(screen.getByTestId("onboarded")).toHaveTextContent("yes");
  });

  it("survives an ordinary sign-out and the sign-in after it", async () => {
    /*
     * The required lifecycle: a dev user finishes onboarding, signs out, signs
     * back in as the same dev user, and goes straight to Now — which is what
     * the welcome screen does when it reads this flag as true.
     */
    watchNavigation();
    await mount();
    await press("Finish onboarding");
    await press("Sign out");

    // Signing back in is the next mount, under the same dev user id.
    cleanup();
    await mount();

    expect(screen.getByTestId("onboarded")).toHaveTextContent("yes");
  });

  it("is destroyed by deleting the identity, which is the deletion path", async () => {
    /*
     * Dev mode has no identity to destroy, so the flag is the only thing
     * standing in for what a Clerk deletion would take with it. Without this,
     * closing a dev account and signing back in landed in an empty product that
     * thought the questions had been answered.
     */
    await mount();
    await press("Finish onboarding");
    expect(screen.getByTestId("onboarded")).toHaveTextContent("yes");

    await press("Delete identity");

    expect(screen.getByTestId("onboarded")).toHaveTextContent("no");

    cleanup();
    await mount();
    expect(screen.getByTestId("onboarded")).toHaveTextContent("no");
  });
});

/**
 * Which way the switch falls when nobody set it.
 *
 * <p>This is the security property, and it is one line of code that is easy to
 * write backwards. Dev mode accepts an `X-Dev-User` header and becomes whoever
 * it names; the difference between defaulting to it and defaulting away from it
 * is the difference between a deployment that a missing build arg opens to
 * anybody and one that a missing build arg locks everybody out of. The second
 * is a bad afternoon. The first is not recoverable.
 */
describe("the mode a missing setting selects", () => {
  async function modeWith(value: string | undefined) {
    vi.resetModules();
    if (value === undefined) delete process.env.NEXT_PUBLIC_AUTH_MODE;
    else process.env.NEXT_PUBLIC_AUTH_MODE = value;
    const fresh = await import("@/lib/auth-store");
    return fresh.AUTH_MODE;
  }

  const restore = process.env.NEXT_PUBLIC_AUTH_MODE;
  afterAll(() => {
    process.env.NEXT_PUBLIC_AUTH_MODE = restore;
  });

  it("is clerk when the variable is absent", async () => {
    expect(await modeWith(undefined)).toBe("clerk");
  });

  it("is clerk when the variable is empty", async () => {
    // What a build arg that was declared and never given looks like.
    expect(await modeWith("")).toBe("clerk");
  });

  it("is clerk when the variable is misspelt", async () => {
    expect(await modeWith("development")).toBe("clerk");
    expect(await modeWith("Dev ")).toBe("clerk");
  });

  it("is dev only for exactly that word", async () => {
    expect(await modeWith("dev")).toBe("dev");
  });
});
