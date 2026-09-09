"use client";

/**
 * THE REVERIE IDENTITY, AS THE HERO'S FIRST BEAT — the approved artwork.
 *
 * <h2>It is the file, not a drawing of the file</h2>
 *
 * <p>This composed the identity from `mark-geometry` and `MarkGradients`: a
 * lens built from two crescents and a bar table, a wordmark set in the product
 * typeface, and a letterspaced tagline, with each part animated separately —
 * the ribbons settling toward each other, then the bars revealing from the
 * centre outward.
 *
 * <p>It was a faithful reconstruction of the artwork's *geometry* and it was
 * never the artwork. The supplied render has depth the vector does not: a
 * gradient across each ribbon that goes to white where the light catches it,
 * a real bloom around the lens, and a wordmark whose own vertical gradient
 * lifts off the ground. Placed side by side that difference is the whole
 * difference between a logo and a lockup — so the hero now loads the render.
 *
 * <p>`BrandMark` and `mark-geometry` are untouched and still draw the band's
 * corner, the nav lockup, the auth shell and the footer, where a 42px mark
 * wants vector edges and no 600 kB file. Two renderers for one identity, and
 * the line between them is size.
 *
 * <h2>What the file is</h2>
 *
 * <p>`reverie-main-hero.webp` — the approved `reverie-main.png` cropped to its
 * lockup with the baked background turned into transparency. See
 * `scripts/extract-brand-assets.py` for why the source cannot be used directly
 * and what the extraction does and does not touch. Nothing is invented: every
 * RGB value comes from the approved render.
 *
 * <p>The wordmark and the tagline are inside the image, because the artwork's
 * `Reverie` is set in a face the product does not ship and lit with a gradient
 * CSS cannot reproduce. So the identity is a picture — and the words are put
 * back beside it as live text.
 *
 * <h2>Decorative image, live text</h2>
 *
 * <p>The image is `alt=""` and `aria-hidden`, and an `sr-only` span carries
 * `Reverie — Conversational Intelligence`. Not a descriptive `alt`, which is
 * where this started: an alt is a *substitute* for a picture, reachable only
 * through the image it belongs to, where these words are the product's name.
 * As live text they are in the document, findable, and read in the ordinary
 * flow.
 *
 * <p>ONE OR THE OTHER, NEVER BOTH. A descriptive alt *and* identical sr-only
 * text announces the identity twice — "Reverie, conversational intelligence,
 * image. Reverie, Conversational Intelligence." — which is worse than either
 * alone, and is why the image's `alt` is empty rather than merely redundant.
 *
 * <h2>The horizon is the page's, not the file's</h2>
 *
 * <p>The approved render has a lit curve across its lower third. It is cropped
 * out and drawn here instead — see `HeroHorizon` — because in the file it is
 * fixed at one width and one brightness, and on the page it has to span a
 * viewport that ranges from 390px to 1600 and sit *behind* the copy. The CSS
 * version came down from 22% to 12% when the artwork arrived, because the
 * artwork brings light of its own and two curves read as one effect drawn
 * twice.
 *
 * <h2>Scale</h2>
 *
 * <p>One `clamp()` rather than a pile of breakpoints, fitted through the two
 * ends of the brief's table: 290px wide at 390 and 555 at 1440. It lands inside
 * the target at every width between — 385 at 768, 450 at 1024, 515 at 1280 —
 * and is capped at 580 so a 2560px monitor does not get a 650px logo. A plain
 * `vw` cannot do that, because the mark has to be a *larger* fraction of a
 * narrow viewport than of a wide one.
 */

import * as React from "react";
import { m, useReducedMotion } from "framer-motion";
import { LANDING_EASE } from "@/components/v2/landing/reveal";

/**
 * The artwork's width, as one clamp. See the note on Scale.
 *
 * <p>Fitted rather than chosen: `25.24vw + 192px` passes through (390, 290) and
 * (1440, 555), which are the two ends of the brief's table.
 */
const HERO_WIDTH = "clamp(270px, 25.24vw + 192px, 580px)";

/**
 * The extracted lockup, and its intrinsic pixels.
 *
 * <p>820 × 576 is the crop's native resolution, which is all the source has:
 * the lockup occupies 61% of a 1254px frame, and the crop adds a margin for the
 * extraction to feather its edges through. At the 555px it is drawn at on a 1440
 * screen that is 1.48 device pixels per CSS pixel — crisp on a 1x panel and
 * slightly soft on a 2x one. Upscaling the file would not add detail, so the
 * honest thing is to ship the pixels that exist and say so.
 */
const HERO_SRC = "/brand/reverie-main-hero.webp";
const HERO_W = 820;
const HERO_H = 576;

/**
 * When the identity arrives.
 *
 * <p>One beat now, where there were five. The parts cannot be animated
 * separately any more — they are pixels in one file — and the brief asks for
 * exactly this instead: the whole identity fading, lifting and settling, then
 * the headline, then the copy, then the buttons. `HERO_BEATS` holds the rest.
 */
const IDENTITY_IN = 0.1;
const IDENTITY_FOR = 0.95;

/**
 * One transition, with reduced motion zeroing the clock rather than the tree.
 *
 * <p>The identity renders identically whatever the preference is, and `still`
 * only takes the duration and the delay to zero. The server cannot know the
 * preference — `useReducedMotion()` is false there — so a branch that returned
 * a different element, or omitted `initial`, would serve `style="opacity:0"`
 * and then hydrate against something else. React reports that as a failed
 * hydration and, because it is outside a Suspense boundary, throws the whole
 * root away and re-renders on the client. Measured: nine errors on this page
 * under `prefers-reduced-motion: reduce`.
 *
 * <p>A zero-duration transition is not a fast animation. It is no animation:
 * the identity is simply there, at full scale, on the first frame after
 * hydration.
 */
function clock(still: boolean, duration: number, delay: number) {
  return still ? { duration: 0 } : { duration, ease: LANDING_EASE, delay };
}

export function HeroBrandLockup() {
  const still = Boolean(useReducedMotion());

  return (
    /*
     * `data-reveal` because framer renders `initial` into the server HTML's
     * style attribute, so without JavaScript this would be a 555px hole where
     * an identity should be. The page carries a `<noscript>` block forcing
     * every `[data-reveal]` to `opacity:1;transform:none`.
     */
    <m.div
      data-reveal
      className="relative isolate"
      style={{ width: HERO_WIDTH }}
      /* opacity, scale and a lift — the whole identity, as one object. Which
         is what the brief asks for and, now that the parts are pixels, the
         only thing there is to animate. */
      initial={{ opacity: 0, scale: 0.965, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={clock(still, IDENTITY_FOR, IDENTITY_IN)}
    >
      {/* The bloom, behind the artwork and inside its own box so it scales
          with it. `-z-10` puts it under the image without a stacking context
          of its own — the `isolate` above is what keeps it out of the page's.
          The artwork has a bloom baked in; this is the wider, dimmer field it
          sits in, which is what stops a 555px lockup reading as pasted on. */}
      <div
        aria-hidden
        data-breathe
        className="v2-hero-bloom pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[150%] w-[132%] -translate-x-1/2 -translate-y-1/2"
      />
      {/*
        NO OPACITY, NO FILTER, NO BLEND, NO TINT.

        <p>The artwork's colour is the identity. `width`/`height` are the
        intrinsic pixels so the browser reserves the right box before the file
        arrives — the CSS width overrides them for layout, and the pair is what
        stops the headline jumping when the image lands.

        <p>`priority` in spirit rather than `next/image`: this is the first
        paint of the front door, so it is not lazy and not deferred. It is a
        plain `img` because `next/image` would re-encode the approved pixels
        through its optimiser, and "identical to the supplied source" is the
        requirement.
      */}
      <img
        src={HERO_SRC}
        /* Decorative. The words are the `sr-only` span below — in the document
           rather than in an attribute. See the head of this file. */
        alt=""
        aria-hidden
        width={HERO_W}
        height={HERO_H}
        draggable={false}
        fetchPriority="high"
        decoding="sync"
        className="relative block h-auto w-full select-none"
      />
      {/*
        THE IDENTITY, AS TEXT.

        <p>Inside the animated wrapper on purpose: opacity and transform do not
        take an element out of the accessibility tree, so this is readable from
        the first frame — before the entrance finishes, and whether or not the
        entrance runs at all.

        <p>Exactly once on the page. The nav's and the footer's lockups have
        their own live `Reverie` beside a titled mark; this is the hero's, and
        the only place the tagline appears in any form outside the artwork.
      */}
      <span className="sr-only">Reverie — Conversational Intelligence</span>
    </m.div>
  );
}

/**
 * A horizon: one soft arc of light low in the hero.
 *
 * <p>The approved render has a lit curve beneath the wordmark. Taken literally
 * that is a planet, which is not what this product is about — so it is a very
 * wide, very shallow ellipse whose top edge is the only lit part, sitting where
 * the identity gives way to the page.
 *
 * <p>Quieter than it was: the recipe came down from 22% to 12% when the artwork
 * arrived, because the artwork brings a curve of its own and two of them read
 * as one neon semicircle drawn twice. See `.v2-hero-arc` in globals.css.
 */
export function HeroHorizon() {
  const still = useReducedMotion();

  return (
    <m.div
      aria-hidden
      data-reveal
      className="v2-hero-arc pointer-events-none absolute bottom-[-26vw] left-1/2 -z-10 h-[44vw] w-[190%] -translate-x-1/2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      /* Last, and slowest. The only thing on the page allowed to still be
         arriving after the buttons, because nobody is waiting for it. */
      transition={clock(Boolean(still), 1.4, 0.9)}
    />
  );
}
