import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LazyMotion, domAnimation } from "framer-motion";
import { HeroBrandLockup, HeroHorizon } from "@/components/v2/landing/hero-brand";
import { barsOf, crescent, cutFor } from "@/components/v2/mark-geometry";

/**
 * The hero identity.
 *
 * <h2>What this file is holding</h2>
 *
 * <p>The reported problem was scale: a 128px mark box over a 42px word read as
 * a logo pasted above a heading rather than as the product's identity. Scale is
 * a `clamp()` and cannot be asserted in jsdom, which has no layout — so it is
 * verified by measuring the rendered page, and what is asserted here is
 * everything else that must not drift:
 *
 * <ul>
 *   <li>the copy, exactly — `CONVERSATIONAL INTELLIGENCE` is specified wording
 *       and was deliberately absent from the lockup this replaces;</li>
 *   <li>the order — mark, then word, then tagline;</li>
 *   <li>that the drawing comes from the shared geometry rather than a second
 *       copy of it, which is the one thing a hand-animated mark makes easy to
 *       get wrong;</li>
 *   <li>and the no-JavaScript contract, because framer writes `initial` into
 *       the served HTML and the page's `noscript` override only reaches
 *       elements carrying `data-reveal`.</li>
 * </ul>
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
  it("says exactly CONVERSATIONAL INTELLIGENCE", () => {
    /*
     * The wording is specified and the alternatives are not interchangeable:
     * "Conversation Intelligence", "Meeting Intelligence" and "Conversational
     * AI" are all things this is not called.
     *
     * <p>Written in capitals in the markup rather than lower-cased and
     * transformed, so the DOM says what the brief asked for rather than
     * relying on a `text-transform` to make it look that way.
     */
    lockup();

    expect(screen.getByText("CONVERSATIONAL INTELLIGENCE")).toBeInTheDocument();
  });

  it("reads mark, then word, then tagline", () => {
    // The identity's own order, and the reason it is a stacked component rather
    // than the nav lockup at a bigger size.
    const { container } = lockup();

    const mark = container.querySelector('svg[role="img"]')!;
    const word = screen.getByText("Reverie");
    const tag = screen.getByText("CONVERSATIONAL INTELLIGENCE");

    expect(mark.compareDocumentPosition(word)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(word.compareDocumentPosition(tag)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("names the mark Reverie, once", () => {
    /*
     * One accessible name for the identity. The wordmark beside it is text and
     * must not be labelled as well — two elements both announcing "Reverie" is
     * a screen reader saying the product's name twice for one logo.
     */
    lockup();

    expect(screen.getByRole("img", { name: "Reverie" })).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "Reverie" })).toHaveLength(1);
  });

  it("draws the shared geometry rather than a second copy of it", () => {
    /*
     * THE ONE THING A HAND-ANIMATED MARK MAKES EASY TO GET WRONG.
     *
     * <p>This component composes the mark itself, because animating the ribbons
     * and the bars separately needs `m.path` and `m.rect` that `BrandMark`
     * cannot hand out. The risk in that is a second drawing that drifts from
     * the first, so the paths are compared against what `mark-geometry`
     * produces — the same functions `BrandMark` calls.
     */
    const { container } = lockup();
    const cut = cutFor(264);

    const paths = Array.from(container.querySelectorAll("path"));
    expect(paths).toHaveLength(2);
    for (const p of paths) {
      expect(p.getAttribute("d")).toBe(crescent(cut));
    }

    // Nine bars: the artwork's own cut, which is what the hero always draws.
    expect(container.querySelectorAll("rect")).toHaveLength(barsOf(cut).length);
    expect(barsOf(cut)).toHaveLength(9);
  });

  it("rotates the second ribbon on a group, not on the path", () => {
    /*
     * Two reasons, and both are real failures that were hit.
     *
     * <p>Framer writes a CSS `transform` for the ribbon's settle, and a CSS
     * transform replaces an SVG `transform` attribute outright — so a rotation
     * on the path would vanish on the first animated frame.
     *
     * <p>And the page's `noscript` override forces `transform:none` on every
     * `[data-reveal]`, which would take an attribute rotation with it. Half the
     * mark would be upside down for anybody with JavaScript disabled.
     */
    const { container } = lockup();

    const group = container.querySelector("g[transform]");
    expect(group?.getAttribute("transform")).toBe("rotate(180 16 16)");
    expect(group?.querySelector("path")).not.toBeNull();
    for (const p of Array.from(container.querySelectorAll("path"))) {
      expect(p.getAttribute("transform")).toBeNull();
    }
  });

  it("carries data-reveal on everything that starts hidden", () => {
    /*
     * The no-JavaScript contract. Framer renders `initial` into the served
     * HTML's style attribute, so without it the identity would be a hole where
     * a logo should be — and the page's `noscript` block only reaches elements
     * with this attribute.
     */
    const { container } = lockup();

    for (const selector of ["svg", "path", "rect", "span"]) {
      const all = Array.from(container.querySelectorAll(selector));
      expect(all.length, selector).toBeGreaterThan(0);
      for (const el of all) {
        expect(el.hasAttribute("data-reveal"), `${selector}: ${el.outerHTML.slice(0, 60)}`).toBe(
          true,
        );
      }
    }
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
