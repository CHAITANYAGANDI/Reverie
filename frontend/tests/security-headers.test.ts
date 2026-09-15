import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextConfig = require("../next.config.js");

/**
 * The security headers, and the Content-Security-Policy in particular.
 *
 * <h2>Why this file exists</h2>
 *
 * <p>A CSP fails silently by design. The browser blocks the request, writes a
 * line to a console nobody is reading, and the feature simply does not happen —
 * so the symptom is never "the policy is wrong", it is whatever the blocked
 * thing was supposed to do.
 *
 * <p>Reported twice, and the second one is what prompted this. Email/password
 * sign-up kept failing with "We could not confirm you are not a robot." after
 * `#clerk-captcha` had already been added to the form. The element was there;
 * the policy would not let Clerk fetch the challenge to put in it. Two defects
 * with one symptom, and the first fix looked like it had not worked.
 *
 * <p>These assert the directives rather than snapshot the whole policy. A
 * snapshot would fail on every unrelated origin anybody ever adds, which trains
 * people to update it without reading it.
 */

/** The policy as the config actually emits it, not as it is written. */
async function csp(): Promise<string> {
  const groups = await nextConfig.headers();
  const header = groups
    .flatMap((group: { headers: { key: string; value: string }[] }) => group.headers)
    .find((h: { key: string }) => h.key === "Content-Security-Policy");

  expect(header, "Content-Security-Policy is not being sent at all").toBeDefined();
  return header.value;
}

/** One directive's source list, so an origin cannot be matched in the wrong one. */
function directive(policy: string, name: string): string {
  const found = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));

  expect(found, `the policy has no ${name} directive`).toBeDefined();
  return found as string;
}

describe("the Content-Security-Policy", () => {
  it("is still being sent", async () => {
    // The floor. Everything below is about what the policy permits; this is
    // about the policy existing, which is the one regression that would make
    // all the other assertions meaningless.
    expect(await csp()).toContain("default-src 'self'");
  });

  it("keeps the restrictions that make it worth having", async () => {
    // Guards against "fixing" a block by loosening the base rather than by
    // naming an origin.
    const policy = await csp();

    expect(directive(policy, "default-src")).toBe("default-src 'self'");
    expect(directive(policy, "object-src")).toBe("object-src 'none'");
    expect(directive(policy, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(policy, "base-uri")).toBe("base-uri 'self'");
    expect(directive(policy, "form-action")).toBe("form-action 'self'");
  });

  it("has no bare wildcard anywhere", async () => {
    // `*` or `https:` in a fetch directive is the policy giving up. img-src and
    // media-src are the deliberate exceptions -- they already carry `https:`,
    // because a presigned R2 URL's host is not known in advance.
    const policy = await csp();

    for (const name of ["default-src", "script-src", "frame-src", "connect-src", "style-src"]) {
      const sources = directive(policy, name).split(/\s+/).slice(1);
      expect(sources, `${name} has a bare wildcard`).not.toContain("*");
      expect(sources, `${name} allows any https origin`).not.toContain("https:");
    }
  });
});

describe("Clerk bot protection", () => {
  /*
   * Smart CAPTCHA is Cloudflare Turnstile served through Clerk. The widget is a
   * script that renders its challenge in an iframe, so both directives are
   * required and allowing one without the other fails the same way.
   */
  it("can load the challenge script", async () => {
    const script = directive(await csp(), "script-src");

    expect(script).toContain("https://challenges.cloudflare.com");
    expect(script).toContain("https://*.protect.clerk.com");
  });

  it("can frame the challenge it draws", async () => {
    const frame = directive(await csp(), "frame-src");

    expect(frame).toContain("https://challenges.cloudflare.com");
    expect(frame).toContain("https://*.protect.clerk.com");
  });

  it("can reach the abuse checks on whichever port they answer on", async () => {
    /*
     * The `:*` is the point, and it is easy to look redundant: `*.clerk.com` is
     * already in connect-src and CSP host wildcards do span multiple labels, so
     * `*.protect.clerk.com` is already matched -- on 443. A host-source with no
     * port means the scheme's default port, and these checks can answer on
     * others. Asserting the literal with the port wildcard is what stops
     * somebody removing it as a duplicate.
     */
    const connect = directive(await csp(), "connect-src");

    expect(connect).toContain("https://*.protect.clerk.com:*");
  });

  it("puts the bot-protection origins where they are needed and nowhere else", async () => {
    // Turnstile has no reason to be a connect-src entry or an img-src one, and
    // an origin added to every directive "to be safe" is a policy nobody trusts.
    const policy = await csp();

    expect(directive(policy, "connect-src")).not.toContain("https://challenges.cloudflare.com");
    expect(directive(policy, "default-src")).not.toContain("challenges.cloudflare.com");
  });
});
