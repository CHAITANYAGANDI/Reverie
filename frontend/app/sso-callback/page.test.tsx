import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

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

const { handleRedirectCallback, replace, update, setActive } = vi.hoisted(() => ({
  handleRedirectCallback: vi.fn(),
  replace: vi.fn(),
  update: vi.fn(),
  setActive: vi.fn(),
}));

/** The in-flight sign-up Clerk keeps on the client, or none. */
let signUp: Record<string, unknown> | null;

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({
    handleRedirectCallback,
    setActive,
    client: signUp ? { signUp } : undefined,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

import SsoCallbackPage from "@/app/sso-callback/page";

/** Puts something on the address bar, which is where the provider replies. */
function arriveWith(search: string) {
  window.history.replaceState({}, "", `/sso-callback${search}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  handleRedirectCallback.mockResolvedValue(undefined);
  setActive.mockResolvedValue(undefined);
  signUp = null;
  arriveWith("");
});

describe("while the exchange is running", () => {
  it("says so, and says it once", async () => {
    render(<SsoCallbackPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Signing you in");
    await waitFor(() => expect(handleRedirectCallback).toHaveBeenCalled());
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

    await waitFor(() => expect(handleRedirectCallback).toHaveBeenCalled());
    const navigate = handleRedirectCallback.mock.calls[0][1] as (to: string) => Promise<unknown>;

    // Clerk asks for its hosted continue page; the fill happens instead.
    await navigate("https://touching-locust-18.accounts.dev/sign-up/continue");

    expect(update).toHaveBeenCalledWith({ username: expect.stringMatching(/^maya-[0-9a-f]{6}$/) });
    expect(setActive).toHaveBeenCalledWith({ session: "sess_new" });
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

describe("when it did not work", () => {
  it("names a cancelled consent screen, and does not attempt an exchange", async () => {
    arriveWith("?error=access_denied");
    render(<SsoCallbackPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("You cancelled that sign-in.");
    // Nothing to exchange, so nothing is attempted — the attempt is what used
    // to leave the page claiming to be signing somebody in.
    expect(handleRedirectCallback).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("offers the way back rather than leaving somebody on a dead page", async () => {
    arriveWith("?error=access_denied");
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
  it("carries Reverie's mark while it waits", () => {
    const { container } = render(<SsoCallbackPage />);

    // This screen sits between Google and the app and used to carry the generic
    // microphone glyph the V2 identity study rejected.
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toContain("Reverie");
  });

  it("never mentions Clerk", () => {
    const { container } = render(<SsoCallbackPage />);

    expect(container.textContent ?? "").not.toMatch(/clerk/i);
  });
});
