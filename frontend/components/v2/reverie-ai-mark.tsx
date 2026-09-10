/*
 * THE REVERIE AI MARK — the approved orb, as the product draws it.
 *
 * <h2>TWO IDENTITIES, AND ONE PLACE THEY NOW MEET</h2>
 *
 *     BrandMark        the lens          "which product am I using?"
 *     ReverieAiMark    the lit orb       "where is Reverie's assistant?"
 *
 * <p>The first belongs in the band's corner, the auth shell and the footer. The
 * second belongs on the controls that summon the assistant — and, since the
 * product owner asked for it, on the landing hero, which is the one placement
 * that is not an invocation. `landing/hero-brand` draws the same file directly
 * rather than through this component, because it needs a responsive `clamp`
 * where every other placement is a fixed size.
 *
 * <p>The placement note at the foot of this file is the part that is easy to
 * get wrong later, and it records the argument the hero overturned rather than
 * pretending it was never made.
 *
 * <h2>It is the artwork, not a drawing of the artwork</h2>
 *
 * <p>This was 300 lines of SVG: a sphere, two caps cut out of it by a lens
 * curve, gloss along each inner edge, a rim light and a bar table, in three
 * optical cuts. It is gone, and `ai-mark-asset` records why — the short version
 * is that both were rasterised at every production size through a canvas and
 * compared at true device pixels, and the real artwork held its structure to
 * 24px and its character to 16, while the drawing read flat everywhere.
 *
 * <p>So there is one implementation of this identity and it is the approved
 * file. Nothing here redraws it, tints it, or filters it.
 *
 * <h2>The colour is untouched, and that constrains the design</h2>
 *
 * <p>The orb's colour *is* the identity, so the image carries no `opacity`, no
 * `filter`, no `mix-blend-mode` and no `currentColor` — pinned by a test. Which
 * rules out the obvious ways to make it respond to a pointer or to read as
 * inactive, and is why:
 *
 * <ul>
 *   <li>the glow is a <b>separate span behind the image</b>, so hover and the
 *       open state brighten the halo rather than the artwork;</li>
 *   <li>an inactive tab quietens its <b>label</b>, never the orb.</li>
 * </ul>
 *
 * <h2>The motion</h2>
 *
 * <p>The mark moves as a whole — scale and a one-pixel float — because there is
 * no longer any internal geometry to animate, and faking internal movement by
 * redrawing the artwork is exactly what this pass exists to stop.
 *
 * <p>Nothing in here holds state and nothing imports a motion library. Hover
 * and press are the parent control's, read through Tailwind's `group-*`
 * variants, so the whole response is CSS on a class list that never varies.
 * That matters more than it sounds: this renders on the server, and a mark
 * whose tree varied with a hook — `useReducedMotion`, a hover `useState` — is a
 * hydration mismatch, which this codebase has already paid for once.
 */

import { AI_ORB_SRC, aiOrbBox } from "@/components/v2/ai-mark-asset";
import { cn } from "@/lib/utils";

/**
 * The whole orb, on hover and on press.
 *
 * <p>1.055 over 220ms is a lean forward, not a bounce. The float is one pixel
 * — enough to read as lifting, small enough that nothing beside it appears to
 * move. 0.96 over 100ms is the press, and it wins because `group-active`
 * compiles to a two-selector rule with higher specificity than the base
 * duration.
 *
 * <p>`motion-safe:` on all of it: a scale is *motion*, so under
 * `prefers-reduced-motion` these utilities are not emitted at all rather than
 * being applied instantly, which is what zeroing a duration would do.
 *
 * <p>Every timing value is expressed as an explicit arbitrary CSS property.
 * Tailwind 3.4's arbitrary timing utility syntax can match both transition
 * and animation utilities, so a bare arbitrary value may generate no rule and
 * silently fall back to the default transition timing. Explicit CSS properties
 * avoid that ambiguity and make the intended duration unambiguous to the build.
 */
const ORB =
  "motion-safe:transition-transform motion-safe:[transition-duration:220ms] motion-safe:ease-soft " +
  "motion-safe:group-hover:scale-[1.055] motion-safe:group-hover:-translate-y-px " +
  "motion-safe:group-active:scale-[0.96] motion-safe:group-active:translate-y-0 " +
  "motion-safe:group-active:[transition-duration:100ms]";

/**
 * The halo, behind the artwork.
 *
 * <p>Zero at rest, because the artwork already has its own bloom and a second
 * one under it at all times would be the same light twice. What this is for is
 * the two states the image itself may not express: brighter on hover, and a
 * steady lift while the Ask surface is open.
 *
 * <p>The opacity is on the halo and never on the image. `transition-opacity`
 * without `motion-safe:` on purpose — globals.css already takes every
 * transition to zero under `prefers-reduced-motion`, so the brightening still
 * happens there, instantly, which is the static colour change that preference
 * allows.
 */
const HALO = "v2-ai-halo pointer-events-none absolute -inset-[14%] rounded-full transition-opacity duration-panel ease-soft";

export interface ReverieAiMarkProps {
  /**
   * The painted sphere's diameter in px — not the element's box.
   *
   * <p>The element is 1.2× this, because the artwork's bloom sits outside the
   * sphere and the crop keeps it. Naming the sphere is what makes a size in
   * this prop the same thing a reviewer measures on screen.
   */
  size?: number;
  className?: string;
  /**
   * An accessible name, for the one case where the orb is the only thing
   * identifying an Ask surface — the panel header, whose words were removed.
   *
   * <p>Leave it off inside a labelled button. The button owns the name there,
   * and a name on the mark makes a screen reader read the control twice.
   */
  title?: string;
  /**
   * Respond to the pointer. Requires `group` on the control around it.
   *
   * <p>A prop rather than always-on, because two of these are not in a control
   * at all: the panel header's and the resting orb on `/ask`. A mark that
   * leaned forward when the pointer crossed a header would be claiming to be
   * pressable.
   */
  interactive?: boolean;
  /**
   * The Ask surface this control opens is on screen.
   *
   * <p>A steady, slightly brighter halo — and emphatically not a loop.
   * Something that pulses for ever in the corner of a page is a notification,
   * and this is a state.
   */
  active?: boolean;
}

export function ReverieAiMark({
  size = 28,
  className,
  title,
  interactive,
  active,
}: ReverieAiMarkProps) {
  const box = aiOrbBox(size);

  return (
    <span
      data-ai-mark
      /* `shrink-0`: this is usually the short item in a flex row beside a
         label, and a flex row shrinks its children before it wraps them.
         The box is an inline style because `Button`'s base class carries
         `[&_svg]:size-4` and similar rules exist for images in other shells —
         an inline style is the only thing a descendant selector cannot shrink. */
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        interactive && ORB,
        className,
      )}
      style={{ width: box, height: box }}
      aria-hidden={title ? undefined : true}
    >
      <span
        aria-hidden
        className={cn(
          HALO,
          /* Rest / open / hover. `group-hover` last so it wins over `active`
             when a pointer is on an already-open control. */
          active ? "opacity-50" : "opacity-0",
          interactive && "group-hover:opacity-100",
        )}
      />
      {/*
        THE APPROVED ARTWORK, AND NOTHING DONE TO IT.

        <p>`alt=""` inside a labelled control, so a reader is not told about a
        decoration; the real name is on the button. Where this mark *is* the
        identity — the Ask panel's header — `title` becomes the alt and the
        wrapper drops its `aria-hidden`.

        <p>`width`/`height` are the layout size, so the box is reserved before
        the file arrives and nothing reflows. `draggable={false}` because a
        logo that can be dragged out of a button is a logo somebody will drag
        out of a button.
      */}
      <img
        src={AI_ORB_SRC}
        alt={title ?? ""}
        width={box}
        height={box}
        draggable={false}
        decoding="async"
        className="relative block h-full w-full select-none"
      />
    </span>
  );
}

/*
 * WHERE THIS GOES, AND WHERE IT MUST NOT.
 *
 * <p>Seven surfaces invoke Reverie's assistant and all seven carry the orb: the
 * launcher on Home (30px), the Ask control on a meeting's mode row (28), the
 * Ask panel's header (26), the resting state of an empty Ask thread (56), the
 * Ask tab on a phone (24), the transcript selection menu (20), and the notice
 * that the chat is not ready yet (40). Every one of those replaced a `Sparkles`
 * — the glyph every product in this category spends on the same claim, which
 * says nothing about whose assistant it is.
 *
 * <p>AND AN EIGHTH THAT IS NOT AN INVOCATION: the landing hero, at about 320px
 * of sphere. That was argued against here and in app/page.test.tsx — the case
 * being that the orb answers "where is the assistant?", so leading a front page
 * with it claims the product *is* an assistant rather than a record of what was
 * said. The product owner overruled it, which is theirs to do; the argument is
 * left standing so that the next person to reach for it knows it was heard.
 *
 * <p>It does not go beside a generated sentence, on a citation, in a transcript
 * row, next to an action item, or on Search. An identity mark that appears
 * wherever a model was involved stops meaning "Reverie's intelligence is here"
 * and starts meaning nothing — and `Regenerate summary`, on the meeting menu,
 * is deliberately left as it is for exactly that reason: it is an action on a
 * document, not a way into the assistant.
 *
 * <p>The file is 256px square — four times the largest of those — so every one
 * of them has pixels to spare on a retina panel. See `AI_ORB_INTRINSIC`.
 */
