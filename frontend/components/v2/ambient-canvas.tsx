/**
 * THE AMBIENT CANVAS — one wash, shared by every page that wants it.
 *
 * <h2>What it is</h2>
 *
 * <p>Two radial gradients over the near-black canvas: iris at 15% concentrated
 * above the upper centre, and green at 5% in the upper right, both fading to
 * nothing well before the fold. The base `--g-1` stays dominant everywhere —
 * this lifts the top of a page, it does not colour it. Held in `.v2-ambient`
 * (app/globals.css) rather than in an arbitrary Tailwind value, because the
 * declaration is 180 characters long and was already written out twice.
 *
 * <h2>Where it appears</h2>
 *
 * <p>The landing and the auth pages, which is where it started: a marketing
 * page with no photograph needs somewhere for the eye to land before the type
 * begins. And now Home, which is a deliberate product decision rather than a
 * drift — Home is the page somebody opens twenty times a day, it is mostly
 * space by design, and the approved reference gives that space the same
 * atmosphere. It supersedes the rule that said this belonged only to marketing.
 *
 * <p>It is never on a transcript, a summary or Library. Those are documents,
 * and a document is read on flat ground.
 *
 * <h2>How it is positioned</h2>
 *
 * <p>Absolute, so it belongs to the top of the document rather than to the
 * window: scrolling a long Home leaves it behind, which is what "the top of
 * the page is lifted" means. It needs a `relative` parent and it renders
 * before the content, so ordinary paint order puts it underneath — no
 * `z-index` anywhere, and nothing for a later stacking context to fight.
 *
 * <p>`aria-hidden` and `pointer-events-none`: it is not content and it must
 * never intercept a click meant for something behind it.
 */
export function AmbientCanvas({
  /**
   * How far down it reaches. `60vmax` is the landing's, where the hero is the
   * first screen; Home's masthead is shorter, so callers may pass less.
   */
  height = "60vmax",
  /**
   * Where the top of the wash sits relative to the parent.
   *
   * <p>Home passes a negative band height. Inside the shell a page begins
   * below the fixed band, so a wash anchored at the page's own top would start
   * at the band's lower hairline and read as a seam. Pulled up by exactly the
   * band, the field is continuous through the glass and the hairline is the
   * only line there.
   */
  top = "0px",
}: {
  height?: string;
  top?: string;
}) {
  return (
    <div
      aria-hidden
      className="v2-ambient pointer-events-none absolute inset-x-0"
      style={{ height, top }}
    />
  );
}
