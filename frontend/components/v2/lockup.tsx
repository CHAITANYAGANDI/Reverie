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
      <BrandMark size={Math.round(size * 0.92)} title="Reverie" />
      <span
        className="font-headline leading-none"
        style={{ fontSize: size, letterSpacing: "-0.028em" }}
      >
        Reverie
      </span>
    </span>
  );
}
