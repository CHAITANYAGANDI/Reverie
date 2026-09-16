import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Signing in, on Reverie's own form.
 *
 * <p>The form is ours and the credential is Clerk's, so what is asserted here
 * is the half we now own: that nothing on screen belongs to anybody else, that
 * a failure is reported in our words, and that the URL cannot send somebody
 * somewhere they did not ask to go.
 */

const clerk = vi.hoisted(() => ({
  isLoaded: true,
  create: vi.fn(),
  authenticateWithRedirect: vi.fn(),
  attemptFirstFactor: vi.fn(),
  setActive: vi.fn(),
}));

const nav = vi.hoisted(() => ({ push: vi.fn(), search: "" }));

vi.mock("@clerk/nextjs/legacy", () => ({
  useSignIn: () => ({
    isLoaded: clerk.isLoaded,
    signIn: {
      create: clerk.create,
      authenticateWithRedirect: clerk.authenticateWithRedirect,
      attemptFirstFactor: clerk.attemptFirstFactor,
    },
    setActive: clerk.setActive,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import SignInPage from "@/app/sign-in/[[...sign-in]]/page";

async function signIn(email = "ada@example.com", password = "hunter22") {
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  clerk.isLoaded = true;
  nav.search = "";
  clerk.create.mockResolvedValue({ status: "complete", createdSessionId: "sess_1" });
});

describe("what the screen shows", () => {
  it("never mentions Clerk", async () => {
    // The whole point of owning the form. This screen is the first thing
    // anybody sees, and it used to carry somebody else's name at the foot of
    // it.
    const { container } = render(<SignInPage />);
    await screen.findByRole("button", { name: "Sign in" });

    expect(container.textContent).not.toMatch(/clerk/i);
  });

  it("asks for an email and a password, and nothing else", async () => {
    render(<SignInPage />);
    await screen.findByRole("button", { name: "Sign in" });

    const labels = screen.getAllByText(/^(Email|Password|Username|Name)$/).map((el) => el.textContent);
    expect(labels).toEqual(["Email", "Password"]);
  });

  it("lets a password manager fill it", async () => {
    // `current-password` rather than `new-password` is what makes a manager
    // offer to fill rather than to generate.
    render(<SignInPage />);

    expect(await screen.findByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
  });
});

describe("signing in", () => {
  it("opens the session and goes to the app", async () => {
    render(<SignInPage />);
    await screen.findByRole("button", { name: "Sign in" });

    await signIn();

    await waitFor(() => expect(clerk.setActive).toHaveBeenCalledWith({ session: "sess_1" }));
    expect(nav.push).toHaveBeenCalledWith("/home");
  });

  it("hands Google the round trip back to this app", async () => {
    render(<SignInPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Continue with Google/ }));

    expect(clerk.authenticateWithRedirect).toHaveBeenCalledWith({
      strategy: "oauth_google",
      redirectUrl: "/sso-callback",
      redirectUrlComplete: "/home",
    });
  });

  it("says what went wrong in Reverie's words", async () => {
    clerk.create.mockRejectedValue({ errors: [{ code: "form_password_incorrect" }] });
    render(<SignInPage />);
    await screen.findByRole("button", { name: "Sign in" });

    await signIn();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That email and password do not match an account.");
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("does not strand somebody on a step it cannot draw", async () => {
    // Owning the form means owning the states it does not handle, and saying so
    // beats a button that silently does nothing.
    clerk.create.mockResolvedValue({
      status: "needs_second_factor",
      supportedFirstFactors: [{ strategy: "password" }],
    });
    render(<SignInPage />);
    await screen.findByRole("button", { name: "Sign in" });

    await signIn();

    expect(await screen.findByRole("alert")).toHaveTextContent(/two-step/i);
  });

  it("says an account has no password rather than telling them to reset one", async () => {
    /*
     * The reported bug. Every blocked outcome used to produce one sentence —
     * "needs another step … Continue with Google, or reset your password" —
     * which named two remedies without saying which applied. Somebody whose
     * account was created with Google went to reset a password that does not
     * exist. Clerk says which factors would work; this reads them.
     */
    clerk.create.mockResolvedValue({
      status: "needs_first_factor",
      supportedFirstFactors: [{ strategy: "oauth_google" }],
    });
    render(<SignInPage />);
    await screen.findByRole("button", { name: "Sign in" });

    await signIn();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/no password/i);
    expect(alert).toHaveTextContent(/Continue with Google/i);
    // And specifically not the advice that sent people in circles.
    expect(alert).not.toHaveTextContent(/reset your password/i);
  });
});

describe("where it sends you afterwards", () => {
  it("returns to the page that was asked for", async () => {
    // The middleware puts it on the URL, so a bookmarked meeting opens the
    // meeting rather than the top of the app.
    nav.search = "redirect_url=%2Fmeetings%2Fmtg_1";
    render(<SignInPage />);
    await screen.findByRole("button", { name: "Sign in" });

    await signIn();

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/meetings/mtg_1"));
  });

  it.each([
    ["another origin", "https://evil.example.com"],
    ["a protocol-relative host", "//evil.example.com"],
    ["javascript", "javascript:alert(1)"],
  ])("refuses %s and goes home instead", async (_label, target) => {
    /*
     * An open redirect on a sign-in page is worth more to somebody than a
     * broken one: a link to Reverie's real sign-in that lands on a copy of it is
     * a credible way to collect passwords. Only a path, and never `//`, which
     * the browser reads as a host.
     */
    nav.search = `redirect_url=${encodeURIComponent(target)}`;
    render(<SignInPage />);
    await screen.findByRole("button", { name: "Sign in" });

    await signIn();

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/home"));
  });
});

describe("a forgotten password", () => {
  it("asks for a code without losing the address already typed", async () => {
    render(<SignInPage />);
    await userEvent.type(await screen.findByLabelText("Email"), "ada@example.com");

    await userEvent.click(screen.getByRole("button", { name: "Forgot it?" }));

    expect(clerk.create).not.toHaveBeenCalled();
    // The address survives the change of step -- retyping it would be the form
    // forgetting what it was just told.
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
    expect(screen.getByRole("button", { name: "Send code" })).toBeInTheDocument();
  });

  it("sets a new password and signs in with it", async () => {
    clerk.attemptFirstFactor.mockResolvedValue({ status: "complete", createdSessionId: "sess_2" });
    render(<SignInPage />);
    await userEvent.type(await screen.findByLabelText("Email"), "ada@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Forgot it?" }));
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));

    await userEvent.type(await screen.findByLabelText("Code"), "123456");
    await userEvent.type(screen.getByLabelText("New password"), "a-better-one");
    await userEvent.click(screen.getByRole("button", { name: /Set password/ }));

    await waitFor(() => expect(clerk.setActive).toHaveBeenCalledWith({ session: "sess_2" }));
  });

  it("comes back to the sign-in form", async () => {
    render(<SignInPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Forgot it?" }));

    await userEvent.click(screen.getByRole("button", { name: "Back to sign in" }));

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});

/**
 * The bot check on the sign-in form.
 *
 * <p>Which reads like a mistake until you follow Continue with Google.
 * `transferable` defaults to true, so a Google account Clerk has never seen
 * turns this sign-in into a *sign-up* — and a sign-up is what bot protection
 * guards. The challenge is required while the person is still standing on this
 * page, so the element has to be here, not only on the sign-up form.
 *
 * <p>Production reported "We could not confirm you are not a robot." for Google
 * sign-up. Signing in with a password never triggers it, which is why the
 * failure looked like it belonged to Google rather than to this form.
 */
describe("the bot check", () => {
  it("has somewhere to render, which the Google transfer needs", () => {
    const { container } = render(<SignInPage />);

    expect(container.querySelector("#clerk-captcha")).toBeInTheDocument();
  });

  it("keeps exactly one of them", () => {
    // Clerk mounts by id; a second is ambiguity, not a spare.
    const { container } = render(<SignInPage />);

    expect(container.querySelectorAll("#clerk-captcha")).toHaveLength(1);
  });

  it("is already on the page when Google is pressed", async () => {
    /*
     * The ordering is the fix. `authenticateWithRedirect` is what starts the
     * transfer, so the element has to exist before it is called -- not be
     * created in response to it.
     */
    let present: boolean | null = null;
    clerk.authenticateWithRedirect.mockImplementation(async () => {
      present = document.getElementById("clerk-captcha") !== null;
    });

    render(<SignInPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Continue with Google/ }));

    await waitFor(() => expect(clerk.authenticateWithRedirect).toHaveBeenCalled());
    expect(present).toBe(true);
  });

  it("dresses the challenge for a dark page and the form's width", () => {
    const { container } = render(<SignInPage />);
    const slot = container.querySelector("#clerk-captcha") as HTMLElement;

    expect(slot.getAttribute("data-cl-theme")).toBe("dark");
    expect(slot.getAttribute("data-cl-size")).toBe("flexible");
  });

  it("is reachable rather than hidden, for the challenge that is interactive", () => {
    // Most are invisible. The one that is not has to be clickable, or the
    // transfer cannot be completed at all.
    const { container } = render(<SignInPage />);
    const slot = container.querySelector("#clerk-captcha") as HTMLElement;

    expect(slot.closest(".sr-only")).toBeNull();
    expect(slot.closest("[hidden]")).toBeNull();
    expect(slot.closest("[aria-hidden='true']")).toBeNull();
  });
});

/**
 * COMING BACK FROM GOOGLE WITH NOTHING TO SHOW FOR IT.
 *
 * <p>Reported from a phone: choose Continue with Google, cancel or press Back,
 * and the button is still turning. It never recovers, and because it is
 * `disabled` while busy the only control that could start the flow again is
 * the one that is stuck.
 *
 * <p>`authenticateWithRedirect` leaves the origin, so nothing after it runs and
 * the busy flag is only ever cleared by the page being thrown away. Mobile
 * browsers freeze the document into the back/forward cache instead and restore
 * it — same React tree, same state. Desktop Chrome usually reloads here, which
 * is why this reproduced on a phone and not on the machine it was written on.
 *
 * <h2>What jsdom can and cannot say</h2>
 *
 * <p>It cannot put a document in the back/forward cache; no test runner can.
 * What it can do is deliver the event a restore produces — `pageshow` with
 * `persisted` — and assert the state transition on the other side of it, which
 * is the whole of the fix. That a real browser fires that event on this page
 * was checked separately against a production build.
 *
 * <p>So the redirect is mocked as a promise that never settles, which is what
 * a navigation away actually looks like from this component's point of view.
 */
describe("returning from a cancelled Google sign-in", () => {
  /** Leave the flow hanging, exactly as a real navigation does. */
  function neverReturns() {
    clerk.authenticateWithRedirect.mockImplementation(() => new Promise(() => {}));
  }

  async function startGoogle() {
    const button = await screen.findByRole("button", { name: /Continue with Google/ });
    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    return button;
  }

  /** The restore itself. `persisted` is the flag that means bfcache. */
  function restore(persisted: boolean) {
    const event = new Event("pageshow") as Event & { persisted?: boolean };
    Object.defineProperty(event, "persisted", { value: persisted });
    act(() => {
      window.dispatchEvent(event);
    });
  }

  it("puts the button back to work", async () => {
    render(<SignInPage />);
    neverReturns();
    const button = await startGoogle();

    restore(true);

    await waitFor(() => expect(button).toBeEnabled());
  });

  it("shows the Google mark again rather than the spinner", async () => {
    // The visible half of the same bug: `busy` swaps the mark for a spinner,
    // so a stuck flag is a button that turns for ever.
    render(<SignInPage />);
    neverReturns();
    const button = await startGoogle();
    expect(button.querySelector(".animate-spin")).not.toBeNull();

    restore(true);

    await waitFor(() => expect(button.querySelector(".animate-spin")).toBeNull());
    expect(button.querySelector("svg")).not.toBeNull();
  });

  it("can start the flow a second time", async () => {
    // The point of the fix is not the pixels, it is that the person can retry.
    render(<SignInPage />);
    neverReturns();
    const button = await startGoogle();

    restore(true);
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(clerk.authenticateWithRedirect).toHaveBeenCalledTimes(2);
  });

  it("ignores an ordinary page show, which is not a restore", async () => {
    /*
     * `pageshow` also fires on every normal load. Acting on that one would
     * clear the flag during the moments between the click and the browser
     * actually leaving, so `persisted` is the whole condition.
     */
    render(<SignInPage />);
    neverReturns();
    const button = await startGoogle();

    restore(false);

    await new Promise((r) => setTimeout(r, 20));
    expect(button).toBeDisabled();
  });

  it("does not release a password sign-in that is still in flight", async () => {
    /*
     * A restored document cannot know whether an awaited request finished.
     * Releasing this button would let the same credentials be submitted twice,
     * so only the Google flag — the one that provably ended in a navigation —
     * is cleared.
     */
    clerk.create.mockImplementation(() => new Promise(() => {}));
    render(<SignInPage />);
    await screen.findByRole("button", { name: "Sign in" });
    await signIn();

    const submit = screen.getByRole("button", { name: /Sign(ing)? in/ });
    await waitFor(() => expect(submit).toBeDisabled());

    restore(true);

    await new Promise((r) => setTimeout(r, 20));
    expect(submit).toBeDisabled();
  });
});
