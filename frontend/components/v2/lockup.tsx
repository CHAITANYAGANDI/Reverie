import { BrandMark } from "@/components/v2/brand-mark";
import { markFill } from "@/components/v2/mark-geometry";

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

/**
 * THE SAME LOCKUP, STACKED, at the size an identity is read at once per page.
 *
 * <h2>Why there are two arrangements and not one</h2>
 *
 * <p>`Lockup` is the horizontal one: 19px in the public nav, 21px over the auth
 * form, 14px in the footer. It is a wayfinder — the thing you press to get
 * home, sitting in a row of other controls — and at that size and in that
 * company the mark belongs beside the word.
 *
 * <p>This one is the identity itself, drawn once, above the claim: the mark
 * large enough for the waveform inside it to be legible, the word centred under
 * it. That is the arrangement of the supplied logo and it is not a variant of
 * the nav lockup — it is what the nav lockup is a reduction of.
 *
 * <h2>What is deliberately not in it</h2>
 *
 * <p>The supplied artwork carries `CONVERSATIONAL INTELLIGENCE` in letterspaced
 * caps under the word. It is left out here, because the line it would occupy is
 * the line the kicker was just removed from — "Meeting intelligence, without
 * the meeting-tool clutter." — and putting a second descriptor back in the same
 * place is the change undoing itself. The headline underneath says what the
 * product does, in the approved words.
 *
 * <p>No glow either. The artwork sits on its own field with a bloom around the
 * mark and a lit arc beneath it; this page already has one ambient wash and a
 * second light source under the logo would be two.
 */
export function LockupStacked({ size = 128 }: { size?: number }) {
  /*
   * The gap has to be measured from the drawing, not from the box.
   *
   * <p>The mark is square and the lens is not — at this size it reaches about
   * 74% of the box, so there is a quarter of the height of empty SVG below it.
   * A plain `mt-3` on the word therefore renders as roughly forty pixels of
   * air, which is what the first cut of this did. So the dead space is taken
   * back and the real gap added on top of it. See `markFill`.
   */
  const dead = size * (1 - markFill(size));
  return (
    <span className="inline-flex flex-col items-center text-ink">
      <BrandMark size={size} title="Reverie" />
      {/*
        0.33x the box, which is 0.44x the lens itself — the artwork's ratio. The
        word reads as the larger element there because it is wider than the
        mark, not because it is taller.

        <p>`-0.03em` is a touch tighter than the nav lockup's `-0.028`: tracking
        that reads as neutral at 19px reads as loose at 42.
      */}
      <span
        className="font-headline leading-none"
        style={{
          fontSize: Math.round(size * 0.33),
          letterSpacing: "-0.03em",
          marginTop: Math.round(size * 0.17 - dead),
        }}
      >
        Reverie
      </span>
    </span>
  );
}
