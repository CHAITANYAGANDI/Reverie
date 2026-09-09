"use client";

/**
 * THE REVERIE IDENTITY, AS THE HERO'S FIRST BEAT.
 *
 * <h2>The problem this exists to fix</h2>
 *
 * <p>The hero used `LockupStacked` — a 128px mark box over a 42px word, which
 * put about 62px of visible lens on the page. It read as a small logo pasted
 * above a heading rather than as the product's identity, and the headline under
 * it was 40px, the same visual weight, so nothing was first.
 *
 * <p>This is the identity at the scale the artwork is drawn at, adapted to a
 * landscape viewport: a lens 230px wide at desktop, the word under it at 70,
 * and the line that names what Reverie is under that. Three elements, one
 * column, no container.
 *
 * <h2>Why it is not the nav lockup with a bigger number</h2>
 *
 * <p>Because the two are different objects. `Lockup` is horizontal, functional
 * and 19px: the thing you press to get home, in a row with Sign in and Get
 * started. This is stacked, expressive, carries a tagline the nav must never
 * carry, and animates its own parts. Forcing one component to be both would
 * mean a `variant` prop deciding layout, scale, copy and motion at once.
 *
 * <p>What they share is everything that must not diverge: the same geometry
 * from `mark-geometry`, the same colour ramp from `MarkGradients`, the same
 * `--brand-*` tokens. Nothing is duplicated but the renderer.
 *
 * <h2>`data-reveal` on every animated part</h2>
 *
 * <p>Framer renders `initial` into the server HTML's style attribute, so
 * without JavaScript the mark would be a 230px hole where an identity should
 * be. The page carries a `<noscript>` block forcing every `[data-reveal]` to
 * `opacity:1;transform:none`, and every element here that starts hidden or
 * displaced carries the attribute so that override reaches it.
 *
 * <p>Which is also why the bottom ribbon's rotation is on a `<g>` rather than
 * on the path: `transform:none` would take an attribute rotation off the path
 * with it, and half the mark would be upside down for anybody with JavaScript
 * disabled.
 *
 * <h2>Why the mark is composed here rather than rendered by `BrandMark`</h2>
 *
 * <p>The entrance animates the mark's parts separately — the two ribbons settle
 * toward each other, then the bars reveal from the centre outward. That needs
 * `m.path` and `m.rect`, which a plain `<svg>` component cannot hand out. So
 * this builds the same paths from the same three functions and fills them from
 * the same `<defs>`. `BrandMark` is untouched and still draws every other
 * instance in the product.
 *
 * <h2>Scale</h2>
 *
 * <p>One `clamp()` rather than a pile of breakpoints, fitted through the two
 * ends of the range: 118px of visible lens at 390 and 230 at 1440. It lands
 * inside the brief's target at every width between — 158 at 768, 185 at 1024,
 * 213 at 1280 — which a plain `vw` cannot do, because the mark has to be a
 * *larger* fraction of a narrow viewport than of a wide one.
 */

import * as React from "react";
import { m, useReducedMotion } from "framer-motion";
import { MarkGradients, markFills } from "@/components/v2/brand-mark";
import { barsOf, crescent, cutFor } from "@/components/v2/mark-geometry";
import { LANDING_EASE } from "@/components/v2/landing/reveal";

/* The beats after the identity live in a module with no React in it, so the
   page — a server component — can read them too. See hero-beats. */

/**
 * The cut the hero draws: the artwork's own, nine bars and the thinnest ribbon.
 *
 * <p>A fixed number rather than the rendered width, because `cutFor` picks the
 * optical cut and every width in the hero's range is far above its 40px
 * boundary. The hero therefore always draws the full drawing, and the CSS
 * clamp — which could not be read as a number anyway — only scales it.
 */
const HERO_CUT = 264;

/** The visible width of the lens, as one clamp. See the note on Scale. */
const LENS_WIDTH = "clamp(118px, 10.67vw + 76px, 230px)";

/**
 * The lens, cropped out of the mark's square box.
 *
 * <p>`BrandMark` is square and the lens is not: it spans x 2→30 and y
 * `outerApex`→`32 - outerApex`, so a square box leaves a quarter of its height
 * empty above and below the drawing. In an 18px band that is invisible. At 230px
 * it is sixty pixels of nothing between the mark and the word under it.
 *
 * <p>So the hero's viewBox is the lens's own bounding box. No negative margins
 * and no arithmetic in the layout: the element is exactly the size of what it
 * draws, and `overflow-visible` lets the ribbon tips' antialiasing spill the
 * half-pixel it needs.
 */
function lensBox(cut: ReturnType<typeof cutFor>) {
  const height = 32 - cut.outerApex * 2;
  return {
    viewBox: `2 ${cut.outerApex} 28 ${height}`,
    /** Height as a fraction of the lens's width, for the CSS box. */
    ratio: height / 28,
  };
}

/*
 * THE ENTRANCE, AS ONE TIMELINE.
 *
 * <p>Seconds, and they overlap: the mark is arriving while its ribbons settle,
 * the ribbons are settling while the bars reveal. Nothing waits for the thing
 * before it to finish, which is what keeps the whole arrival inside 1.5s
 * instead of adding up to four.
 */
const MARK_IN = 0.1;
const RIBBONS_IN = 0.3;
const BARS_IN = 0.45;
/** 50ms apart, centre outward. Under 40 it is not a sequence; over 60 it drags. */
const BAR_STAGGER = 0.05;
const WORD_IN = 0.65;
const TAGLINE_IN = 0.8;

/**
 * How far each ribbon travels, in viewBox units.
 *
 * <p>The brief asks for four screen pixels. A CSS transform on an SVG child
 * works in the local user coordinate system, not in pixels — so at a 230px lens
 * over 28 units, one unit is 8.2px and four pixels is about half a unit. Written
 * in units because that is what the element will actually apply.
 */
const RIBBON_TRAVEL = 0.5;

/**
 * One transition, with reduced motion zeroing the clock rather than the tree.
 *
 * <p>Every animated part of the identity renders identically whatever the
 * preference is, and `still` only takes the duration and the delay to zero.
 * The server cannot know the preference — `useReducedMotion()` is false there —
 * so a branch that returned a different element, or omitted `initial`, would
 * serve `style="opacity:0"` and then hydrate against something else. React
 * reports that as a failed hydration and, because it is outside a Suspense
 * boundary, throws the whole root away and re-renders on the client. Measured:
 * nine errors on this page under `prefers-reduced-motion: reduce`.
 *
 * <p>A zero-duration transition is not a fast animation. It is no animation:
 * the identity is simply there, at full scale, on the first frame after
 * hydration — which is what the brief asks for and what reveal.tsx has always
 * promised.
 */
function clock(still: boolean, duration: number, delay: number) {
  return still ? { duration: 0 } : { duration, ease: LANDING_EASE, delay };
}

export function HeroBrandLockup() {
  const still = Boolean(useReducedMotion());
  const cut = cutFor(HERO_CUT);
  const { ratio } = lensBox(cut);

  return (
    /* `isolate`, so the bloom's stacking is this block's business and cannot
       end up over the nav or under the page's own wash. */
    <div className="relative isolate flex flex-col items-center">
      {/*
        THE BLOOM, behind the mark and nothing else.

        <p>Sized off the lens rather than off the section: 1.7x its width, so it
        grows with the identity and never becomes a wallpaper at 1600 or a
        smudge at 390. Absolutely positioned rather than being the mark's own
        background, because a background would be clipped to the box.

        <p>`data-breathe` only when motion is allowed. The keyframes are in
        globals.css and the reduced-motion query there zeroes them anyway; the
        attribute means the animation is not even declared, which is the
        difference between "stopped" and "absent".
      */}
      <div
        aria-hidden
        className="v2-hero-bloom pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2"
        /* Always declared, and stopped by CSS rather than by this component.
           An attribute that appears on the server and not on the client is the
           same hydration mismatch the transitions above were fixed for -- and
           the `prefers-reduced-motion` block in globals.css already zeroes
           every animation with `!important`, which is the right layer for a
           CSS animation to be suppressed at. */
        data-breathe=""
        style={{
          /* 2x the lens across and 4x its height, which at the lens's own 1.8:1
             is close to round — the mark sits in the middle of a soft field
             rather than wearing a tight ellipse. The first cut was 1.7x and
             3.4x and read as nothing at all on the page. */
          width: `calc(${LENS_WIDTH} * 2)`,
          height: `calc(${LENS_WIDTH} * ${ratio} * 4)`,
        }}
      />

      <HeroMark still={still} />

      {/*
        THE WORDMARK.

        <p>`font-headline` and the nav lockup's tracking one step tighter:
        tracking that reads as neutral at 19px reads as loose at 70. Set in
        `--ink` rather than a gradient — the artwork's wordmark is near-white
        with the faintest cool cast, and a gradient on type this size reads as a
        nineties logo.
      */}
      <m.span
        data-reveal
        className="mt-[clamp(0.75rem,1.1vw,1.5rem)] block font-headline leading-none text-ink"
        style={{ fontSize: "clamp(30px, 3.81vw + 15px, 74px)", letterSpacing: "-0.03em" }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={clock(still, 0.7, WORD_IN)}
      >
        Reverie
      </m.span>

      {/*
        CONVERSATIONAL INTELLIGENCE.

        <p>Exactly those two words, and written in capitals rather than
        lower-cased and transformed: the copy is specified in capitals, and a
        `text-transform` would leave the DOM saying something the brief did not
        ask for.

        <p>The stacked lockup this replaces argued the line should be left out,
        on the grounds that it would sit where a kicker had just been removed
        from. That is superseded. It is part of the identity in the artwork, and
        what was removed was a marketing claim — "without the meeting-tool
        clutter" — rather than the product's own description. This says what kind
        of product Reverie is, which is the one thing a wordmark cannot.

        <p>The tracking settles rather than the line rising: `0.42em` to
        `0.34em` over the fade, which is what a rise is for letterspaced caps.
        The resting value is in `style` so reduced motion and the end of the
        animation agree on it.
      */}
      <m.span
        data-reveal
        /* `--ink-2` rather than `--ink-3`: at 13px under a 70px wordmark, ink-3
           read as a caption somebody had left in. In the artwork this line is
           nearly as bright as the word above it. `1vw` rather than `0.8` puts
           the gap at 14px at 1440, inside the 12-18 the composition asks for
           rather than one pixel under it. */
        className="mt-[clamp(0.5rem,1vw,1.125rem)] block font-headline text-ink-2"
        style={{
          fontSize: "clamp(10px, 0.5vw + 6px, 14px)",
          /* Reduced at phone widths, where the desktop tracking runs the two
             words past a 390px column. */
          letterSpacing: "clamp(0.16em, 0.6vw, 0.34em)",
        }}
        initial={{ opacity: 0, letterSpacing: "0.42em" }}
        animate={{ opacity: 1, letterSpacing: "0.34em" }}
        transition={clock(still, 0.8, TAGLINE_IN)}
      >
        CONVERSATIONAL INTELLIGENCE
      </m.span>
    </div>
  );
}

/**
 * The mark, with its parts arriving separately.
 *
 * <p>Geometry from `mark-geometry`, colour from `MarkGradients`, and the only
 * thing added here is when each piece appears.
 *
 * <p>The ribbon settle is the seam mark's own gesture, which this drawing
 * inherited: the halves of a split disc coming back into register. Half a unit,
 * once. No rotation, nothing perpetual.
 */
function HeroMark({ still }: { still: boolean }) {
  const id = React.useId().replace(/:/g, "");
  const cut = cutFor(HERO_CUT);
  const d = crescent(cut);
  const { viewBox, ratio } = lensBox(cut);
  const { top, bottom, bar } = markFills(id);
  const bars = barsOf(cut);

  /* The bars are emitted centre-first — see `barsOf` — so the index IS the
     distance from the middle, in pairs. One index, two bars, one delay. */
  const rank = (i: number) => Math.floor((i + 1) / 2);

  return (
    <m.svg
      viewBox={viewBox}
      role="img"
      aria-label="Reverie"
      data-reveal
      className="block overflow-visible"
      style={{
        width: LENS_WIDTH,
        height: `calc(${LENS_WIDTH} * ${ratio})`,
        /*
         * THE RIM, and it is a `drop-shadow` rather than a `blur`.
         *
         * <p>The artwork's ribbons read as lit metal because they carry light
         * just outside their own edge. A `drop-shadow` filter glows the union
         * of the shapes it is applied to — the two ribbons and the nine bars —
         * which is exactly that, and costs one composited layer.
         *
         * <p>Two stops. The tight one at 2% of the lens width is the edge; the
         * loose one at 7% is the air around it. Both are `--brand` and both are
         * under half opacity, because the failure mode here is a gamer halo and
         * the way to avoid it is to keep the radius small relative to the mark
         * and the opacity well under the fill's.
         *
         * <p>Scaled off the lens rather than fixed in pixels, so a 118px mark
         * on a phone is not wearing a 16px glow.
         */
        filter: `drop-shadow(0 0 calc(${LENS_WIDTH} * 0.02) hsl(var(--brand) / 0.45)) drop-shadow(0 0 calc(${LENS_WIDTH} * 0.07) hsl(var(--brand) / 0.28))`,
      }}
      initial={{ opacity: 0, scale: 0.94, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={clock(still, 0.75, MARK_IN)}
    >
      <MarkGradients id={id} />

      {/*
        The two ribbons, settling toward each other.

        <p>Both animate the same way — `-0.5` to `0` — and the bottom one is
        inside a rotated group, so the same local motion is the opposite motion
        on screen. That is the rotational symmetry the mark is built on doing
        the work, rather than two hand-signed numbers that could disagree.

        <p>The rotation is on a `<g>` rather than on the path, because framer
        writes a CSS `transform` for the `x` animation and a CSS transform
        replaces an SVG `transform` attribute outright — the rotation would
        simply vanish on the first frame.
      */}
      <m.path
        data-reveal
        d={d}
        fill={top}
        initial={{ x: -RIBBON_TRAVEL }}
        animate={{ x: 0 }}
        transition={clock(still, 0.85, RIBBONS_IN)}
      />
      <g transform="rotate(180 16 16)">
        <m.path
          data-reveal
          d={d}
          fill={bottom}
          initial={{ x: -RIBBON_TRAVEL }}
          animate={{ x: 0 }}
          transition={clock(still, 0.85, RIBBONS_IN)}
        />
      </g>

      {/*
        THE WAVEFORM, revealing from the centre outward.

        <p>`scaleY` about the bar's own middle rather than a height animation: a
        height change moves the top edge and the bottom edge at different rates
        and the rounded caps drift, where a scale keeps them symmetric.

        <p>It happens once. A logo whose waveform keeps bouncing while somebody
        reads the page is an audio visualiser, and this mark has to stay
        readable and calm for as long as the page is open.
      */}
      {bars.map((b, i) => (
        <m.rect
          key={i}
          data-reveal
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx={b.w / 2}
          fill={bar}
          style={{ transformOrigin: `${b.x + b.w / 2}px ${b.y + b.h / 2}px` }}
          initial={{ opacity: 0, scaleY: 0.14 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={clock(still, 0.55, BARS_IN + rank(i) * BAR_STAGGER)}
        />
      ))}
    </m.svg>
  );
}

/**
 * The horizon, low in the hero.
 *
 * <p>Its own export because it belongs to the section rather than to the
 * identity: it sits at the transition between the brand statement and the page,
 * which is a position only the section knows.
 *
 * <p>Very wide and very shallow — 190% of the hero's width — so the visible
 * part is a nearly straight line of light rather than a curve you could put a
 * radius to. That is the difference between atmosphere and a planet.
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
