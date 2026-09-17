import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LazyMotion, domAnimation } from "framer-motion";
import { HeroBrandLockup, HeroHorizon } from "@/components/v2/landing/hero-brand";

/**
 * The hero identity.
 *
 * <h2>REWRITTEN, because the identity is now the approved render</h2>
 *
 * <p>Five of these tests asserted a drawing: that the lockup read mark, then
 * word, then tagline as three separate elements; that the paths came from
 * `mark-geometry` rather than a second copy of the geometry; that the bottom
 * ribbon's rotation sat on a `<g>` and not on the path; and that
 * `MEETINGS, WRITTEN DOWN` was live text.
 *
 * <p>None of that survives, and neither does what replaced it. The hero drew
 * the approved product lockup as a picture, then the Reverie AI orb at 320px,
 * and now draws no mark at all — the identity here is `Reverie AI` in type with
 * the tagline under it, and the orb lives in the bar above.
 *
 * <p>So what is left to hold is the type: that both lines are there, once,
 * visibly, in the right order, with `AI` in the orb's own sampled blue. Plus
 * the no-JavaScript contract, which has survived every one of those passes.
 *
 * <p>Which costs something real, and the cost is asserted rather than glossed:
 * the words are inside a picture, so they are put back beside it as live
 * `sr-only` text and the picture is marked decorative. What is held here now is
 * that contract — and that it is not doubled — the no-JavaScript contract, and
 * the rule that nothing is done to the artwork's colour.
 *
 * <p>Wrapped in `LazyMotion` with `domAnimation`, which is what the page does.
 * Not `domMax`: the provider on the real page runs `strict`, and a test that
 * supplied more features than production does would let a component start
 * depending on them.
 */
function lockup() {
  return render(
    <LazyMotion features={domAnimation} strict>
      <HeroBrandLockup />
    </LazyMotion>,
  );
}

describe("the hero identity", () => {
  it("draws no mark at all", () => {
    /*
     * THREE MARKS, THEN NONE. Vector geometry, then the approved product
     * lockup as a picture, then the AI orb at 320px of sphere — each on
     * request, and the last request was to take it out.
     *
     * <p>Which does not leave the hero unbranded: the orb is 26px away in the
     * bar, and the light it stood in is still behind this — see `HeroHorizon`.
     * What the hero no longer opens with is a 320px object competing with a
     * 56px headline for the same glance.
     */
    const { container } = lockup();

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("[data-ai-mark]")).toBeNull();
  });

  it("sets the name and the tagline in visible type, each once", () => {
    /*
     * FOUR ANSWERS, AND THIS IS THE FIRST ONE AGAIN.
     *
     * <p>Rendered type, then pixels inside the approved lockup reachable only
     * as the image's `alt`, then `sr-only` text beside a decorative image, and
     * now visible type. Each move had a reason and the last one is that the
     * hero's artwork is the AI orb, which carries no words — so there is
     * nothing left to duplicate and nothing to imitate.
     *
     * <p>The doubling is what this guards, from either direction: a descriptive
     * `alt`, or an `sr-only` copy, alongside words that are already on the page
     * announces the identity twice. So the image contributes no accessible name
     * and there is no hidden text anywhere in the component.
     */
    const { container } = lockup();

    expect(screen.getAllByText("Reverie")).toHaveLength(1);
    expect(screen.getAllByText("MEETINGS, WRITTEN DOWN")).toHaveLength(1);
    expect(container.querySelectorAll(".sr-only")).toHaveLength(0);
    // Nothing in the accessibility tree but the words themselves.
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("sets `AI` in the orb's own light, and only `AI`", () => {
    /*
     * A COLOUR MATCH, WHICH IS WHY IT IS PINNED.
     *
     * <p>It was flat `--brand-orb` — #087afd, the median of the lit pixels
     * inside the sphere. That is the colour of the orb's *bands*, and beside
     * the artwork it read as blue text rather than as the lit thing above it:
     * the orb's character is a sweep from that blue into the cyan waveform
     * through the middle, not one blue.
     *
     * <p>So all three tokens are asserted, and the order matters. `--brand-orb`
     * has to lead, because the tie to the mark is what this word is for; a
     * gradient that started on the cyan would be a prettier word and a weaker
     * lockup. `--brand-text` and `--brand` are still wrong here for the reason
     * they always were, and swapping any of these for a tier that merely looks
     * blue is what this catches.
     */
    lockup();

    const ai = screen.getByText("AI");
    const style = ai.getAttribute("style") ?? "";

    // The sweep, in order: the mark's blue, then the wave, then its crest.
    expect(style).toMatch(
      /linear-gradient\([^)]*--brand-orb[\s\S]*--brand-wave[\s\S]*--brand-wave-lit/,
    );
    expect(style).toContain("background-clip: text");
    expect(style).toContain("-webkit-text-fill-color: transparent");

    /*
     * THE FALLBACK IS LOAD-BEARING. A transparent fill with no gradient behind
     * it is an invisible word, so the flat colour stays declared underneath.
     */
    expect(ai.className).toContain("text-brand-orb");

    /*
     * `drop-shadow`, not `text-shadow`. A text shadow paints behind the glyph,
     * and behind a transparent glyph is through it — the letters fill with
     * their own halo. And `em`, so the glow scales with the word rather than
     * being a fixed halo around a 28px letter pair on a phone.
     */
    expect(style).toContain("drop-shadow");
    expect(style).not.toContain("text-shadow");
    expect(style).toMatch(/drop-shadow\(0 0 [\d.]+em/);
    expect(style).not.toMatch(/\dpx/);

    // And `Reverie` stays ink. The pair is a white word and a lit one, not two
    // blue ones.
    const word = screen.getByText("Reverie");
    expect(word.className).toContain("text-ink");
    expect(word.className).not.toMatch(/text-brand/);
  });

  it("reads name, then tagline", () => {
    // The order is the lockup's, and it is the one thing about this
    // arrangement a refactor could quietly invert. It was mark, name, tagline
    // while there was a mark.
    lockup();

    const name = screen.getByText("Reverie");
    const tag = screen.getByText("MEETINGS, WRITTEN DOWN");

    expect(name.compareDocumentPosition(tag)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("keeps the identity text readable before and without the entrance", () => {
    /*
     * Inside the animated wrapper on purpose. Opacity and transform do not take
     * an element out of the accessibility tree, so the words are there on the
     * first frame — which matters because the wrapper starts at `opacity: 0`
     * and, with JavaScript off, never animates at all.
     */
    const { container } = lockup();

    expect(screen.getByText("Reverie").closest("[data-reveal]")).not.toBeNull();
    // Not `hidden`, not `display:none` — either would take it out of the tree.
    expect(container.querySelector("[hidden]")).toBeNull();
  });

  it("cannot shift the page as it loads, having nothing to load", () => {
    /*
     * WITHDRAWN RATHER THAN REWRITTEN, and worth a line so the loss is on the
     * record. This asserted the image's intrinsic `width`/`height` and
     * `fetchPriority`, which together stopped everything below the hero
     * jumping when a 152 kB file landed.
     *
     * <p>With no image there is no such risk — the identity is type, which
     * arrives with the document. So the guard becomes the simpler fact, and if
     * a mark ever comes back here the intrinsic-size assertions have to come
     * back with it.
     */
    const { container } = lockup();

    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("carries data-reveal on everything that starts hidden", () => {
    /*
     * Framer writes `initial` into the served HTML's style attribute, so
     * without JavaScript this would be a 555px hole where an identity should
     * be. The page's `<noscript>` block forces every `[data-reveal]` to
     * `opacity:1;transform:none`, and it only reaches elements carrying the
     * attribute.
     */
    const { container } = lockup();

    const animated = container.querySelector("[style*='opacity']");
    expect(animated).not.toBeNull();
    expect(animated!.hasAttribute("data-reveal")).toBe(true);
  });

  it("carries no light of its own any more", () => {
    /*
     * The bloom lived here, inside the wrapper, so it scaled with the mark it
     * sat behind. With no mark there is nothing for it to scale to, and the
     * hero's light is `HeroHorizon`'s three fields — which are sized against
     * the *section* and are tested below.
     */
    const { container } = lockup();

    expect(container.querySelector(".v2-hero-bloom")).toBeNull();
  });
});

describe("the hero horizon", () => {
  function horizon() {
    return render(
      <LazyMotion features={domAnimation} strict>
        <HeroHorizon />
      </LazyMotion>,
    );
  }

  it("draws the three fields the artwork is lit by", () => {
    /*
     * One above, one below, and the lit curve across the render's lower third.
     * They are what is left of the artwork in this hero now that no mark is
     * drawn, and they are the reason it still reads as the artwork's space.
     */
    const { container } = horizon();

    for (const cls of [".v2-hero-light-top", ".v2-hero-light-bottom", ".v2-hero-arc"]) {
      expect(container.querySelector(cls), cls).not.toBeNull();
    }
  });

  it("is decoration and says so", () => {
    // Light where the identity gives way to the page. None of it is content,
    // and none of it may be announced or intercept a click.
    const { container } = horizon();

    const fields = container.querySelectorAll("div");
    expect(fields.length).toBeGreaterThanOrEqual(3);
    for (const el of fields) {
      expect(el.getAttribute("aria-hidden"), el.className).toBe("true");
      expect(el.className).toContain("pointer-events-none");
      // Behind everything: the copy sits over these, never under them.
      expect(el.className).toContain("-z-10");
    }
  });
});
