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
 * wants vector edges and no 600 kB file.
 *
 * <h2>THE ORB, NOT THE LOCKUP — and this reverses a rule</h2>
 *
 * <p>This drew `reverie-main-hero.webp`: the approved product lockup, its lens
 * over the `Reverie` wordmark over `CONVERSATIONAL INTELLIGENCE`, all three
 * inside one picture. It now draws `reverie-ai-orb-mark.webp`, the Reverie AI
 * orb, at the direct request of the product owner.
 *
 * <p>Which is worth stating plainly, because it overturns something this
 * codebase argued at length and tested for: that the orb answers "where is
 * Reverie's assistant?" and must never be the landing page's corporate
 * identity, on the grounds that leading with it claims the product *is* an
 * assistant. That reasoning is recorded rather than deleted — see the placement
 * note in components/v2/reverie-ai-mark — and it is overruled. It was a design
 * position, not a constraint.
 *
 * <h2>The words are type again</h2>
 *
 * <p>The orb asset is the orb alone, so the wordmark and the tagline could not
 * come with it. They are set in type under it, which is where they were two
 * passes ago and is what was asked for: `Reverie` in the headline face, and
 * `CONVERSATIONAL INTELLIGENCE` in letterspaced caps.
 *
 * <p>Which the lockup could not do, and that is the whole reason it was a
 * picture: the approved render sets `Reverie` in a face this product does not
 * ship, lit with a gradient CSS cannot reproduce, so reproducing it in markup
 * meant a wordmark that was visibly not the artwork's. That objection does not
 * apply any more — the artwork here is the orb, and the words beside it are
 * simply the product's name in the product's own typeface rather than an
 * imitation of somebody else's.
 *
 * <p>NO `sr-only` COPY. There was one, while the words lived inside the
 * picture; with them on the page it would announce the identity twice. The
 * image is `alt=""` and `aria-hidden` because it is now decoration beside real
 * text, which is the only arrangement in which that is true.
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
 * <p>One `clamp()` rather than a pile of breakpoints, and refitted for a round
 * subject. The lockup's table was widths of a wide, short object — 555px at
 * 1440 — and applied to a square one it would have put a 462px sphere in the
 * middle of the page. The orb is sized by its sphere instead: 320px at 1440,
 * 170 at 390, capped at 340. A plain `vw` cannot do that, because the mark has
 * to be a *larger* fraction of a narrow viewport than of a wide one.
 */

import * as React from "react";
import { m, useReducedMotion } from "framer-motion";
import { AI_ORB_INTRINSIC, AI_ORB_SRC } from "@/components/v2/ai-mark-asset";
import { LANDING_EASE } from "@/components/v2/landing/reveal";

/**
 * The element's width, as one clamp. See the note on Scale.
 *
 * <p>Written against the *element*, which is `AI_ORB_BLOOM` times the sphere
 * inside it — the crop keeps the artwork's own glow, so 320px of sphere is a
 * 384px box. Fitted rather than chosen: `17.14vw + 137px` passes through
 * (390, 204) and (1440, 384), which are 170 and 320 of sphere.
 *
 * <p>320 at 1440 is a judgement call and the reasoning is: the lockup this
 * replaces was 555px wide and 390 tall, so an orb of comparable *mass* is
 * around 320 square. Reusing the lockup's own clamp would have given a 462px
 * sphere, which reads as a poster rather than as an identity.
 */
const HERO_WIDTH = "clamp(204px, 17.14vw + 137px, 408px)";

/**
 * The extracted orb, and its intrinsic pixels.
 *
 * <p>256 square, which was sized for the 56px resting orb in an Ask panel —
 * four times its largest placement there. Drawn at 384px here it is 0.67 device
 * pixels per CSS pixel on a 1x panel, so it is being *upscaled*, and that is
 * the one real cost of using the AI mark as the hero. It survives it: the orb
 * is a smooth, high-contrast object with no fine detail to lose, and the
 * artwork's own bloom hides the interpolation. Upscaling the file would not add
 * detail — the pixels are the pixels — so what would actually fix it is a
 * larger crop from the 1254px source, one line in
 * `scripts/extract-brand-assets.py`.
 */
const HERO_SRC = AI_ORB_SRC;
const HERO_W = AI_ORB_INTRINSIC;
const HERO_H = AI_ORB_INTRINSIC;

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
      /* `items-center` because the wrapper now holds three stacked things —
         the orb, the wordmark and the tagline — where it held one. The width
         clamp sizes the *orb*; the type is free to be wider than it if a
         narrow viewport ever makes it so. */
      className="relative isolate flex flex-col items-center"
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
          sits in, which is what stops the mark reading as pasted on.

          <p>Square now, where it was 150% by 132%. That ellipse was shaped for
          a lockup twice as wide as it was tall; behind a round mark it reads as
          a glow that has been stretched. */}
      <div
        aria-hidden
        data-breathe
        className="v2-hero-bloom pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[155%] w-[155%] -translate-x-1/2 -translate-y-1/2"
      />
      {/*
        NO OPACITY, NO FILTER, NO BLEND, NO TINT.

        <p>The artwork's colour is the identity. `width`/`height` are the
        intrinsic pixels — square, so the reserved box is square — and the CSS
        width overrides them for layout. The pair is what stops the headline
        jumping when the image lands.

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
        THE IDENTITY, AS TYPE.

        <p>`Reverie` in the headline face and the tagline in letterspaced caps,
        both clamped so they hold their proportion to the orb across the range.
        The wordmark tops out at 62px rather than the 74 the vector lockup used:
        the orb is a 320px object and a 74px word beside it competes with it,
        where 62 reads as its caption.

        <p>`--ink` for the name and `--ink-2` for the line under it. The tagline
        is a qualifier, not a second headline, and the letterspacing is what
        makes eleven small caps read as a considered mark rather than as text
        that has been squeezed.

        <p>Inside the animated wrapper on purpose: opacity and transform do not
        take an element out of the accessibility tree, so both are readable from
        the first frame — before the entrance finishes, and whether or not the
        entrance runs at all.
      */}
      <div className="relative mt-[clamp(0.75rem,1.6vh,1.5rem)] flex flex-col items-center">
        <span
          className="font-headline leading-[1.02] text-ink"
          style={{ fontSize: "clamp(28px, 3.3vw + 15px, 62px)", letterSpacing: "-0.03em" }}
        >
          Reverie{" "}
          {/*
            `AI` IN THE LIGHT'S OWN COLOUR, and only `AI`.

            <p>`--brand-text` rather than `--brand`: the palette's
            azure-as-a-word. At 62px either would clear contrast — large text
            needs 3:1 and `--brand` is 5.98 — but this word is 28px at 390 and
            the text tier is the one that holds there too, so one value serves
            the whole clamp.

            <p>The glow is `em`-based, so it scales with the word instead of
            being a 24px halo around a 28px letter pair on a phone. Two stops:
            a tight one that reads as the letters being lit and a wide one that
            reads as the light around them — which is what the artwork's own
            wordmark does, and the reason "blue" alone would have looked like
            coloured text rather than light.
          */}
          <span
            className="text-brand-text"
            style={{
              textShadow:
                "0 0 0.14em hsl(var(--brand) / 0.45), 0 0 0.5em hsl(var(--brand) / 0.35)",
            }}
          >
            AI
          </span>
        </span>
        <span
          className="mt-[clamp(0.35rem,0.8vh,0.7rem)] text-ink-2"
          style={{
            fontSize: "clamp(10px, 0.45vw + 6.5px, 13px)",
            letterSpacing: "clamp(0.16em, 0.6vw, 0.3em)",
            /* The tracking adds space after the last letter too, so without
               this the block sits visibly left of the orb above it. */
            textIndent: "clamp(0.16em, 0.6vw, 0.3em)",
          }}
        >
          CONVERSATIONAL INTELLIGENCE
        </span>
      </div>
    </m.div>
  );
}

/**
 * THE HERO'S LIGHT: a field above, a field below, and one arc under both.
 *
 * <p>Three elements, all decoration, all behind everything. The two fields are
 * the approved render's own — it is an orb in a lit space rather than an orb on
 * black, brightest above and behind the mark and pooling again below the
 * wordmark — and the arc is the lit curve the render draws across its lower
 * third, which is cropped out of the file so the page can span it at any width.
 *
 * <p>Percentages of the *section*, not of the mark, because the mark's own
 * bloom is inside `HeroBrandLockup` and scales with it. These are the room the
 * mark is standing in. Both are far wider than tall: a circle of light behind a
 * circular mark reads as a halo somebody drew.
 *
 * <p>The arc is quieter than it was — 22% to 12% — because the artwork brings a
 * curve of its own and two of them read as one neon semicircle drawn twice. See
 * the three recipes in globals.css.
 */
export function HeroHorizon() {
  const still = Boolean(useReducedMotion());

  return (
    <>
      {/* ABOVE. Centred a little over a third of the way down, which is where
          the orb sits, and tall enough to reach off the top of the section so
          it has no visible upper edge. */}
      <m.div
        aria-hidden
        data-reveal
        className="v2-hero-light-top pointer-events-none absolute left-1/2 top-[-18%] -z-10 h-[78%] w-[128%] -translate-x-1/2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={clock(still, 1.2, 0.35)}
      />
      {/* BELOW. Under the wordmark rather than at the foot of the section: in
          the artwork the pool is the orb's reflection, so it belongs close to
          the thing reflecting. */}
      <m.div
        aria-hidden
        data-reveal
        className="v2-hero-light-bottom pointer-events-none absolute bottom-[-6%] left-1/2 -z-10 h-[62%] w-[112%] -translate-x-1/2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={clock(still, 1.3, 0.55)}
      />
      <m.div
        aria-hidden
        data-reveal
        className="v2-hero-arc pointer-events-none absolute bottom-[-26vw] left-1/2 -z-10 h-[44vw] w-[190%] -translate-x-1/2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        /* Last, and slowest. The only thing on the page allowed to still be
           arriving after the copy, because nobody is waiting for it. */
        transition={clock(still, 1.4, 0.9)}
      />
    </>
  );
}
