import { describe, it, expect, afterEach, vi } from "vitest";

import { LEGAL_LINKS, PRIVACY_NOTICE_LABEL } from "@/lib/build-info";
import { PRIVACY_NOTICE } from "@/lib/routes";

/**
 * THE LEGAL LINKS, AND THE ONE THAT NOW HAS A DEFAULT.
 *
 * <p>The module reads `process.env` once, at import, because Next inlines
 * `NEXT_PUBLIC_*` at build time and a value re-read per call would be a
 * different thing from what ships. So the cases that need a different
 * environment reset the module registry and import it again; the two at the top
 * assert the shipped default, which is the state every environment is in unless
 * somebody has configured otherwise.
 */
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function withEnv(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("@/lib/build-info");
}

describe("LEGAL_LINKS", () => {
  it("links the notice this repository ships, with nothing configured", () => {
    /*
     * The change of default, and the reason for it: this used to render nothing
     * until somebody supplied a URL, on the sound principle that a link to a
     * page that does not exist is worse than no link. `app/privacy-policy` is
     * in the bundle, so that principle now argues the other way — a default
     * pointing at a route in the same repository cannot 404, and the failure
     * mode of the alternative is a privacy page linked from nowhere.
     */
    expect(LEGAL_LINKS).toEqual([
      { label: PRIVACY_NOTICE_LABEL, href: PRIVACY_NOTICE, internal: true },
    ]);
    expect(PRIVACY_NOTICE_LABEL).toBe("Privacy & Demo Notice");
  });

  it("ships no terms of service, and no placeholder for one", () => {
    // Terms are a document somebody has to write and be bound by. There are
    // none, so there is no link and no empty entry pretending there might be.
    expect(LEGAL_LINKS.map((l) => l.label)).not.toContain("Terms of Service");
    expect(LEGAL_LINKS.every((l) => l.href.length > 0)).toBe(true);
  });

  it("lets a deployment with a real hosted policy override the internal one", async () => {
    const mod = await withEnv({ NEXT_PUBLIC_PRIVACY_URL: "https://example.com/privacy" });

    // And it is labelled Privacy Policy, because that is a different kind of
    // document from the notice in this tree — one somebody is bound by.
    expect(mod.LEGAL_LINKS).toEqual([
      { label: "Privacy Policy", href: "https://example.com/privacy" },
    ]);
    expect(mod.LEGAL_LINKS[0].internal).toBeUndefined();
  });

  it("takes terms only when a deployment supplies them, and puts them first", async () => {
    const mod = await withEnv({ NEXT_PUBLIC_TERMS_URL: "https://example.com/terms" });

    expect(mod.LEGAL_LINKS.map((l) => l.label)).toEqual([
      "Terms of Service",
      "Privacy & Demo Notice",
    ]);
  });

  it("ignores whitespace, which is what an unset variable often is", async () => {
    const mod = await withEnv({ NEXT_PUBLIC_TERMS_URL: "   ", NEXT_PUBLIC_PRIVACY_URL: "  " });

    // A compose file with `NEXT_PUBLIC_TERMS_URL: ${TERMS:-}` yields an empty
    // string, and an empty string is not a document.
    expect(mod.LEGAL_LINKS).toEqual([
      { label: PRIVACY_NOTICE_LABEL, href: PRIVACY_NOTICE, internal: true },
    ]);
  });
});
