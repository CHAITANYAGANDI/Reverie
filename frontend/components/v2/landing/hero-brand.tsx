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
 * <p>`BrandMark` and `mark-geometry` drew the band's corner, the nav lockup,
 * the auth shell and the footer for as long as there were two identities. They
 * draw nothing now: the orb replaced the lens everywhere, on request, and both
 * modules are unreferenced by production code. They are left in place rather
 * than deleted in the same change that stopped using them — reversing one
 * decision should not mean restoring two files.
 *
 * <h2>NO MARK AT ALL, which is where four passes landed</h2>
 *
 * <p>This has drawn: vector geometry composed from `mark-geometry`; then
 * `reverie-main-hero.webp`, the approved product lockup with its lens, wordmark
 * and tagline in one picture; then `reverie-ai-orb-mark.webp` at 320px of
 * sphere, which overturned the rule that the orb must never lead a front page.
 * It now draws no mark: the identity here is `Reverie AI` set in type, with the
 * tagline under it.
 *
 * <p>Which is not the absence of an identity. The orb is 26px away in the bar
 * above — see the note in app/page — and the light it used to sit in is still
 * behind this, so the hero opens on a lit field, the product's name, and the
 * claim. What it no longer opens on is a 320px object competing with a 56px
 * headline for the same glance.
 *
 * <h2>The words are type, and that is now the whole of it</h2>
 *
 * <p>`Reverie` in the headline face with `AI` in the orb's own sampled blue,
 * and `CONVERSATIONAL INTELLIGENCE` in letterspaced caps.
 *
 * <p>Type is what the lockup could not be, and that was the whole reason it was
 * a picture: the approved render sets `Reverie` in a face this product does not
 * ship, lit with a gradient CSS cannot reproduce, so reproducing it in markup
 * meant a wordmark visibly not the artwork's. With no artwork beside them the
 * objection is gone — these are the product's name in the product's own
 * typeface rather than an imitation of somebody else's.
 *
 * <h2>The light is the page's, not a file's</h2>
 *
 * <p>`HeroHorizon` draws the three fields the approved render is lit by — one
 * above, one below, and the lit curve across its lower third — because in a
 * file they are fixed at one width and one brightness, and on the page they
 * have to span a viewport from 390px to 1600 and sit *behind* the copy. They
 * are what is left of the artwork here, and they are why the hero still reads
 * as the artwork's space with nothing drawn in it.
 */

import * as React from "react";
import { m, useReducedMotion } from "framer-motion";
import { LANDING_EASE } from "@/components/v2/landing/reveal";

/**
 * When the identity arrives.
 *
 * <p>One beat: the name and the tagline fading, lifting and settling together,
 * then the headline, then the copy, then the cost line. `HERO_BEATS` holds the
 * rest. It was five beats when the identity was vector geometry with parts to
 * stagger, and one when it was a single picture; it stays one now that it is
 * two lines of type, because a wordmark and its own tagline arriving separately
 * reads as a layout settling rather than as an identity.
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
      /* No width of its own any more. It held a clamp that sized the orb, and
         with the orb gone the type sizes itself — a fixed width here would only
         be something for the tagline to wrap inside. */
      className="relative flex flex-col items-center"
      /* opacity, scale and a lift — the whole identity, as one object. Which
         is what the brief asks for and, now that the parts are pixels, the
         only thing there is to animate. */
      initial={{ opacity: 0, scale: 0.965, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={clock(still, IDENTITY_FOR, IDENTITY_IN)}
    >
      {/*
        THE IDENTITY, AS TYPE.

        <p>`Reverie` in the headline face and the tagline in letterspaced caps,
        both clamped across the range. The wordmark tops out at 62px rather than
        the 74 the vector lockup used: 74 was set against a 230px lens directly
        above it, and with nothing above it at all 62 sits better under a 56px
        headline without the two reading as a tie.

        <p>`--ink` for the name and `--ink-2` for the line under it. The tagline
        is a qualifier, not a second headline, and the letterspacing is what
        makes eleven small caps read as a considered mark rather than as text
        that has been squeezed.

        <p>Inside the animated wrapper on purpose: opacity and transform do not
        take an element out of the accessibility tree, so both are readable from
        the first frame — before the entrance finishes, and whether or not the
        entrance runs at all.
      */}
      <div className="relative flex flex-col items-center">
        <span
          className="font-headline leading-[1.02] text-ink"
          style={{ fontSize: "clamp(28px, 3.3vw + 15px, 62px)", letterSpacing: "-0.03em" }}
        >
          Reverie{" "}
          {/*
            `AI` IN THE ORB'S OWN COLOUR, and only `AI`.

            <p>`--brand-orb`, which is #087afd sampled from the approved
            artwork: the median of the lit, saturated pixels inside the sphere.
            Not `--brand-text` and not `--brand` — both were tried and both are
            visibly lighter than the mark forty pixels above, which is fine for
            a word anywhere else on a page and wrong for the one word whose job
            is to be the same blue as the orb. See the note on the token.

            <p>The glow is the same colour and `em`-based, so it scales with
            the word instead of being a 24px halo around a 28px letter pair on
            a phone. Two stops: a tight one that reads as the letters being lit
            and a wide one that reads as the light around them — which is what
            the artwork's own wordmark does, and the reason a flat blue would
            have looked like coloured text rather than light.
          */}
          <span
            className="text-brand-orb"
            style={{
              textShadow:
                "0 0 0.14em hsl(var(--brand-orb) / 0.5), 0 0 0.5em hsl(var(--brand-orb) / 0.38)",
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
