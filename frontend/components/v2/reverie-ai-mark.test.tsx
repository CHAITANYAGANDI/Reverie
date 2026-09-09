import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { ReverieAiMark } from "@/components/v2/reverie-ai-mark";
import { AI_ORB_SRC, aiOrbBox } from "@/components/v2/ai-mark-asset";
import { BrandMark } from "@/components/v2/brand-mark";

/**
 * REWRITTEN, because the mark it tested no longer exists.
 *
 * <p>This file used to assert a drawing: a sphere circle at r=15, seven bars in
 * a 36-unit viewBox, two gloss paths per cap, a `rotate(180 18 18)` on a `<g>`
 * with no class on it, and a hover stagger across the waveform's rings. All of
 * that was vector geometry — `ai-mark-geometry.ts`, now deleted — and none of
 * it survives the move to the approved artwork.
 *
 * <p>What survives is every assertion that was about the *identity* rather than
 * about the drawing: the size contract, the accessible name, the untouched
 * colour, the two marks not being interchangeable, and the reduced-motion rule.
 * Those are below, and several are stricter than they were, because a raster
 * has more ways to be wrong.
 */
function orb(node: React.ReactElement): HTMLElement {
  const { container } = render(node);
  const el = container.querySelector("[data-ai-mark]");
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

const image = (el: HTMLElement) => el.querySelector("img")!;

describe("the Reverie AI mark", () => {
  it("is the approved artwork, and nothing else", () => {
    /*
     * The whole point of the pass. It was a hand-drawn SVG reconstruction —
     * faithful to the artwork's geometry and visibly not the artwork, because
     * the render has depth a vector does not.
     */
    const el = orb(<ReverieAiMark size={30} />);

    expect(el.querySelector("svg")).toBeNull();
    expect(image(el).getAttribute("src")).toBe(AI_ORB_SRC);
  });

  it("is the size of the sphere somebody measures, not the box around it", () => {
    /*
     * `size` is the painted sphere's diameter and the element is 1.2x it,
     * because the crop keeps the artwork's own bloom — 648px square around a
     * 540px sphere. Deliberately the same ratio the vector used, so not one
     * call site had to change when the drawing became a file.
     */
    const el = orb(<ReverieAiMark size={30} />);

    expect(aiOrbBox(30)).toBe(36);
    expect(el.style.width).toBe("36px");
    expect(el.style.height).toBe("36px");
    // On the image too, as attributes, so the box is reserved before the file
    // arrives and the row it sits in does not reflow when it lands.
    expect(image(el).getAttribute("width")).toBe("36");
    expect(image(el).getAttribute("height")).toBe("36");
  });

  it("puts the box in an inline style, where no stylesheet can shrink it", () => {
    /*
     * A REGRESSION GUARD FOR A BUG THIS PASS ALREADY HIT ONCE.
     *
     * <p>`Button`'s base class carries `[&_svg]:size-4` — a shadcn convention
     * that exists to stop lucide glyphs setting their own size. Both Ask
     * controls are `Button`s, so a 30px mark rendered at 16 with its glow
     * cropped: measured at 13px of painted sphere, which is smaller than the
     * mark this pass was raised to enlarge.
     *
     * <p>An inline style beats a class, so the box cannot be taken away by a
     * descendant selector three files off. Asserted because the failure is
     * silent — it typechecks, it renders, and it is only wrong in a browser.
     */
    const el = orb(<ReverieAiMark size={56} />);

    expect(el.getAttribute("style")).toContain("width: 67px");
    expect(el.className).not.toMatch(/\bw-\[/);
  });

  it("is decorative in a button and named where it is the only identity", () => {
    // The button owns the accessible name. A name on the mark inside one makes
    // a screen reader announce the control twice — "Reverie AI, Ask Reverie
    // about your conversations, button".
    const quiet = orb(<ReverieAiMark />);
    expect(quiet.getAttribute("aria-hidden")).toBe("true");
    expect(image(quiet).getAttribute("alt")).toBe("");

    // The Ask panel's header has no heading and no words: the mark is the whole
    // of what says whose panel it is, so there it is named — as the image's own
    // alt, which is how a logotype is named.
    const named = orb(<ReverieAiMark title="Reverie AI" />);
    expect(named.getAttribute("aria-hidden")).toBeNull();
    expect(image(named).getAttribute("alt")).toBe("Reverie AI");
  });
});

describe("the AI mark's response to a pointer", () => {
  it("does nothing at all unless the control asks it to", () => {
    /*
     * Three of these are not in a control: the panel header's, the resting orb
     * on `/ask`, and the notice that the chat is not ready. A mark that leaned
     * forward when the pointer crossed the middle of a panel would be claiming
     * to be pressable.
     */
    const still = orb(<ReverieAiMark size={28} />);

    expect(still.className).not.toMatch(/group-hover/);
    expect(still.innerHTML).not.toMatch(/group-hover/);
  });

  it("leans in, lifts a pixel, and presses", () => {
    const live = orb(<ReverieAiMark size={28} interactive />);

    // The mark moves as a whole. There is no internal geometry to animate any
    // more, and faking internal movement by redrawing the artwork is what this
    // pass exists to stop.
    expect(live.className).toContain("motion-safe:group-hover:scale-[1.055]");
    expect(live.className).toContain("motion-safe:group-hover:-translate-y-px");
    expect(live.className).toContain("motion-safe:group-active:scale-[0.96]");

    /* Both timing values use explicit arbitrary CSS properties instead of
   Tailwind timing utilities. This avoids ambiguous utility generation and
   ensures the intended transition durations are actually emitted. */
    expect(live.className).toContain("[transition-duration:220ms]");
    expect(live.className).toContain("[transition-duration:100ms]");
    expect(live.className).not.toMatch(/\bduration-\[/);

    // Nothing rotates, spins, bounces or loops.
    expect(live.outerHTML).not.toMatch(/rotate|animate-|animation/);
  });

  it("puts everything that moves behind the reduced-motion query", () => {
    /*
     * <h2>Why this is a media query and not a hook</h2>
     *
     * <p>`useReducedMotion()` is false on the server, so branching the *tree*
     * on it — a different element, an omitted class, a `useState` seeded from
     * it — serves one thing and hydrates another. React reports that as a
     * failed hydration and, outside a Suspense boundary, throws the whole root
     * away and re-renders on the client. This page's hero cost nine of those.
     *
     * <p>`motion-safe:` is a media query on a class list that never varies, so
     * the server and the client render the same mark and CSS decides.
     *
     * <h2>And why only the transforms</h2>
     *
     * <p>Under `reduce`, globals.css already takes every transition duration to
     * zero — so the halo still brightens, instantly, which is the static colour
     * change that preference allows. What must not happen is the scale and the
     * lift: those are motion, and applying them instantly is not honouring the
     * preference, it is skipping the animation and keeping the movement.
     */
    const live = orb(<ReverieAiMark size={56} interactive />);
    const html = live.outerHTML;

    for (const moving of [
      "scale-[1.055]",
      "scale-[0.96]",
      "-translate-y-px",
      "[transition-duration:",
    ]) {
      const guarded = html.split(moving).slice(0, -1);
      expect(guarded.length, `${moving} appears in the mark`).toBeGreaterThan(0);
      for (const before of guarded) {
        expect(
          /motion-safe:(group-(hover|active):)?$/.test(before),
          `${moving} is guarded`,
        ).toBe(true);
      }
    }
    // The brightening is not guarded: instant is the right answer there.
    expect(html).toContain("group-hover:opacity-100");
  });
});

describe("the AI mark's colour", () => {
  it("is never touched, because the colour is the identity", () => {
    /*
     * The rule that shapes the whole component. Nothing may reduce the image's
     * opacity, filter it, blend it or recolour it — which rules out every
     * obvious way to make it respond to a pointer or read as inactive, and is
     * why the halo is a separate span and an inactive tab quietens its label.
     */
    const el = orb(<ReverieAiMark size={30} interactive active />);
    const img = image(el);

    expect(img.className).not.toMatch(/\bopacity-\d/);
    expect(img.className).not.toMatch(/(grayscale|saturate|mix-blend|hue-rotate|\bfilter\b|brightness|contrast)/);
    expect(img.getAttribute("style")).toBeNull();
    // And nothing is done to it from the wrapper either — a filter there would
    // apply to the image through inheritance of the rendering, not the cascade.
    expect(el.className).not.toMatch(/(grayscale|saturate|mix-blend|hue-rotate|brightness)/);
  });

  it("brightens a halo behind the artwork, not the artwork", () => {
    const resting = orb(<ReverieAiMark size={30} interactive />);
    const open = orb(<ReverieAiMark size={30} interactive active />);
    const halo = (el: HTMLElement) => el.querySelector(".v2-ai-halo")!;

    // Zero at rest: the artwork has its own bloom baked in, and a second one
    // under it at all times would be the same light twice.
    expect(halo(resting).className).toContain("opacity-0");
    expect(halo(open).className).toContain("opacity-50");
    expect(halo(resting).className).toContain("group-hover:opacity-100");

    // Behind, and out of the way of the pointer.
    expect(halo(resting).className).toContain("absolute");
    expect(halo(resting).className).toContain("pointer-events-none");
    expect(halo(resting).getAttribute("aria-hidden")).toBe("true");
    // The image is after it in the DOM, so ordinary paint order puts the halo
    // underneath without either of them needing a z-index.
    expect(halo(resting).nextElementSibling?.tagName.toLowerCase()).toBe("img");

    // A state, not a loop.
    expect(open.outerHTML).not.toMatch(/animate-|animation/);
  });
});

describe("the two identities", () => {
  it("are different marks, and neither is the other with a decoration", () => {
    /*
     * The rule the whole pass exists to establish:
     *
     *     BrandMark      the lens        which product am I using
     *     ReverieAiMark  the lit orb     where is Reverie's assistant
     *
     * <p>Asserted structurally, because the failure mode is somebody reaching
     * for the nearest mark. They are not even the same kind of thing now: the
     * product's mark is drawn, and only the AI one answers to `[data-ai-mark]`,
     * which is how every other test in this pass tells them apart.
     */
    const { container: ai } = render(<ReverieAiMark size={30} />);
    const { container: brand } = render(<BrandMark size={30} />);

    expect(ai.querySelector("img")).not.toBeNull();
    expect(ai.querySelector("svg")).toBeNull();
    expect(brand.querySelector("svg")).not.toBeNull();
    expect(brand.querySelector("img")).toBeNull();
    expect(brand.querySelector("[data-ai-mark]")).toBeNull();
  });
});
