import { BrandMark } from "@/components/v2/brand-mark";

/**
 * The mark and the word, at 0.92x.
 *
 * <p>The mark is drawn slightly smaller than the type: at parity it out-weighs
 * it — the mark is solid and the type is not — and the lockup reads
 * front-heavy. Found by rendering both, not by calculation. See
 * `design-demo/lib/mark.js`.
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
      <BrandMark size={Math.round(size * 0.92)} title="Reverie" mono={muted} />
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
