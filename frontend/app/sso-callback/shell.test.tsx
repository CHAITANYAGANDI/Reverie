import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";

/**
 * The OAuth route renders without a Clerk provider anywhere near it.
 *
 * <h2>The blocker these pin</h2>
 *
 * <p>`next build` failed on this route:
 *
 * <pre>
 *   Error occurred prerendering page "/sso-callback"
 *   Error: useClerk can only be used within the &lt;ClerkProvider /&gt; component.
 * </pre>
 *
 * <p>The route takes no parameters and calls no dynamic API, so Next
 * prerenders it — and the page's first line called `useClerk()`, which asserts
 * its provider rather than degrading. Nothing server-side provides that
 * context: in clerk mode the provider is a `next/dynamic` with `ssr: false`
 * and renders nothing on the server, and in dev mode there is no Clerk at all.
 *
 * <h2>Why a throwing mock rather than no mock</h2>
 *
 * <p>Because "no mock" would prove very little. `@clerk/nextjs`'s real
 * `useClerk` throws outside a provider, and that is the behaviour under test,
 * so it is reproduced exactly: every module in this file gets a `useClerk`
 * that throws the real message. A shell that evaluates it fails here with the
 * same error the build gave, which is the strongest available statement that
 * the boundary holds — and it fails in a second rather than after a
 * forty-second production build.
 *
 * <p>`app/sso-callback/page.test.tsx` owns the exchange's own thirty-six
 * cases. These are only about the boundary.
 */

const THROWN = "useClerk can only be used within the <ClerkProvider /> component.";

/*
 * The real module's behaviour outside a provider, and it applies to every
 * import in this file -- including the ones a lazily loaded chunk would reach
 * for. If the shell, or anything it renders during its first commit, touches
 * Clerk, this is what happens.
 */
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => {
    throw new Error(THROWN);
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/**
 * The route's default export, imported after the auth mode is decided.
 *
 * <p>`AUTH_MODE` is a module constant read from `NEXT_PUBLIC_AUTH_MODE` when
 * `lib/auth-store` is first evaluated, so the environment has to be set before
 * the import and the registry reset between cases. Which is also what the
 * build does — the mode is fixed at build time, not per request.
 */
async function shellFor(mode: "clerk" | "dev") {
  vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", mode);
  vi.resetModules();
  const mod = await import("@/app/sso-callback/page");
  return mod.default;
}

describe("the /sso-callback shell", () => {
  it("renders in clerk mode without evaluating useClerk", async () => {
    /*
     * THE BUILD FAILURE, AS A UNIT TEST.
     *
     * <p>This is the clerk-mode prerender: the shell renders, the callback's
     * chunk has not resolved, and nothing has asked Clerk for anything. Before
     * the split this render threw.
     */
    const Shell = await shellFor("clerk");

    expect(() => render(<Shell />)).not.toThrow();
  });

  it("and renders in dev mode, which is the build that actually failed", async () => {
    /*
     * The mode the reported build ran in. `DevAuthProvider` server-renders its
     * children and dev mode has no Clerk, so this is the path where the page
     * body really was evaluated during the prerender.
     */
    const Shell = await shellFor("dev");

    expect(() => render(<Shell />)).not.toThrow();
  });

  it("draws the dark frame on the first commit, in both modes", async () => {
    // The route's own promise: the step between two dark screens is not a
    // white one. The frame is the prerendered output, so it is in the HTML
    // before any JavaScript runs.
    for (const mode of ["clerk", "dev"] as const) {
      const Shell = await shellFor(mode);
      const { container } = render(<Shell />);

      expect(container.querySelector(".bg-surface")).not.toBeNull();
      expect(container.querySelector('[role="status"]')?.textContent).toContain(
        "Completing authentication",
      );
    }
  });

  it("puts the captcha container in that first commit", async () => {
    /*
     * Bot sign-up protection can challenge an OAuth sign-up, and this is the
     * element Clerk renders the challenge into; without it the sign-up is
     * refused outright, which is what production was doing. It used to arrive
     * with the page component's first render and now arrives with the server's
     * HTML, which is strictly earlier.
     */
    const Shell = await shellFor("clerk");
    const { container } = render(<Shell />);

    const captcha = container.querySelector("#clerk-captcha");

    expect(captcha).not.toBeNull();
    expect(captcha).toHaveAttribute("data-cl-theme", "dark");
  });

  it("shows nothing of Reverie while it works", async () => {
    // Plumbing, not a destination. No mark, no spinner, no sentence a sighted
    // reader can see -- the same judgement the exchange's own suite pins.
    const Shell = await shellFor("clerk");
    const { container } = render(<Shell />);

    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".sr-only").forEach((el) => el.remove());

    expect((clone.textContent ?? "").trim()).toBe("");
  });

  it("imports nothing from Clerk", async () => {
    /*
     * THE ARCHITECTURAL RULE, ASSERTED ON THE SOURCE.
     *
     * <p>The tests above would still pass if somebody imported Clerk here and
     * only called it inside an effect — and the build would still fail the
     * moment that call moved into a render. What keeps the boundary is that
     * this module has no Clerk in it at all, which is a property of the file
     * rather than of a render, so it is read from the file.
     *
     * <p>Cheap, and it fails with the reason rather than with a stack: the one
     * thing a reader needs to know is that the Clerk-dependent half belongs in
     * `./callback`.
     */
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("app/sso-callback/page.tsx", "utf8");
    /*
     * Comments stripped first, and the first version of this test failed
     * without it: the file's own note quotes the build error, so a search for
     * `useClerk` found the explanation of why it is not there. The assertion
     * is about the code.
     */
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    expect(code).not.toMatch(/from\s+"@clerk\//);
    expect(code).not.toMatch(/useClerk/);
    // And the exchange is still reached the one way that is safe.
    expect(code).toContain("ssr: false");
  });
});
