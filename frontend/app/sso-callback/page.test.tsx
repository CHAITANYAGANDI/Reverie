import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

/**
 * Coming back from Google.
 *
 * <h2>The bugs these exist for</h2>
 *
 * <p><b>Pressing Cancel stranded people.</b> Google returns here with nothing
 * to exchange, and the screen went on saying "Signing you in" indefinitely.
 * There was no way off it.
 *
 * <p><b>A transferred sign-in left the product.</b> `transferable` defaults to
 * true, so a Google identity with no Clerk user turns a sign-in attempt into a
 * sign-up, and Clerk finished that by navigating to its own hosted sign-up on
 * `accounts.dev`.
 *
 * <p>Both were previously delegated to `<AuthenticateWithRedirectCallback />`,
 * which decides where to go and cannot be corrected from outside. The exchange
 * is driven here now, so the two things worth asserting are what this file
 * hands Clerk and what it does with the answer — neither of which is visible in
 * a screenshot, and the first of which passed the whole time the bug was live.
 */

const { handleRedirectCallback, replace, push, update, setActive } = vi.hoisted(() => ({
  handleRedirectCallback: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  update: vi.fn(),
  setActive: vi.fn(),
}));

/** The in-flight sign-up Clerk keeps on the client, or none. */
let signUp: Record<string, unknown> | null;
/** The in-flight sign-in, which is where a refused round-trip is recorded. */
let signIn: Record<string, unknown> | null;
/** Whether clerk-js has finished loading. Nothing above is readable before. */
let loaded: boolean;

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({
    loaded,
    handleRedirectCallback,
    setActive,
    client: { signUp: signUp ?? undefined, signIn: signIn ?? undefined },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
}));

import SsoCallbackPage from "@/app/sso-callback/page";

/**
 * What is actually on screen, ignoring anything only a screen reader gets.
 *
 * <p>This route draws the surface colour and nothing else, and it carries one
 * `sr-only` line so assistive technology is not handed silence on a real
 * navigation stop. Asserting on `textContent` cannot tell those apart — it
 * would either forbid the announcement or stop noticing a visible spinner.
 */
function visibleText(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".sr-only").forEach((el) => el.remove());
  return (clone.textContent ?? "").trim();
}

/** Puts something on the address bar, which is where the provider replies. */
function arriveWith(search: string) {
  window.history.replaceState({}, "", `/sso-callback${search}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  handleRedirectCallback.mockResolvedValue(undefined);
  setActive.mockResolvedValue(undefined);
  signUp = null;
  signIn = null;
  loaded = true;
  arriveWith("");
});

/**
 * Cancelling at Google.
 *
 * <p>Reported twice. Google's `error=access_denied` goes to *Clerk's* callback,
 * not Reverie's: Clerk consumes it, records it on the verification, and
 * redirects here with a clean query string. So the URL reading found nothing,
 * the exchange went ahead, and the screen said "Signing you in" indefinitely.
 *
 * <p>The first attempt at this fixed it by passing a `customNavigate` to
 * `handleRedirectCallback`. That argument is dropped by `@clerk/nextjs`, whose
 * wrapper takes one parameter — so the fix passed these tests and changed
 * nothing in a browser. The decision is made here now, before the exchange, off
 * the resources the client has already loaded.
 */
describe("cancelling at Google", () => {
  /** What Clerk leaves on the sign-in when the consent screen is refused. */
  function cancelled() {
    signIn = {
      firstFactorVerification: {
        status: "failed",
        error: { code: "oauth_access_denied", longMessage: "The user did not grant access." },
      },
    };
  }

  it("never presses Back into a dead callback", async () => {
    /*
     * `replace`, not `push`. The callback has nothing left to exchange, so
     * pressing Back onto it would land on a page that can only fail.
     */
    cancelled();
    render(<SsoCallbackPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
    expect(push).not.toHaveBeenCalled();
  });

  it("goes straight back to the sign-in form", async () => {
    /*
     * And not to a screen about it. That screen said "You cancelled that
     * sign-in." over a Back to sign in button, which is a sentence and a click
     * between somebody and the form they were already trying to return to.
     */
    cancelled();
    render(<SsoCallbackPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });

  it("draws no screen about it on the way", async () => {
    cancelled();
    const { container } = render(<SsoCallbackPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(visibleText(container)).toBe("");
  });

  it("attempts no exchange, there being nothing to exchange", async () => {
    cancelled();
    render(<SsoCallbackPage />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(handleRedirectCallback).not.toHaveBeenCalled();
  });

  it("still stops and explains a refusal nobody chose", async () => {
    /*
     * The other half of the same rule, and why the two are told apart at all.
     * A cancellation is somebody's own decision; a locked account is not, and
     * putting them back on the sign-in form with no word about why would be the
     * product declining to say what happened.
     */
    signIn = {
      firstFactorVerification: {
        status: "failed",
        error: { code: "user_locked", longMessage: "Your account is locked." },
      },
    };
    render(<SsoCallbackPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Your account is locked.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("lets a sign-in Clerk means to transfer go through", async () => {
    /*
     * `external_account_exists` is a sign-in that is really a sign-up. Stopping
     * on it would break a flow that works, which is a worse bug than the one
     * this screen is fixing.
     */
    signIn = {
      firstFactorVerification: {
        status: "transferable",
        error: { code: "external_account_exists" },
      },
    };
    render(<SsoCallbackPage />);

    await waitFor(() => expect(handleRedirectCallback).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("before clerk-js has loaded", () => {
  it("attempts nothing, because there is nothing to read yet", async () => {
    /*
     * The client carries the verifications this screen reads, and before the
     * load they are absent rather than empty. Deciding then would read nothing
     * and conclude nothing.
     */
    loaded = false;
    const { container } = render(<SsoCallbackPage />);
    // Flushed, because the exchange is reached through an await and would
    // otherwise be safely un-run for the wrong reason.
    await act(async () => {});

    expect(handleRedirectCallback).not.toHaveBeenCalled();
    // And nothing on screen while it waits, rather than a page announcing a
    // sign-in that has not started.
    expect(visibleText(container)).toBe("");
  });

  it("runs as soon as it has", async () => {
    loaded = false;
    const view = render(<SsoCallbackPage />);

    loaded = true;
    view.rerender(<SsoCallbackPage />);

    await waitFor(() => expect(handleRedirectCallback).toHaveBeenCalled());
  });
});

describe("when the exchange goes nowhere at all", () => {
  it("stops saying it is signing you in, rather than saying it forever", async () => {
    /*
     * `@clerk/nextjs` returns `undefined` from `handleRedirectCallback` with
     * its own `.catch` already attached, so there is no promise here to await
     * and no rejection to catch. Anything that goes wrong inside it leaves this
     * page on "Signing you in" with nothing to notice, which is the shape of
     * every report about this screen. This is the floor under that.
     */
    vi.useFakeTimers();
    try {
      render(<SsoCallbackPage />);
      await act(async () => {
        vi.advanceTimersByTime(15_000);
      });

      expect(screen.getByRole("alert")).toHaveTextContent("That sign-in did not finish.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fire once the flow has decided where to go", async () => {
    // A watchdog that goes off after a successful navigation would replace a
    // page somebody is already reading with an error about it.
    vi.useFakeTimers();
    try {
      render(<SsoCallbackPage />);
      await act(async () => {});
      const navigate = handleRedirectCallback.mock.calls[0][1] as (to: string) => Promise<unknown>;
      await act(async () => {
        await navigate("/home");
      });
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });

      expect(replace).toHaveBeenCalledWith("/home");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("while the exchange is running", () => {
  it("shows nothing at all, being plumbing rather than a destination", async () => {
    /*
     * It drew Reverie's mark over "Signing you in", which made a step somebody
     * never asked for look like a screen. The two pages either side of it are
     * the ones they did ask for.
     */
    const { container } = render(<SsoCallbackPage />);

    expect(visibleText(container)).toBe("");
    expect(container.querySelector("svg")).toBeNull();
    // The one thing it does say is said to a screen reader only.
    expect(screen.getByRole("status")).toHaveClass("sr-only");
    await waitFor(() => expect(handleRedirectCallback).toHaveBeenCalled());
  });

  it("still paints the surface colour, so the step is not a white flash", () => {
    // The one thing an empty page can get wrong between two dark screens.
    const { container } = render(<SsoCallbackPage />);

    expect(container.firstElementChild).toHaveClass("min-h-screen", "bg-surface");
  });

  it("tells Clerk where Reverie's own forms are", async () => {
    render(<SsoCallbackPage />);

    await waitFor(() => expect(handleRedirectCallback).toHaveBeenCalled());
    const [params] = handleRedirectCallback.mock.calls[0];

    /*
     * `signInUrl` and `signUpUrl` are where a flow that does not complete is
     * handed back to. Without them Clerk hands back to its own hosted pages,
     * which is the reported bug. `signInFallbackRedirectUrl` looks like it
     * covers this and does not — that one is where to go once a session exists.
     */
    expect(params.signInUrl).toBe("/sign-in");
    expect(params.signUpUrl).toBe("/sign-up");
    /*
     * The two roads differ. A returning sign-in goes to Now; a brand-new
     * account goes to the two onboarding questions first — including the case
     * that makes it matter, which is the same Google account returning after a
     * full deletion. That is a new identity, so Clerk calls it a sign-up.
     */
    expect(params.signInFallbackRedirectUrl).toBe("/home");
    expect(params.signUpFallbackRedirectUrl).toBe("/welcome");
  });

  it("keeps every navigation Clerk asks for inside the product", async () => {
    render(<SsoCallbackPage />);

    await waitFor(() => expect(handleRedirectCallback).toHaveBeenCalled());
    const navigate = handleRedirectCallback.mock.calls[0][1] as (to: string) => Promise<unknown>;

    // The transfer, exactly as it happened: Clerk asks for its hosted sign-up.
    await navigate("https://touching-locust-18.accounts.dev/sign-up");

    expect(replace).toHaveBeenCalledWith("/sign-up");
  });

  it("navigates once, however many times it is asked", async () => {
    render(<SsoCallbackPage />);

    await waitFor(() => expect(handleRedirectCallback).toHaveBeenCalled());
    const navigate = handleRedirectCallback.mock.calls[0][1] as (to: string) => Promise<unknown>;

    await navigate("/home");
    await navigate("/sign-in");

    // A second navigation would fight the first one, and the loser is whichever
    // page the reader is already looking at.
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/home");
  });
});

/**
 * A sign-up one field short of existing.
 *
 * <p>Clerk's sign-up is progressive, and this instance requires a username.
 * Reverie does not collect one — no profile, no @mention, no sharing, so it is
 * a value nobody reads — and the email form has always filled it from the
 * address rather than asking. The Google road never did, so it stopped one
 * field short and Clerk sent people to its own hosted "Fill in missing fields"
 * page to type a username into.
 */
describe("a sign-up that only needs something Reverie can answer", () => {
  /** A sign-up waiting on a username, which is the reported case. */
  function needsUsername(after: Record<string, unknown>) {
    signUp = {
      status: "missing_requirements",
      missingFields: ["username"],
      createdSessionId: null,
      emailAddress: "maya@northstarlabs.io",
      update,
    };
    update.mockResolvedValue(after);
  }

  it("fills it, signs in, and goes to onboarding", async () => {
    needsUsername({
      status: "complete",
      missingFields: [],
      createdSessionId: "sess_new",
    });
    render(<SsoCallbackPage />);

    /*
     * Before the exchange rather than inside its navigation, which is where
     * this lived and therefore never ran -- the navigate is dropped by the
     * wrapper. Clerk's FAPI has already opened the account and left it one
     * field short, so filling that field is the whole of what remains, and
     * there is no hosted page for anybody to be sent to.
     */
    await waitFor(() => expect(setActive).toHaveBeenCalledWith({ session: "sess_new" }));
    expect(update).toHaveBeenCalledWith({ username: expect.stringMatching(/^maya-[0-9a-f]{6}$/) });
    // A brand-new account, so the two questions rather than Now.
    expect(replace).toHaveBeenCalledWith("/welcome");
  });

  it("never types anybody's name in for them", async () => {
    /*
     * A username is a value nobody reads. A first name is a real answer about a
     * real person, it is asked for on the first screen inside, and filling it
     * in with something plausible would be putting words in their mouth.
     */
    signUp = {
      status: "missing_requirements",
      missingFields: ["first_name"],
      createdSessionId: null,
      emailAddress: "maya@northstarlabs.io",
      update,
    };
    render(<SsoCallbackPage />);

    await waitFor(() => expect(handleRedirectCallback).toHaveBeenCalled());
    const navigate = handleRedirectCallback.mock.calls[0][1] as (to: string) => Promise<unknown>;
    await navigate("https://touching-locust-18.accounts.dev/sign-up/continue");

    expect(update).not.toHaveBeenCalled();
    // And still not left on somebody else's domain.
    expect(replace).toHaveBeenCalledWith("/sign-up");
  });

  it("falls back to Reverie's own form when the fill does not finish it", async () => {
    needsUsername({
      status: "missing_requirements",
      missingFields: ["phone_number"],
      createdSessionId: null,
    });
    render(<SsoCallbackPage />);

    await waitFor(() => expect(handleRedirectCallback).toHaveBeenCalled());
    const navigate = handleRedirectCallback.mock.calls[0][1] as (to: string) => Promise<unknown>;
    await navigate("https://touching-locust-18.accounts.dev/sign-up/continue");

    expect(setActive).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/sign-up");
  });

  it("tells Clerk where a half-finished sign-up goes, as a backstop", async () => {
    render(<SsoCallbackPage />);

    await waitFor(() => expect(handleRedirectCallback).toHaveBeenCalled());
    const [params] = handleRedirectCallback.mock.calls[0];

    // Without it Clerk uses its own hosted page, which is the reported URL.
    expect(params.continueSignUpUrl).toBe("/sign-up");
  });

  it("leaves a completed sign-in alone", async () => {
    // Nothing in flight: the ordinary success path must not be touched.
    render(<SsoCallbackPage />);

    await waitFor(() => expect(handleRedirectCallback).toHaveBeenCalled());
    const navigate = handleRedirectCallback.mock.calls[0][1] as (to: string) => Promise<unknown>;
    await navigate("/home");

    expect(update).not.toHaveBeenCalled();
    expect(setActive).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/home");
  });
});

describe("a step Clerk insists on that Reverie cannot draw", () => {
  /** The navigation Clerk makes when the new session is held back by a task. */
  async function arriveAtTheTask() {
    render(<SsoCallbackPage />);
    await waitFor(() => expect(handleRedirectCallback).toHaveBeenCalled());
    const navigate = handleRedirectCallback.mock.calls[0][1] as (to: string) => Promise<unknown>;
    // Wrapped because this navigation is the one that sets state rather than
    // leaving: it stops here instead of going anywhere.
    await act(async () => {
      await navigate("/sign-up#/tasks/choose-organization");
    });
  }

  it("stops and names it, rather than drawing the sign-up form again", async () => {
    /*
     * The reported loop: signing up with Google landed back on
     * `/sign-up#/tasks/choose-organization`, which is Reverie's own sign-up
     * form with a hash nothing reads behind it — indistinguishable from the
     * sign-up having failed.
     */
    await arriveAtTheTask();

    expect(replace).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/does not use them/);
  });

  it("does not claim nothing happened, because the account was made", async () => {
    // The session is pending, not absent. Saying "nothing on your account was
    // changed" would be this screen's one outright lie.
    await arriveAtTheTask();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Your account was created");
    expect(alert).not.toHaveTextContent("Nothing on your account was changed.");
  });

  it("still offers the way back", async () => {
    await arriveAtTheTask();

    await screen.findByRole("alert");
    expect(screen.getByRole("link", { name: "Back to sign in" })).toBeInTheDocument();
  });
});

describe("when it did not work", () => {
  it("takes a cancellation on the URL back to the form, and exchanges nothing", async () => {
    arriveWith("?error=access_denied");
    render(<SsoCallbackPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
    // Nothing to exchange, so nothing is attempted — the attempt is what used
    // to leave the page claiming to be signing somebody in.
    expect(handleRedirectCallback).not.toHaveBeenCalled();
  });

  it("offers the way back rather than leaving somebody on a dead page", async () => {
    // A refusal nobody chose, which is the case that still gets a screen.
    arriveWith("?error=server_error");
    render(<SsoCallbackPage />);

    await screen.findByRole("alert");
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  it("says so when the exchange itself fails with nothing on the URL", async () => {
    handleRedirectCallback.mockRejectedValue(new Error("nope"));
    render(<SsoCallbackPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("That sign-in did not finish.");
    expect(screen.getByRole("link", { name: "Back to sign in" })).toBeInTheDocument();
  });

  it("promises nothing about the account it could not sign into", async () => {
    handleRedirectCallback.mockRejectedValue(new Error("nope"));
    render(<SsoCallbackPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Nothing on your account was changed.");
  });
});

describe("what it wears", () => {
  /** The one state that is a screen: a refusal nobody chose. */
  async function failed() {
    signIn = {
      firstFactorVerification: {
        status: "failed",
        error: { code: "user_locked", longMessage: "Your account is locked." },
      },
    };
    const view = render(<SsoCallbackPage />);
    await screen.findByRole("alert");
    return view;
  }

  it("carries Reverie's mark on the one page it does draw", async () => {
    // Which is not the waiting state any more. This screen used to carry the
    // generic microphone glyph the V2 identity study rejected, then the lens,
    // and now the orb — `Lockup`'s mark changed under it, which is exactly why
    // this asserts "a mark and the word" rather than which mark.
    const { container } = await failed();

    expect(container.querySelector("[data-ai-mark]")).not.toBeNull();
    expect(container.textContent).toContain("Reverie");
  });

  it("never mentions Clerk", async () => {
    const { container } = await failed();

    expect(container.textContent ?? "").not.toMatch(/clerk/i);
  });
});
