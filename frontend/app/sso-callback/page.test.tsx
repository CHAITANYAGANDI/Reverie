import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Coming back from Google.
 *
 * <h2>The bug these exist for</h2>
 *
 * <p>Pressing Cancel on Google's consent screen landed people on
 * `<slug>.accounts.dev/sign-in` — Clerk's own hosted Account Portal, a
 * different domain wearing a different brand, reached by backing out of a
 * Reverie sign-in.
 *
 * <p>The cause was a missing prop, and the reason it survived review is that
 * nothing goes wrong when it is absent. Clerk's callback needs to be told where
 * the sign-in form lives, because not every arrival here is a completed
 * session: a cancelled consent screen, a refused scope and an account needing a
 * second factor all come back here and all need handing back to a form. Told
 * nothing, Clerk hands back to its own. `signInFallbackRedirectUrl` looks like
 * it covers this and does not — that one is where to go once a session exists.
 *
 * <p>So the props are asserted rather than the pixels. A test that rendered the
 * page and looked at it would have passed the entire time the bug was live.
 */

const captured: Record<string, unknown> = {};

vi.mock("@clerk/nextjs", () => ({
  AuthenticateWithRedirectCallback: (props: Record<string, unknown>) => {
    Object.assign(captured, props);
    return null;
  },
}));

import SsoCallbackPage from "@/app/sso-callback/page";

describe("returning from Google", () => {
  it("tells Clerk where Reverie's own sign-in and sign-up live", () => {
    render(<SsoCallbackPage />);

    // Without these two, an OAuth flow that does not complete is handed to
    // Clerk's hosted pages on accounts.dev.
    expect(captured.signInUrl).toBe("/sign-in");
    expect(captured.signUpUrl).toBe("/sign-up");
  });

  it("never points anything at Clerk's hosted account portal", () => {
    render(<SsoCallbackPage />);

    for (const [prop, value] of Object.entries(captured)) {
      if (typeof value !== "string") continue;
      expect(
        value,
        `${prop} must stay inside Reverie`,
      ).not.toMatch(/accounts\.dev|accounts\.clerk|clerk\.com/);
      // Every URL handed to Clerk here is one of ours, so every one is a path.
      if (prop.endsWith("Url")) expect(value.startsWith("/")).toBe(true);
    }
  });

  it("still says where a finished flow goes when the flow did not say", () => {
    render(<SsoCallbackPage />);

    // These are the fallbacks, not the hand-back-to-a-form URLs above.
    expect(captured.signInFallbackRedirectUrl).toBe("/home");
    expect(captured.signUpFallbackRedirectUrl).toBe("/home");
  });

  it("wears Reverie's mark while it waits", () => {
    const { container } = render(<SsoCallbackPage />);

    // This screen sits between Google and the app and used to carry the
    // generic microphone glyph the V2 identity study rejected.
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toContain("Reverie");
    expect(screen.getByRole("status")).toHaveTextContent("Signing you in");
  });
});
