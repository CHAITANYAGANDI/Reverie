import { ReverieAiMark } from "@/components/v2/reverie-ai-mark";

/**
 * The orb's sphere, as a multiple of the wordmark's size.
 *
 * <p>1.45: a 21px word carries a 30px sphere, which stands a good deal taller
 * than its capitals without out-weighing them. A round mark at parity with the
 * type reads front-heavy — it is solid where the type is not — and much under
 * 1.2 it disappears beside the word.
 *
 * <p>It was 1.25, which put a 26px sphere beside that word. Raised on request:
 * every orb in the product came up a step, and here the number that decides it
 * is this ratio rather than a size at a call site.
 *
 * <p>It was 1.95 against the *lens's visible width*, which is a different
 * question with a different answer: that mark is 1.56 times as wide as it is
 * tall, so 1.95 of the word bought 41px of width and only 26 of height. The orb
 * is square, so one number does both and the ratio comes down accordingly.
 * Getting this wrong in either direction is what made every previous pass at
 * the lockup either front-heavy or weightless.
 */
const MARK = 1.45;

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
export function Lockup({
  size,
  muted = false,
  /**
   * Draw the mark. The word alone when this is false.
   *
   * <p>For the landing page's footer, which was asked for as the word by
   * itself. Worth a prop rather than a second component: the type is the same
   * face, size and tracking either way, and a footer that set its own
   * `font-headline` and `letterSpacing` inline is how two lockups come to
   * disagree by a hundredth of an em.
   */
  mark = true,
  /**
   * Hide the mark from assistive technology, leaving the word to name it.
   *
   * <p>The mark carries `title="Reverie"` by default, which becomes the image's
   * `alt` — so the lockup is announced "Reverie Reverie", once for the artwork
   * and once for the wordmark beside it. That is the textbook redundant-alt
   * problem, and it is why this exists.
   *
   * <p>Not the default, because changing it would change the accessible name of
   * the nav, the auth shell and the SSO screen in one commit, and in the nav the
   * lockup is the only thing identifying the product. Opt in where the word is
   * unambiguously there to read — which today is the Privacy &amp; Demo Notice.
   */
  decorative = false,
}: {
  size: number;
  muted?: boolean;
  mark?: boolean;
  decorative?: boolean;
}) {
  return (
    <span
      className={muted ? "inline-flex items-center text-ink-3" : "inline-flex items-center text-ink"}
      /* No gap with nothing to space. `Math.max(6, …)` would otherwise leave
         six pixels of air before a word with nothing in front of it, which
         reads as a mark that failed to load. */
      style={{ gap: mark ? Math.max(6, Math.round(size * 0.38)) : undefined }}
    >
      {/*
        THE ORB, AT FULL COLOUR EVEN WHEN THE LINE IS MUTED.

        <p>`muted` used to pass `mono` to the lens, which drew it in
        `currentColor` — the footer sets this whole line to `--ink-3`, and a
        blue mark in a grey line is the loudest thing on the page. The orb
        cannot do that: recolouring the artwork is the one thing the identity
        rules forbid, and there is no monochrome version of a lit sphere that is
        still recognisably it.

        <p>So `muted` now only quietens the *type*, and the mark stays itself.
        Which is a real change in the footer — a small blue orb beside grey
        words where there was a grey mark beside grey words — and the honest
        trade: an 18px orb is quiet because it is small, not because it has been
        drained.

        <p>`title` because the shape of this is unchanged: the mark carries the
        accessible name and the word sits beside it, exactly as the lens did.
      */}
      {mark && (
        <ReverieAiMark
          size={Math.round(size * MARK)}
          /* No `title` when decorative: the mark's own wrapper then takes
             `aria-hidden` and the image an empty `alt`, which is what makes it
             a decoration rather than a second reading of the same word. */
          title={decorative ? undefined : "Reverie"}
        />
      )}
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
