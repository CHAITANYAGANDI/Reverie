import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LandingPage from "@/app/page";

/**
 * The front door, and the one screen read by people with no way to check.
 *
 * <h2>Two kinds of test here, and they guard against opposite mistakes</h2>
 *
 * <p><b>Claim rot.</b> This page promised five meetings a month when the
 * allowance was 100 minutes; it advertised share links after sharing was
 * removed; and it offered "agent follow-ups" that would draft emails, create
 * tasks and write Notion notes — none of which ever existed, and one of which
 * cannot, because there is no email sender in this codebase at all. Marketing
 * copy rots differently from code: nothing fails when a feature leaves, so the
 * sentence outlives it. Those tripwires are unchanged below.
 *
 * <p><b>Design drift.</b> The second kind is new. This page had already been
 * rewritten once into an invented marketing layout — a transcript vignette, a
 * statistics strip, a numbered "how it works", an eight-item feature grid and a
 * closing slogan. Every line was true and none of it was the approved V2
 * composition. So the V2 identity is now pinned too: the kicker, both lines of
 * the headline, the two Included groups, the real brand mark, and the three
 * invented headlines named explicitly so they cannot come back.
 */

/**
 * The hero's tagline, exactly.
 *
 * <p>This has been three things, and the round trip is the point. It was live
 * type; then pixels inside the approved lockup, reachable only as the image's
 * `alt`; then `sr-only` text beside a decorative image. It is live type again,
 * because the hero's artwork is the AI orb now and the orb carries no words —
 * so the objection that killed the typographic version (the lockup's `Reverie`
 * is set in a face this product does not ship) no longer applies.
 *
 * <p>Letterspaced caps, exactly as specified. Several tests name it, which is
 * exactly why it is one constant.
 */
const HERO_TAGLINE = "CONVERSATIONAL INTELLIGENCE";

describe("what it promises", () => {
  it("quotes the allowance the server actually enforces", () => {
    render(<LandingPage />);

    /*
     * UsageLimitService.MINUTES_ALLOWANCE and IMPORT_ALLOWANCE.
     *
     * <p>Read off `Keeping` now rather than the hero. The hero carried it as a
     * grey footnote under the buttons — "100 minutes and three imports, for the
     * life of the account. No card." — and that line is withdrawn. The promise
     * is not: it is stated in full further down, beside what happens to the
     * recording, which is where somebody weighing the product up is reading.
     *
     * <p>Asserted loosely on the numbers rather than on the sentence, because
     * what must not drift is 100 and three, not the wording around them.
     */
    expect(
      screen.getByText(/100 transcribed minutes and three imports for the life of the account/i),
    ).toBeInTheDocument();
  });

  it("no longer sells the price under the buttons", () => {
    const { container } = render(<LandingPage />);

    // The footnote, specifically: the hero's own copy ends at the two doors.
    expect(container.textContent).not.toMatch(/100 minutes and three imports/i);
  });

  it("does not sell a meeting quota, which is not how the limit works", () => {
    const { container } = render(<LandingPage />);

    // "Five meetings a month" was on this page for months. The limit is
    // minutes, once, for the life of the account.
    expect(container.textContent).not.toMatch(/meetings a month|per month|monthly/i);
  });

  it.each([
    ["sharing, which was removed", /share link|shareable|share a meeting/i],
    ["email, which has no sender in this codebase", /email recap|daily digest|draft email/i],
    ["Notion and agent follow-ups, which never existed", /notion|agent follow|schedule meetings/i],
    ["a calendar, which was removed", /calendar|ical/i],
  ])("does not advertise %s", (_label, forbidden) => {
    const { container } = render(<LandingPage />);

    expect(container.textContent).not.toMatch(forbidden);
  });

  /**
   * The V2 concepts with no schema behind them.
   *
   * <p>`V14` and `V15` dropped `meeting_decisions`, `decision_links`,
   * `decision_vectors`, `commitments` and `commitment_evidence`. The approved
   * V2 landing artifact sold exactly these — its hero read "when a later
   * meeting reverses a decision or a promise quietly slips, you are the one who
   * is told" — so this is the one page where restoring the artifact verbatim
   * would have been the wrong thing to do.
   */
  it.each([
    ["a commitment ledger", /commitment/i],
    ["a promise journey", /promise journey|promise/i],
    ["decision drift", /decision drift|drift/i],
    ["decision history", /decision history/i],
    ["a reversal watcher", /reverses|reversed|slipped|since last meeting/i],
    ["memory as a product feature", /memory layer|meeting memory/i],
  ])("does not advertise %s", (_label, forbidden) => {
    const { container } = render(<LandingPage />);

    expect(container.textContent).not.toMatch(forbidden);
  });

  it("does not claim search understands meaning, because it does not", () => {
    const { container } = render(<LandingPage />);

    // `SearchCommand` is lexical, with `when:` `type:` `tag:` and `in:` over
    // conversations and transcript mentions. It deliberately does not call
    // `POST /search/semantic`. The page it replaced said "find the meeting
    // where a decision was made without knowing the words used", which is a
    // claim about an endpoint this product does not use.
    expect(container.textContent).not.toMatch(
      /semantic|without knowing the words|by meaning|understands what you mean/i,
    );
    expect(
      screen.getByText(/Search conversations and transcript mentions/i),
    ).toBeInTheDocument();
  });

  it("names only capabilities that have a surface behind them", () => {
    render(<LandingPage />);

    // `getAllBy`, because several of these are named twice on purpose now: the
    // sticky showcase says what a stage does and Included says it again as a
    // capability. Mentioning something in the demonstration and in the list is
    // ordinary; what the test is about is that it is named at all.
    for (const real of [
      /Record in your browser/i,
      /Import audio or video/i,
      /Speakers, separated/i,
      /Action items, decisions and risks/i,
      /Ask one meeting, or all of them/i,
      /A transcript you can correct/i,
      // The formats the product actually writes. It used to say "PDF,
      // Word, Markdown or plain text", and three of those four now have
      // no surface behind them at all -- which is what this test is for.
      /The summary and the transcript as PDF, and the recording as MP3/i,
    ]) {
      expect(screen.getAllByText(real).length).toBeGreaterThan(0);
    }
  });
});

describe("the way in", () => {
  it("offers the two doors, and lands them", () => {
    /*
     * It asserted "twice over" — the nav's pair and the hero's. The hero's are
     * withdrawn: the nav carries the same two at the top of every screen, so
     * the hero was offering the same doors a second time inside one viewport.
     *
     * <p>What has to stay true is that a way in exists and goes where it says.
     * The count is asserted below, per door, rather than as "at least two"
     * here — a loose lower bound is what let the hero's pair sit unquestioned.
     */
    render(<LandingPage />);

    const signUp = screen.getAllByRole("link", { name: /Create a free account|Get started/ });
    expect(signUp.length).toBeGreaterThanOrEqual(1);
    for (const link of signUp) expect(link).toHaveAttribute("href", "/sign-up");
  });

  it("keeps no call to action in the hero", () => {
    /*
     * SETTLED, AFTER BEING UNSETTLED TWICE — and the history is the point, so
     * that nobody re-derives the middle position from first principles again.
     *
     * <p>A pair of buttons stood here. They were withdrawn: the header carries
     * `Get started` and `Sign in` at the top of every screen, so the hero was
     * offering the same two doors a second time inside one viewport. A later
     * composition drew them back in and this test was inverted to match. That
     * was not the intent, and they are withdrawn again.
     *
     * <p>Which lets the hero be an identity, a claim, and what it costs. The
     * reader is not asked to decide before the page has shown them anything;
     * the product does that further down.
     */
    const { container } = render(<LandingPage />);

    const hero = container.querySelector("main > section")!;
    expect(hero.querySelectorAll("a")).toHaveLength(0);
    expect(hero.textContent).not.toMatch(/Create a free account/i);
    // The header's pair is untouched and is the only way in from the fold.
    const header = container.querySelector("header")!;
    expect([...header.querySelectorAll("a")].map((a) => a.textContent?.trim())).toEqual([
      "Sign in",
      "Get started",
    ]);
  });

  it("offers Sign in twice, and every one of them lands", () => {
    // The header and the footer. It was three for as long as the hero carried
    // its own pair, which is withdrawn. Asserting the count rather than "at
    // least one" is what catches a door quietly closing.
    render(<LandingPage />);

    const signIn = screen.getAllByRole("link", { name: "Sign in" });
    expect(signIn).toHaveLength(2);
    for (const link of signIn) expect(link).toHaveAttribute("href", "/sign-in");
  });

  it("points the privacy link at a page a visitor can actually read", () => {
    /*
     * IT USED TO POINT AT THE LOGIN.
     *
     * <p>The link read `Privacy` and went to `/privacy`, which is Account
     * Settings → Data Retention — inside the authenticated group. So the one
     * link on this page that somebody follows *before* deciding whether to sign
     * up redirected them to the sign-in form. `/privacy` itself is unchanged
     * and still lands on that tab, because notification rows carry it.
     *
     * <p>One link, not two: a second privacy link beside a broken one would be
     * worse than the bug. And the label is the document's real name — the page
     * is a Privacy & Demo Notice and deliberately not a privacy policy.
     */
    render(<LandingPage />);

    const link = screen.getByRole("link", { name: "Privacy & Demo Notice" });
    expect(link).toHaveAttribute("href", "/privacy-policy");
    expect(screen.queryByRole("link", { name: "Privacy" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Privacy Policy$/ })).not.toBeInTheDocument();
  });

  it("adds no legal furniture beside the notice", () => {
    /*
     * The footer gained a privacy link that works. It did not gain a Terms, and
     * this is here so it cannot: Reverie asks nobody to agree to anything, has
     * no terms of service, sets no cookies it needs to announce, and makes no
     * compliance claim. A portfolio project with a DPA link is a portfolio
     * project pretending to be a company.
     *
     * <p>Read off the links rather than the page text, for the reason the case
     * below gives: a word in a sentence is not a nav item.
     */
    const { container } = render(<LandingPage />);

    const footer = container.querySelector("footer")!;
    expect([...footer.querySelectorAll("a")].map((a) => a.textContent?.trim())).toEqual([
      "Privacy & Demo Notice",
      "Sign in",
    ]);
    for (const link of container.querySelectorAll("a")) {
      expect(link.textContent ?? "").not.toMatch(/terms|cookie|legal|\bDPA\b|compliance|security/i);
    }
    // And nothing anywhere asks for consent to a document.
    expect(container.querySelector("input[type=checkbox]")).toBeNull();
    expect(container.textContent).not.toMatch(/by using .*you agree/i);
  });

  it("invents no links that go nowhere", () => {
    // The design artifact's public nav carried "How it works" and "Pricing",
    // both `href="#"`. Neither is a route, and there is one plan.
    //
    // Read off the LINKS rather than off the page text, which is the honest
    // scope of the rule: "Pricing sync" is an ordinary name for a meeting and
    // appears in the preview, and a text-wide grep for /pricing/ would forbid
    // demo content in order to forbid a nav item.
    const { container } = render(<LandingPage />);

    expect(container.querySelector('a[href="#"]')).toBeNull();
    const links = Array.from(container.querySelectorAll("a")).map((a) => a.textContent ?? "");
    for (const link of links) {
      expect(link).not.toMatch(/pricing|enterprise|careers|terms|how it works/i);
    }
  });
});

/**
 * The approved V2 hero, word for word.
 *
 * <p>Pinned because this is the part that drifted. The previous version's
 * headline — "Everything said. Everything decided." — was a perfectly good
 * slogan somebody wrote instead of using the approved one.
 */
describe("the hero", () => {
  it("carries the identity's tagline, in the specified words", () => {
    /*
     * `Reverie — Conversational Intelligence`, exactly, as live text.
     *
     * <h2>Why this assertion has moved twice</h2>
     *
     * <p>It was rendered text: the wordmark set in the product typeface with a
     * tracked tagline under it. Then it was the hero image's `alt`, because the
     * approved render carries both inside the picture — the artwork's `Reverie`
     * is set in a face this product does not ship.
     *
     * <p>Then `sr-only` text beside a decorative image. And now visible type
     * again: the hero's artwork is the AI orb, which carries no words, so the
     * wordmark and the tagline are set in the product's own face under it.
     *
     * <p>Which is where this started, and the reason it is right this time is
     * that the objection has gone rather than been overruled. Setting the
     * *lockup's* `Reverie` in markup meant imitating a typeface this product
     * does not ship; setting the product's name beside an orb is just the name.
     *
     * <p>Exactly once, and visibly. There is no `sr-only` copy any more — with
     * the words on the page it would announce the identity twice.
     */
    const { container } = render(<LandingPage />);

    const tagline = screen.getByText(HERO_TAGLINE);
    expect(tagline).toBeInTheDocument();
    expect(tagline.className).not.toContain("sr-only");
    expect(screen.getAllByText(HERO_TAGLINE)).toHaveLength(1);
    expect(container.querySelectorAll(".sr-only")).toHaveLength(0);

    /* And no artwork in the hero at all any more: the identity here is type,
       and the orb is in the bar above — see the test below.

       <p>Scoped to the hero rather than written as `main > section img`, which
       matches a descendant of *any* section: `StageShowcase` draws a mock band
       with the same orb in it, four screens down, and that selector found it. */
    const heroSection = container.querySelectorAll("main > section")[0];
    expect(heroSection.querySelector("img")).toBeNull();
  });

  it.each([
    ["Conversations into clarity", /conversations into clarity/i],
    ["Conversation Intelligence, singular", /\bconversation intelligence\b/i],
    ["Meeting Intelligence", /meeting intelligence/i],
    ["AI Meeting Assistant", /ai meeting assistant/i],
    ["Conversational AI", /conversational ai\b/i],
  ])("does not say %s", (_label, forbidden) => {
    // Near-misses for the tagline. Each is a different product's positioning
    // and one of them was on this page until recently.
    const { container } = render(<LandingPage />);

    expect(container.textContent).not.toMatch(forbidden);
  });

  it("puts the identity first and the claim second", () => {
    /*
     * THE REPORTED PROBLEM, AS AN ORDER.
     *
     * <p>The hero was a small lockup immediately above the headline and the
     * two were the same weight, so the page had no first thing. Scale is a
     * `clamp()` and has no meaning in jsdom — it is measured against the
     * rendered page — so what is held here is that the identity is the hero's
     * opening element, complete, and that the claim follows it.
     */
    const { container } = render(<LandingPage />);

    const hero = container.querySelector("main > section")!;
    /* The identity is the wordmark now — no mark, no picture — so what is
       ordered against the claim is the word. Which is the thing this test was
       always about: something identifies the product before anything claims
       anything about it.

       <p>Found within the hero rather than with `screen`, because `Reverie` is
       also the footer's lockup word and an unscoped query is ambiguous. */
    const mark = [...hero.querySelectorAll("span")].find(
      (el) => el.textContent === "Reverie AI",
    )!;
    const heading = screen.getByRole("heading", { level: 1 });

    expect(mark).toBeDefined();
    expect(mark.compareDocumentPosition(heading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("leads with the AI orb, and keeps the lens for the functional lockups", () => {
    /*
     * INVERTED DELIBERATELY, AND IT WAS THE STRONGEST RULE IN THIS FILE.
     *
     * <p>This asserted the opposite: that the orb appears nowhere on the
     * landing page. The argument was that Reverie has two identities — the lens
     * answers "which product is this?" and the orb answers "where is Reverie's
     * assistant?" — and that leading with the orb claims the product *is* an
     * assistant, which is a different claim from the one the headline makes.
     *
     * <p>That argument is recorded here rather than deleted, because it is a
     * real one and somebody will reach for it again. It was overruled by the
     * product owner, who asked for the orb in the hero directly. It was a
     * design position, not a constraint, and this test now holds the position
     * that replaced it.
     *
     * <p>NOTHING STILL HOLDS, and that is the honest state: the lens is gone
     * from this page. It went from the hero, then from the bar, then from the
     * footer — one request at a time — and the orb is the product's only mark.
     *
     * <p>So what this test does now is count where the mark appears and where
     * it does not. Two places: the bar, and the mock band inside
     * `StageShowcase`, which is a picture of the application and so wears
     * whatever the application wears. Not the hero, which is type — a mark
     * there would put a 320px object back above a 56px headline, which is what
     * its removal was for. And not the footer, which was asked for as the word
     * by itself.
     */
    const { container } = render(<LandingPage />);

    const orbs = [...container.querySelectorAll("img")];
    expect(orbs).toHaveLength(2);
    for (const img of orbs) {
      expect(img.getAttribute("src")).toBe("/brand/reverie-ai-orb-mark.webp");
    }
    expect(container.querySelector("header img")).not.toBeNull();
    expect(container.querySelectorAll("main > section")[0].querySelector("img")).toBeNull();
    expect(container.querySelector("footer img")).toBeNull();
    // And no lens anywhere: the drawn mark is gone from this page with it.
    expect(container.querySelectorAll("svg[aria-label]")).toHaveLength(0);
  });

  it("keeps the headline exactly, on its two authored lines", () => {
    // Not rewritten and not reflowed. The pair is the copy's own rhythm and a
    // viewport that put "Keep" at the end of the first line would break it.
    render(<LandingPage />);

    const heading = screen.getByRole("heading", { level: 1 });
    const lines = Array.from(heading.querySelectorAll("span")).map((s) => s.textContent);
    expect(lines).toEqual(["Remember the conversation.", "Keep the meaning."]);
  });

  it("keeps the compact lockup in the nav, with no tagline in it", () => {
    /*
     * Two different objects. The nav's is the thing you press to get home, in
     * a row with Sign in and Get started; the tagline belongs under the hero
     * wordmark and nowhere else, which is why it appears exactly once.
     */
    const { container } = render(<LandingPage />);

    /* CHANGED: the bar is the orb alone now. It held the lens with `Reverie`
       beside it, and the word went on request — the hero forty pixels below
       says the name in 62px type, so the bar was naming the product directly
       above the place the product names itself. The mark is not a link here
       either (you are already home), so it had no label to carry. */
    const header = container.querySelector("header")!;
    expect(header.querySelector("[data-ai-mark]")).not.toBeNull();
    expect(header.querySelector("svg")).toBeNull();
    expect(header.textContent).not.toMatch(/\bReverie\b/);
    expect(header.textContent).not.toMatch(/CONVERSATIONAL/i);
    // Named, because with the word gone the mark is the bar's whole identity.
    expect(header.querySelector("img")!.getAttribute("alt")).toBe("Reverie");
    /* The tagline appears exactly once on the page, in the hero. The nav's
       lockup is the vector lens with live type beside it and must never carry a
       tagline of its own. */
    expect(screen.getAllByText(HERO_TAGLINE)).toHaveLength(1);
    expect(header.textContent).not.toMatch(/CONVERSATIONAL/i);
  });

  it("labels the identity once per lockup and never twice in one", () => {
    /*
     * The hero mark, the nav mark and the footer mark. Each is one accessible
     * name beside its own text — a mark labelled "Reverie" next to a second
     * element also labelled "Reverie" is the product's name announced twice
     * for one logo.
     */
    render(<LandingPage />);

    /* ONE mark named `Reverie` now: the bar's. The count has been three, then
       two drawn lockups, then one lens and one orb, then two orbs — and it is
       one, because the footer was asked for as the word alone.

       <p>The count is what matters rather than the number: one accessible name
       per mark, never two on one, so a stray extra label cannot appear
       unnoticed. The showcase's mock band carries an orb too and is
       deliberately *not* named — it is a picture of an interface, not a second
       identity, and naming it would announce the product twice. */
    const named = screen.getAllByRole("img", { name: "Reverie" });
    expect(named).toHaveLength(1);
    expect(named[0].getAttribute("src")).toBe("/brand/reverie-ai-orb-mark.webp");
    expect(named[0].closest("header")).not.toBeNull();
    expect(screen.getAllByText(HERO_TAGLINE)).toHaveLength(1);
  });

  it("adds the hero's own light without replacing the page's", () => {
    /*
     * Four layers and they are all decoration: the page's wash, and the hero's
     * three — a field above, a field below, and the lit curve where the
     * identity gives way to the page. `AmbientCanvas` is untouched, the brief
     * having been explicit that the global system stays, and every one of them
     * is out of the accessibility tree.
     *
     * <p>`.v2-hero-bloom` was in this list and is gone: it lived inside the
     * identity's wrapper so it could scale with the mark, and with no mark
     * drawn there is nothing for it to scale to. The two fields replaced it
     * and are sized against the section.
     */
    const { container } = render(<LandingPage />);

    for (const cls of [
      ".v2-ambient",
      ".v2-hero-light-top",
      ".v2-hero-light-bottom",
      ".v2-hero-arc",
    ]) {
      const el = container.querySelector(cls);
      expect(el, cls).not.toBeNull();
      expect(el!.getAttribute("aria-hidden"), cls).toBe("true");
    }
  });

  it("leads with the identity rather than with a kicker", () => {
    /*
     * It led with "Meeting intelligence, without the meeting-tool clutter." in
     * azure `.v2-label`. The logo is in that place now: the mark at a size
     * where the waveform inside it is legible, with the word under it.
     *
     * <p>Two "Reverie"s in the first fold is deliberate and is checked below —
     * the nav's is functional, the hero's is the identity.
     */
    const { container } = render(<LandingPage />);

    expect(container.textContent).not.toMatch(/meeting-tool clutter/i);
    /* The identity above the headline it introduces — and it is type, so the
       words *are* the identity. There is no mark in the hero to position. */
    const hero = container.querySelector("main > section")!;
    expect(hero.querySelector("img")).toBeNull();
    expect(
      screen
        .getByText(HERO_TAGLINE)
        .compareDocumentPosition(screen.getByRole("heading", { level: 1 })),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("carries both lines of the V2 headline, in one h1", () => {
    render(<LandingPage />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Remember the conversation.");
    expect(heading).toHaveTextContent("Keep the meaning.");
  });

  it("says what the product does without naming a capability it lacks", () => {
    render(<LandingPage />);

    expect(
      screen.getByText(/Reverie turns recordings into a clear record/i),
    ).toBeInTheDocument();
    // "action items", not "commitments" -- the one functional-language
    // adaptation to the approved copy, because Action Items are the real model.
    expect(screen.getByText(/speakers, transcript, brief, action items/i)).toBeInTheDocument();
  });

  it("closes on what it costs rather than on a button", () => {
    /*
     * This asserted the ordering of the hero's two calls to action — the
     * filled one first, `Sign in` after it. Both are withdrawn: the nav
     * carries the same pair at the top of every screen, so the hero was
     * offering the same two doors a second time inside one viewport.
     *
     * <p>What ends the hero now is the answer to the question a stranger asks
     * straight after reading the claim, in the approved words. It is the last
     * thing in the section, which is the ordering that matters here.
     */
    const { container } = render(<LandingPage />);

    const hero = container.querySelector("main > section")!;
    const note = screen.getByText(
      "100 transcription minutes and 3 imports included free. No card required.",
    );
    expect(hero).toContainElement(note);
    expect(note.compareDocumentPosition(screen.getByRole("heading", { level: 1 }))).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    );
  });
});

describe("the product identity", () => {
  it("uses the Reverie mark rather than a microphone glyph", () => {
    // It was a `<Mic />` in a filled rounded square, which is the generic
    // recorder logo the V2 identity study explicitly rejected -- and it meant
    // the public page and the application wore two different brands.
    //
    // Scoped to the header and the footer, which is where identity lives. A
    // mic glyph elsewhere is not the brand: the product preview draws the
    // application's own Record button, and that button has one.
    const { container } = render(<LandingPage />);

    expect(container.querySelector("header")!.querySelector(".lucide-mic")).toBeNull();
    expect(container.querySelector("footer")!.querySelector(".lucide-mic")).toBeNull();
    expect(screen.getAllByRole("img", { name: "Reverie" }).length).toBeGreaterThan(0);
  });

  it("names the product beside the mark, three times and no more", () => {
    render(<LandingPage />);

    /*
     * The nav and the footer — two, as rendered *text*.
     *
     * <p>Three: the bar's, the hero's and the footer's. The count has been
     * three, two, three, two — the hero's word became pixels and came back as
     * type, and the bar's went when the bar became the orb alone and returned
     * when the word was asked for again.
     *
     * <p>Counted rather than merely asserted present, because the word is the
     * one thing on this page that could quietly appear again inside a showcase
     * and turn the identity into a repetition.
     */
    expect(screen.getAllByText("Reverie").length).toBe(3);
    expect(screen.getAllByText(HERO_TAGLINE)).toHaveLength(1);
  });
});

/**
 * The section that replaced the invented feature grid.
 *
 * <p>Two conceptual groups, which is how the approved design organised this:
 * what Reverie does to a recording, and what you then do with it.
 */
describe("the Included section", () => {
  it("exists, under its own label", () => {
    render(<LandingPage />);

    expect(screen.getByText("Included")).toBeInTheDocument();
  });

  it("is organised into the two V2 groups", () => {
    render(<LandingPage />);

    expect(screen.getByRole("heading", { name: "Capture & understand" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Work with it" })).toBeInTheDocument();
  });

  it("keeps a capability under the group it belongs to", () => {
    // A row leaking between them would put "export" under capture, which is
    // the sort of thing nobody notices and everybody half-reads.
    render(<LandingPage />);

    // Anchored on the group's own <section>, which is what a group is now.
    // `parentElement` broke the moment the list gained a stagger wrapper — a
    // selector reaching through markup rather than through structure.
    const capture = screen.getByRole("heading", { name: "Capture & understand" }).closest("section")!;
    const work = screen.getByRole("heading", { name: "Work with it" }).closest("section")!;

    expect(capture).toHaveTextContent("Record in your browser");
    expect(capture).not.toHaveTextContent("PDF, Word, Markdown");
    expect(work).toHaveTextContent("Search that jumps");
  });
});

/**
 * The invented composition, named so it cannot come back.
 *
 * <p>Each of these was a headline on the page this replaced. None was a lie;
 * all three were somebody designing a second landing page instead of building
 * the approved one, and that is the failure mode this file now guards.
 */
describe("the invented landing page", () => {
  it.each([
    ["the invented hero headline", /Everything said\. Everything decided\./i],
    ["the invented process section", /Three steps, and two of them are Reverie's/i],
    ["the invented features headline", /One account\. All of it\./i],
    ["the invented closing slogan", /Your next meeting is worth keeping/i],
    ["the statistics strip", /18 LANGUAGES|18 languages/i],
  ])("is gone: %s", (_label, forbidden) => {
    const { container } = render(<LandingPage />);

    expect(container.textContent).not.toMatch(forbidden);
  });
});

/**
 * There is no product preview, and this is what it took with it.
 *
 * <p>A still picture of the application used to sit under the hero — the band,
 * the three places, a conversation list, folders and an answer, behind a mask
 * that faded its foot. It was described in this file as "all real". It was not:
 * every string in it was invented.
 *
 * <p>That is the rule this page has held to everywhere else, and the sweep in
 * "the invented landing page" above exists to enforce it. A mock meeting with a
 * fabricated name and a fabricated duration is the first item on the
 * do-not-ship list, and it had been sitting above the fold.
 */
describe("the product preview", () => {
  it.each([
    ["a greeting to somebody who does not exist", /Good morning, Priya/i],
    ["conversations nobody had", /Pricing sync|Design review/i],
    ["durations nothing measured", /42:07|18:22|36:14/],
    ["folders nobody made", /Q4 planning|Hiring \d/i],
  ])("invents no %s", (_label, forbidden) => {
    const { container } = render(<LandingPage />);

    expect(container.textContent).not.toMatch(forbidden);
  });

  it("still shows the product, by demonstrating it rather than picturing it", () => {
    // What replaced the screenshot was already on the page: the three moving
    // moments, each walking through one real capability. Their own copy is
    // asserted in the three describes below.
    const { container } = render(<LandingPage />);

    expect(container.textContent).toContain("Ask a question. Get the words it came from.");
    expect(container.textContent).toContain("Read it in the language you think in.");
  });

  it("leaves the hero running straight into them", () => {
    // The hero and the preview were paired inside a tighter `space-y-14`,
    // because a picture of the product belonged immediately under the claim.
    // With the picture gone the hero takes the page's own rhythm.
    const { container } = render(<LandingPage />);

    const main = container.querySelector("main")!;
    expect(main.firstElementChild!.tagName).toBe("SECTION");
    expect(main.firstElementChild!.querySelector("h1")).not.toBeNull();
  });
});

/*
 * NOT COVERED HERE, AND IT SHOULD BE SOMEBODY'S DECISION RATHER THAN A
 * SILENTLY WIDENED CHANGE.
 *
 * <p>The three showcases below — `StageShowcase`, `AskShowcase` and
 * `LanguageMoment` — still illustrate themselves with one invented meeting:
 * "Product Weekly", speakers called Priya and Dev, timecodes at 12:28 and
 * 12:34, and an answer about moving an annual discount to 15%. The assertions
 * above were first written to forbid all of it and failed, which is how it came
 * to be written down.
 *
 * <p>Removing the still preview did not remove that, and was not meant to: the
 * preview was a picture of the application's own chrome filled in with fiction,
 * where these are labelled demonstrations of a capability. Whether that
 * distinction is worth keeping is a product call and has not been made — so
 * nothing here asserts either way, and it is recorded rather than left for
 * somebody to rediscover.
 */

/**
 * The moments that were added, and the rule every one of them follows.
 *
 * <p>The page grew from three sections to seven. The risk in that is not
 * layout — it is that a marketing page which needs more to say starts saying
 * things the product cannot do. So each new moment is checked for what it
 * claims, and the forbidden-concept sweep above runs over all of it.
 */
describe("how it works", () => {
  it("is three stages of one recording, in order", () => {
    render(<LandingPage />);

    expect(screen.getByText("How it works")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Record it, or bring it" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Speakers, separated" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "A brief, and what it asks of you" }),
    ).toBeInTheDocument();
  });

  it("says the live text is the live pass, not the finished transcript", () => {
    // Reverie transcribes from the file after Stop. Letting the live words read
    // as the final transcript would promise a fidelity the pipeline does not
    // offer, and the product itself says so on /record.
    //
    // Asserted on the stage COPY rather than on the window's caption: the
    // window is `aria-hidden` demo art and shows one stage at a time, so a
    // caveat living only in there is one a screen reader never reaches and a
    // scroll position can hide.
    render(<LandingPage />);

    expect(
      screen.getAllByText(/full transcript is written from the recording after you stop/i).length,
    ).toBeGreaterThan(0);
  });
});

/**
 * The centrepiece.
 *
 * <p>Under `prefers-reduced-motion` — which is what jsdom reports, since
 * `matchMedia` is unstubbed and answers false to everything — the sequence
 * renders in its finished state. So these assert the *end* of the
 * demonstration, which is the state a reader with reduced motion sees
 * immediately and every other reader sees after four beats.
 */
describe("the Ask showcase", () => {
  it("leads the page's largest moment", () => {
    render(<LandingPage />);

    expect(screen.getByText("Ask Reverie")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Ask a question\. Get the words it came from\./ }),
    ).toBeInTheDocument();
  });

  it("shows a question, an answer, and the line the answer came from", () => {
    // The whole argument of the section: the answer is checkable. If the cited
    // line stops being rendered, the demonstration still animates and no
    // longer demonstrates anything.
    render(<LandingPage />);

    expect(screen.getByText(/What did we decide about pricing, and who owns/i)).toBeInTheDocument();
    expect(screen.getByText(/You held list pricing and moved the annual discount/i)).toBeInTheDocument();
    expect(screen.getByText("The words behind it")).toBeInTheDocument();
    expect(
      screen.getByText(/Hold the price and move the annual discount to fifteen per cent/i),
    ).toBeInTheDocument();
  });

  it("says the scope can be a meeting, a folder or everything", () => {
    render(<LandingPage />);

    expect(screen.getByText(/or a folder, or everything/i)).toBeInTheDocument();
  });

  it("claims nothing about meaning or similarity", () => {
    // Retrieval is lexical. This is the one section where a similarity score or
    // a "found by meaning" line would be the natural thing to write and the
    // wrong thing to ship.
    const { container } = render(<LandingPage />);

    expect(container.textContent).not.toMatch(/similarity|relevance score|embedding|vector/i);
  });
});

describe("the languages moment", () => {
  it("demonstrates a translated brief rather than quoting a number in a strip", () => {
    render(<LandingPage />);

    expect(screen.getByText("Languages")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Read it in the language you think in\./ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/across eighteen of them/i)).toBeInTheDocument();
  });

  it("says the translation is kept, which is what makes it worth doing twice", () => {
    render(<LandingPage />);

    expect(screen.getByText(/once translated it is kept/i)).toBeInTheDocument();
  });
});

describe("the closing section", () => {
  it("is about what happens to the recording, not a call to action", () => {
    /*
     * This section asks for nothing at all — a page that closes by asking again
     * did not trust its own middle.
     *
     * <p>The count of `Create a free account` has been 1, 0, 1 and is 0 again,
     * as the hero's own pair came and went. Which is exactly why the section's
     * emptiness is asserted directly, on the section, rather than inferred from
     * a page-wide count that keeps moving for reasons that have nothing to do
     * with this section.
     */
    const { container } = render(<LandingPage />);

    expect(screen.getByText("Yours")).toBeInTheDocument();
    expect(screen.queryAllByRole("link", { name: /Create a free account/ })).toHaveLength(0);

    const closing = Array.from(container.querySelectorAll("section")).find((el) =>
      el.textContent?.includes("No training on your meetings"),
    )!;
    expect(closing.querySelectorAll("a")).toHaveLength(0);
  });

  it("states the four things somebody weighing this up actually wants", () => {
    render(<LandingPage />);

    expect(screen.getByText("No training on your meetings")).toBeInTheDocument();
    expect(screen.getByText("Retention you set")).toBeInTheDocument();
    expect(screen.getByText("Delete what you like")).toBeInTheDocument();
    expect(screen.getByText("One plan, no card")).toBeInTheDocument();
  });

  it("does not offer a tier that does not exist", () => {
    const { container } = render(<LandingPage />);

    expect(container.textContent).toMatch(/no team tier/i);
    expect(container.textContent).not.toMatch(/upgrade to|contact sales|per seat|per user/i);
  });
});

/**
 * The motion, and the one thing it must never do.
 *
 * <p>A scroll reveal renders `opacity: 0` into the server HTML. That is
 * acceptable for a reader with JavaScript and unacceptable for one without, so
 * the page carries a `<noscript>` override. This is the only test of the
 * animation itself, because the animation is not the point — the copy being
 * readable regardless is.
 */
describe("motion never hides the page", () => {
  it("carries a noscript override for every revealed section", () => {
    const { container } = render(<LandingPage />);

    const fallback = container.querySelector("noscript");
    expect(fallback).not.toBeNull();
    expect(fallback!.textContent).toContain("[data-reveal]");
    expect(fallback!.textContent).toContain("opacity:1");
  });

  it("puts every claim in the server-rendered markup", () => {
    // Not behind an interaction, a tab or a hover. A landing page whose copy
    // arrives only after JavaScript is a landing page with no copy for a
    // crawler or for anybody whose JavaScript failed.
    const { container } = render(<LandingPage />);

    for (const claim of [
      "Remember the conversation.",
      "Ask a question. Get the words it came from.",
      "Read it in the language you think in.",
      "Capture & understand",
      "Work with it",
      "No training on your meetings",
    ]) {
      expect(container.textContent).toContain(claim);
    }
  });
});

/**
 * The public page is the one route a stranger pays for before they have decided
 * anything, and Framer Motion is the largest thing on it.
 *
 * <p>`motion.div` statically pulls in every feature the library has, including
 * drag and the layout-projection engine, neither of which this page uses. So
 * the page renders `m` components against a `LazyMotion` provider carrying
 * `domAnimation` only, which took the route from 44.3 kB to 33.7 kB.
 *
 * <p>`LandingMotion` runs `strict`, which throws in development if a full
 * `motion` component appears inside it — but only if that component is
 * rendered, and only in development. This is the half that fails in CI: one
 * `motion.div` added later would quietly put ~11 kB back on the front door and
 * nothing else in the suite would notice.
 */
describe("what the front door costs to load", () => {
  const SOURCES = [
    "reveal.tsx",
    "stage-showcase.tsx",
    "ask-showcase.tsx",
    "language-moment.tsx",
  ];

  it("animates with `m`, never the full `motion` component", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");

    for (const file of SOURCES) {
      const src = readFileSync(
        resolve(process.cwd(), "components/v2/landing", file),
        "utf8",
      );

      // The import, and every element rendered from it.
      expect(src).not.toMatch(/import\s*\{[^}]*\bmotion\b[^}]*\}\s*from\s*"framer-motion"/);
      expect(src).not.toMatch(/<motion\./);
    }
  });

  it("asks for `domAnimation` and not `domMax`", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(process.cwd(), "components/v2/landing/motion-provider.tsx"),
      "utf8",
    );

    // domMax adds drag and layout projection. Nothing on this page drags, and
    // nothing animates layout, so paying for either is the regression.
    expect(src).toContain("domAnimation");
    expect(src).not.toMatch(/\bdomMax\b(?![^\n]*`)/);
  });
});
