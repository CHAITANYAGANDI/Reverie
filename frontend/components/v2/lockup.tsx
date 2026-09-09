import { BrandMark } from "@/components/v2/brand-mark";

/**
 * The lens's visible width, as a multiple of the wordmark's size.
 *
 * <p>1.95, which sounds enormous and is not: the lens is 1.56 times as wide as
 * it is tall at this cut, so at a 21px wordmark this is 41px of width and 26px
 * of height — a mark about half as wide as the word beside it, standing a
 * little taller than its capitals. Which is the proportion the supplied artwork
 * draws.
 *
 * <p>It was `size * 0.92` against the mark's **square box**, on the reasoning
 * that a solid mark at parity with the type reads front-heavy. That reasoning
 * was sound and was being applied to the wrong number: 0.92 of the box is 0.8
 * of the lens's width and, because the lens fills a little over half its box's
 * height, 0.46 of its height — so a 21px word carried a mark 11px tall. The
 * mark did not out-weigh the type; it disappeared next to it. Reported as
 * exactly that, everywhere the lockup appears.
 *
 * <p>Expressed against the *visible* lens rather than the box, so the same
 * number holds at every size and there is nothing to recompute if a cut
 * changes — see `crop` in `BrandMark` and `lensBox` in `mark-geometry`.
 */
const MARK = 1.95;

/**
 * The mark and the word.
 *
 * <p>Shared rather than copied. This was written inline on the landing page and
 * the auth screens were still wearing the thing it replaced: a `<Mic />` glyph
 * in a filled rounded square, which is the generic recorder logo the V2
 * identity study explicitly rejected. Two lockups is two brands, and the screen
 * where somebody first types their password is the last place to have a second
 * one.
 */
export function Lockup({ size, muted = false }: { size: number; muted?: boolean }) {
  return (
    <span
      className={muted ? "inline-flex items-center text-ink-3" : "inline-flex items-center text-ink"}
      style={{ gap: Math.max(6, Math.round(size * 0.38)) }}
    >
      {/* `mono` when muted, and the gradient otherwise. A footer sets this
          whole line to `--ink-3`; the mark is the one thing in it that would
          not obey, and a blue mark in a grey line is the loudest thing on the
          page. */}
      <BrandMark size={Math.round(size * MARK)} crop title="Reverie" mono={muted} />
      <span
        className="font-headline leading-none"
        style={{ fontSize: size, letterSpacing: "-0.028em" }}
      >
        Reverie
      </span>
    </span>
  );
}

/*
 * NO `LockupStacked`.
 *
 * <p>It was the hero's identity for one turn: a 128px mark box over a 42px
 * word, with the artwork's tagline deliberately left out. Both decisions are
 * superseded.
 *
 * <p>The scale was the reported problem — 62px of visible lens above a 40px
 * headline reads as a logo pasted onto a heading, not as a product's identity —
 * and the tagline is part of the identity in the supplied artwork. What
 * replaced it is components/v2/landing/hero-brand: the same geometry and the
 * same colour ramp at the scale the artwork is drawn at, with the parts
 * animated separately, which is a landing-page component rather than a shared
 * one.
 *
 * <p>`Lockup` above is untouched and is still the compact horizontal branding
 * in the nav, the auth shell, the SSO screen and the footer. That was never the
 * thing that needed changing.
 */
