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
 * <p>None of that survives. The hero loads `reverie-main-hero.webp` — the
 * approved artwork, cropped, with its baked background turned into alpha — and
 * the lens, the wordmark and the tagline are pixels in one file. The vector
 * reconstruction was faithful to the geometry and was visibly not the artwork.
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
  it("is the approved artwork rather than a drawing of it", () => {
    const { container } = lockup();

    const img = container.querySelector("img")!;
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe("/brand/reverie-main-hero.webp");
    // No vector identity left in the hero at all — that is the change.
    expect(container.querySelector("svg")).toBeNull();
  });

  it("names the identity in live text, and says it exactly once", () => {
    /*
     * The words were rendered type, then the image's `alt`, and are now
     * `sr-only` text beside a decorative image. The last move is the right one:
     * an `alt` is a *substitute* for a picture, and the product's name is not a
     * description of a picture.
     *
     * <p>The doubling is what this guards. A descriptive `alt` *and* identical
     * `sr-only` text announces the identity twice — "Reverie, conversational
     * intelligence, image. Reverie, Conversational Intelligence." — which is
     * worse than either alone. So the image contributes no accessible name at
     * all, and there is exactly one string.
     */
    const { container } = lockup();

    expect(screen.getAllByText("Reverie — Conversational Intelligence")).toHaveLength(1);

    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
    // Out of the accessibility tree entirely, so nothing can be said twice.
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("keeps the identity text readable before and without the entrance", () => {
    /*
     * Inside the animated wrapper on purpose. Opacity and transform do not take
     * an element out of the accessibility tree, so the words are there on the
     * first frame — which matters because the wrapper starts at `opacity: 0`
     * and, with JavaScript off, never animates at all.
     */
    const { container } = lockup();

    const text = screen.getByText("Reverie — Conversational Intelligence");
    expect(text.className).toContain("sr-only");
    expect(text.closest("[data-reveal]")).not.toBeNull();
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
    const { container } = lockup();
    const img = container.querySelector("img")!;

    expect(img.getAttribute("width")).toBe("820");
    expect(img.getAttribute("height")).toBe("576");
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
