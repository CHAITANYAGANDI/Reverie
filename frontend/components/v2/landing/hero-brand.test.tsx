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
 * `CONVERSATIONAL INTELLIGENCE` was live text.
 *
 * <p>None of that survives. The hero loads approved artwork, cropped, with its
 * baked background turned into alpha. The vector reconstruction was faithful to
 * the geometry and was visibly not the artwork.
 *
 * <p>And the artwork it loads has since changed: it was the product lockup —
 * lens, wordmark and tagline in one picture — and is now the Reverie AI orb, at
 * the product owner's request. The orb carries no text, so the wordmark and the
 * tagline are set in type under it, which is where they were before the lockup
 * became a picture.
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
  it("is the approved AI orb rather than a drawing of anything", () => {
    /*
     * Two changes in one assertion, and both were deliberate: the hero stopped
     * being vector geometry, and then stopped being the product lockup. It is
     * the same file every Ask control draws — see components/v2/ai-mark-asset —
     * so there is one orb in the product and the hero is simply its largest
     * placement.
     */
    const { container } = lockup();

    const img = container.querySelector("img")!;
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe("/brand/reverie-ai-orb-mark.webp");
    // No vector identity left in the hero at all — that was the first change.
    expect(container.querySelector("svg")).toBeNull();
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
    expect(screen.getAllByText("CONVERSATIONAL INTELLIGENCE")).toHaveLength(1);
    expect(container.querySelectorAll(".sr-only")).toHaveLength(0);

    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("reads mark, then name, then tagline", () => {
    // The order is the lockup, and it is the one thing about this arrangement
    // that a refactor could quietly invert.
    const { container } = lockup();

    const img = container.querySelector("img")!;
    const name = screen.getByText("Reverie");
    const tag = screen.getByText("CONVERSATIONAL INTELLIGENCE");

    expect(img.compareDocumentPosition(name)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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

  it("does nothing whatever to the artwork's colour", () => {
    /*
     * The identity *is* the colour. No opacity, no filter, no blend, no tint —
     * on the image or on the element that animates it. The entrance animates
     * opacity, which is the one exception the brief allows and is on the
     * wrapper: it ends at 1 and is what makes the arrival an arrival.
     */
    const { container } = lockup();
    const img = container.querySelector("img")!;

    expect(img.className).not.toMatch(/\bopacity-\d/);
    expect(img.className).not.toMatch(
      /(grayscale|saturate|mix-blend|hue-rotate|\bfilter\b|brightness|contrast)/,
    );
    expect(img.getAttribute("style")).toBeNull();
  });

  it("reserves its box so the headline under it cannot jump", () => {
    // The intrinsic pixels as attributes, with the CSS width overriding them
    // for layout. Without the pair the browser has no aspect ratio until the
    // file arrives, and everything below the hero shifts when it lands.
    //
    // Square, because the orb is. The lockup this replaced was 820x576.
    const { container } = lockup();
    const img = container.querySelector("img")!;

    expect(img.getAttribute("width")).toBe("256");
    expect(img.getAttribute("height")).toBe("256");
    expect(img.className).toContain("h-auto");
    // Not lazy: this is the first paint of the front door.
    expect(img.getAttribute("loading")).not.toBe("lazy");
    expect(img.getAttribute("fetchpriority")).toBe("high");
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

  it("hides the bloom from the accessibility tree and lets CSS stop it", () => {
    /*
     * `data-breathe` is unconditional. An attribute that appears on the server
     * and not on the client is a hydration mismatch — the server cannot know
     * the motion preference — and the `prefers-reduced-motion` block in
     * globals.css already zeroes every animation, which is the right layer for
     * a CSS animation to be suppressed at.
     */
    const { container } = lockup();

    const bloom = container.querySelector(".v2-hero-bloom")!;
    expect(bloom.getAttribute("aria-hidden")).toBe("true");
    expect(bloom.hasAttribute("data-breathe")).toBe(true);
    // Behind the artwork, never over it.
    expect(bloom.className).toContain("-z-10");
    expect(bloom.className).toContain("pointer-events-none");
  });
});

describe("the hero horizon", () => {
  it("is decoration and says so", () => {
    // A line of light where the identity gives way to the page. It is not
    // content and must never be announced or intercept a click.
    const { container } = render(
      <LazyMotion features={domAnimation} strict>
        <HeroHorizon />
      </LazyMotion>,
    );

    const arc = container.querySelector(".v2-hero-arc")!;
    expect(arc.getAttribute("aria-hidden")).toBe("true");
    expect(arc.className).toContain("pointer-events-none");
  });
});
