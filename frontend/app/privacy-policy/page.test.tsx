import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import PrivacyNoticePage, { metadata } from "@/app/privacy-policy/page";
import { RECORDING_ANNOUNCEMENT } from "@/lib/privacy";
import { PRIVACY_NOTICE } from "@/lib/routes";
import { isPublicPath } from "@/middleware";

/**
 * THE PRIVACY & DEMO NOTICE.
 *
 * <p>Three kinds of case here, and the third is the reason the file is longer
 * than a render test.
 *
 * <p><b>It is readable at all.</b> A privacy page behind a login is worse than
 * no privacy page: the reader it is written for has not signed up, and deciding
 * whether to is the thing it informs. The landing footer's old `Privacy` link
 * went to `/privacy` — Account Settings, inside the authenticated group — so
 * following it signed out redirected to the sign-in form.
 *
 * <p><b>It is a document.</b> One `h1`, `h2`s under it, and links that can be
 * reached from a keyboard.
 *
 * <p><b>It claims nothing the code cannot back.</b> Which is mostly asserted as
 * absence: no terms, no acceptance, no cookie banner, no compliance
 * vocabulary, and — the two easiest sentences to write and the two that would
 * be false — no promise that deleting something reaches a provider's own copy,
 * and no promise that chat history is deleted on a schedule. `chat_history_days`
 * is stored on the user row and no scheduled pass reads it.
 */
describe("the Privacy & Demo Notice", () => {
  it("renders with no session, no store and no shell", () => {
    /*
     * Bare `render`, deliberately. It is a server component in `app/` rather
     * than in `app/(app)/`, so there is no `AuthGate` above it and no
     * `Provider` under it — no `useGetPreferencesQuery`, no `useAuth`, no
     * recording context. If any of that creeps in later this test is what
     * fails, and it fails for the right reason: a public page that needs a
     * store is a public page that needs a session.
     */
    render(<PrivacyNoticePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Privacy & Demo Notice" }),
    ).toBeInTheDocument();
  });

  it("is named a notice rather than a policy, in the page and in the tab", () => {
    // The heading the product owner asked for, and it is not called a Privacy
    // Policy anywhere: a policy is a document somebody is bound by, and this is
    // a disclosure by a portfolio project.
    render(<PrivacyNoticePage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Privacy & Demo Notice");
    expect(metadata.title).toBe("Privacy & Demo Notice — Reverie");
    expect(screen.queryByRole("heading", { name: /privacy policy/i })).not.toBeInTheDocument();
  });

  it("is a public route, or the link to it is worthless", () => {
    /*
     * The middleware's own matcher, not a copy of the list. The matcher reads
     * exactly one thing off the request — `nextUrl.pathname` — so a shape with
     * that on it is a faithful caller.
     *
     * <p>`/home` is asserted alongside it. This test could be passed by making
     * everything public, which is the one change here that would be a security
     * bug rather than a layout bug.
     */
    const at = (pathname: string) => isPublicPath({ nextUrl: { pathname } } as never);

    expect(at("/privacy-policy")).toBe(true);
    expect(at("/")).toBe(true);
    expect(at("/home")).toBe(false);
    // And `/privacy` is still behind the gate, because it is Account Settings.
    expect(at("/privacy")).toBe(false);
    // The path itself, as a literal: a published URL is a promise, and reading
    // it from the constant on both sides would let a rename pass silently.
    expect(PRIVACY_NOTICE).toBe("/privacy-policy");
  });

  it("has one h1, and every section is an h2 under it", () => {
    const { container } = render(<PrivacyNoticePage />);

    expect(container.querySelectorAll("h1")).toHaveLength(1);
    // No h3 anywhere: nothing here is a sub-topic of a section, and a heading
    // level skipped or nested for emphasis is the commonest way a document
    // becomes unnavigable.
    expect(container.querySelectorAll("h3, h4, h5, h6")).toHaveLength(0);
    const sections = [...container.querySelectorAll("h2")].map((h) => h.textContent);
    expect(sections).toEqual([
      "Portfolio status",
      "What Reverie processes",
      "AI processing",
      "Model training",
      "Recording responsibly",
      "Retention and deletion",
      "AI limitations",
    ]);
  });

  it("says it is a portfolio project and not a service", () => {
    render(<PrivacyNoticePage />);

    expect(screen.getByText(/portfolio\s+project/i)).toBeInTheDocument();
    expect(screen.getByText(/not a commercial service/i)).toBeInTheDocument();
  });

  it("carries the closing disclaimer, word for word", () => {
    render(<PrivacyNoticePage />);

    expect(
      screen.getByText(
        /Reverie is intended for demonstration and portfolio evaluation\. Do not use the demo for confidential, legally privileged, highly sensitive, or production-critical information\./,
      ),
    ).toBeInTheDocument();
  });

  it("quotes the announcement from lib/privacy rather than retyping it", () => {
    // The one string in the product meant to be read out loud to other people.
    // It is on this page and on the record page, and both import it.
    render(<PrivacyNoticePage />);

    expect(screen.getByText(new RegExp(RECORDING_ANNOUNCEMENT.slice(0, 40)))).toBeInTheDocument();
  });

  it("says the browser's permission is not somebody else's consent", () => {
    render(<PrivacyNoticePage />);

    expect(screen.getByText(/not consent from anybody else in the room/i)).toBeInTheDocument();
    expect(screen.getByText(/authorised to record and process/i)).toBeInTheDocument();
  });

  it("describes the retention the code actually implements", () => {
    render(<PrivacyNoticePage />);

    // Two windows, both starting at Never, and a nightly pass. RETENTION_CHOICES
    // and RetentionJob's cron.
    expect(screen.getByText(/both start at Never/i)).toBeInTheDocument();
    expect(screen.getByText(/Once a day Reverie removes anything past the window/i))
      .toBeInTheDocument();
  });

  it("names the one record that outlives the account, and what it cannot do", () => {
    /*
     * THE PAGE CANNOT SAY EVERYTHING GOES ANY MORE.
     *
     * <p>Reverie's free allowance is a lifetime one and used to be enforced by
     * a counter deleted with the account — so closing an account and signing up
     * again with the same address handed out another 100 minutes and 3 imports.
     * Closing that bypass means retaining something, and a privacy notice that
     * did not say so would be false in the one direction that matters.
     *
     * <p>What is asserted is the shape of the disclosure: what is kept, that it
     * is a hash rather than an address, and — the half somebody closing their
     * account actually cares about — that it cannot bring any content back.
     */
    render(<PrivacyNoticePage />);

    expect(screen.getByText(/One small record is kept on purpose/)).toBeInTheDocument();
    // "and it is the only one" is gone: a disaster-recovery backup outlives a
    // deletion too. What makes this record different is that it is kept on
    // purpose and does not expire, which is the distinction the next test
    // pins from the other side.
    expect(document.body.textContent ?? "").not.toMatch(/it is the only one/i);
    // Still says it cannot be reversed and still says what it is not, in words
    // that do not require knowing what a hash is.
    expect(screen.getByText(/scrambled in a way that cannot be reversed/i)).toBeInTheDocument();
    expect(screen.getByText(/no readable email address and no/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot bring any of them back/i)).toBeInTheDocument();
    // No claim that the retained row is anonymous in the absolute sense, and no
    // claim that it is more than it is.
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/anonymised|anonymized/i);
  });

  /**
   * DISASTER-RECOVERY BACKUPS, WHICH THE NOTICE USED NOT TO MENTION.
   *
   * <p>The production database is backed up to the Oracle host and to a
   * Cloudflare R2 bucket, both expiring after seven days. A backup taken
   * before a deletion therefore holds rows the live database no longer has,
   * which is not what "deletion is the real thing" on its own implies.
   *
   * <p>What is asserted here is the shape of the correction: that the window
   * is named, that live deletion and backup expiry are described as different
   * things, and that the backups are said to be out of reach of the product.
   * Not the exact sentence -- the wording may improve, and a test that pins
   * prose is a test that gets deleted the first time somebody edits it.
   */
  it("says how long a deleted thing can survive in a backup", () => {
    render(<PrivacyNoticePage />);
    const text = document.body.textContent ?? "";

    expect(text).toMatch(/Reverie keeps backups/i);
    expect(text).toMatch(/removed automatically\s+after seven days/i);
    // The window is what somebody deleting an account actually needs: not that
    // backups exist, but for how long they can still contain them.
    expect(text).toMatch(/for around a week after it has gone from Reverie/i);
  });

  it("keeps live deletion and backup expiry as separate claims", () => {
    // Collapsing them in either direction is a lie: "deleted everywhere at
    // once" understates the backups, and "deleted after seven days" overstates
    // how long the live application keeps anything.
    render(<PrivacyNoticePage />);
    const text = document.body.textContent ?? "";

    expect(text).toMatch(/Deleting really deletes/i);
    expect(text).toMatch(/gone from Reverie itself/i);
    // And the backups are not a second way to read the data.
    expect(text).toMatch(/Nothing in Reverie can read those\s+backups/i);
  });

  it("does not confuse the retained entitlement row with a backup", () => {
    /*
     * The two things that outlive an account are different in kind and the
     * notice has to keep them apart: one is a copy waiting to age out, the
     * other is a decision that does not expire. Somebody reading this to find
     * out what is kept of theirs needs both answers, not a merged one.
     */
    render(<PrivacyNoticePage />);
    const text = document.body.textContent ?? "";

    expect(text).toMatch(/kept on purpose, and unlike a backup it does\s+not\s+expire/i);
    expect(text).toMatch(/how much of your free\s+allowance has already been used/i);
  });

  it("claims nothing about backups it has not configured", () => {
    // No certification, no contract, no regulation. This is a portfolio
    // project's disclosure of an operational fact.
    render(<PrivacyNoticePage />);
    const text = document.body.textContent ?? "";

    expect(text).not.toMatch(/GDPR|CCPA|PIPEDA|SOC ?2|ISO ?27001|HIPAA/i);
    expect(text).not.toMatch(/encrypted backups|guarantee|certified/i);
  });

  it("promises no deletion it cannot perform", () => {
    /*
     * THE TWO SENTENCES THAT WOULD HAVE BEEN FALSE.
     *
     * <p>Nothing in this codebase calls a transcription or language-model
     * provider to delete anything, so a page claiming erasure "everywhere" or
     * "from our providers" would be the one outright lie on it. And no
     * scheduled pass reads `chat_history_days`, so chat history is not deleted
     * on a schedule however much the column suggests it might be.
     */
    const { container } = render(<PrivacyNoticePage />);
    const text = container.textContent ?? "";

    expect(text).toMatch(/does not reach the outside AI\s+services/i);
    expect(text).not.toMatch(/deleted everywhere|erased from (our|all) providers/i);
    expect(text).not.toMatch(/chat history is deleted/i);
  });

  it("does not overstate the training claim", () => {
    const { container } = render(<PrivacyNoticePage />);
    const text = container.textContent ?? "";

    // What is provable: there is no training code here, and no administrator
    // view to review anything through.
    expect(text).toMatch(/does not train on your meetings/i);
    // What is not: anything about what a provider does with an API request.
    // That belongs to the provider's terms and is said to belong there.
    expect(text).toMatch(/set their own rules for what they do with/i);
    expect(text).not.toMatch(/never used by (any|our) provider|no provider (ever )?trains/i);
  });

  it("introduces no terms, no acceptance and no compliance furniture", () => {
    /*
     * The explicit shape of the request, held as a rule. A portfolio project
     * with an arbitration clause is a portfolio project pretending to be a
     * company, and every one of these words would have to be invented.
     */
    const { container } = render(<PrivacyNoticePage />);
    const text = container.textContent ?? "";

    for (const forbidden of [
      /terms (of service|and conditions)/i,
      /\bcookies?\b/i,
      /arbitration/i,
      /\bGDPR\b/,
      /\bCCPA\b/,
      /data processing agreement|\bDPA\b/i,
      /\bSOC ?2\b|\bISO ?27001\b|\bHIPAA\b/i,
      /\bwe are compliant\b|fully compliant/i,
      /by using .*you agree/i,
    ]) {
      expect(text, String(forbidden)).not.toMatch(forbidden);
    }
    expect(container.querySelector("input[type=checkbox]")).toBeNull();
    expect(container.querySelector('a[href*="terms"]')).toBeNull();
  });

  it("offers the way back, and nothing else to click", () => {
    // One link: the lockup, home. A public document with a nav bar on it is a
    // second landing page.
    const { container } = render(<PrivacyNoticePage />);

    const links = [...container.querySelectorAll("a")];
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/");
    // Reachable from a keyboard: it is an anchor with an href and no tabindex
    // taking it out of the order.
    expect(links[0].getAttribute("tabindex")).toBeNull();
  });

  it("wears the product lockup, announced once", () => {
    /*
     * The main Reverie identity, as the nav and the auth shell draw it — and
     * `decorative`, so the artwork is hidden from a screen reader and the
     * accessible name is the wordmark beside it. Without that the link reads
     * "Reverie Reverie": the image's alt and the word are the same word.
     */
    const { container } = render(<PrivacyNoticePage />);

    const image = container.querySelector("img")!;
    expect(image).not.toBeNull();
    expect(image.getAttribute("alt")).toBe("");
    expect(image.closest("[data-ai-mark]")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("link", { name: "Reverie" })).toBeInTheDocument();
  });

  it("reads on the app's own ground, in one column", () => {
    // The landing's frame — near-black canvas and the one ambient wash — over a
    // single `--measure` reading column. No cards: `.v2-note` is the only
    // bordered thing on the page and it is a left hairline.
    const { container } = render(<PrivacyNoticePage />);

    expect(container.querySelector(".v2-ambient")).not.toBeNull();
    expect(container.querySelector(".bg-background")).not.toBeNull();
    expect(container.querySelector("main")!.className).toContain("max-w-measure");
    expect(container.querySelectorAll(".shadow-e2, .rounded-2xl, .rounded-xl")).toHaveLength(0);
  });
});
