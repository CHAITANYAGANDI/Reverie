/*
 * THE REVERIE MARK'S GEOMETRY — the lens, on a 32-unit grid.
 *
 * <h2>Why it is not in `brand-mark.tsx`</h2>
 *
 * <p>Because that file is `"use client"` — it needs `useId` for its gradients —
 * and every export of a client module is a client *reference* rather than a
 * value. `Lockup` is a server component and calls `markFill` to work out its
 * own spacing; importing it from the client module gave a 500 with
 * `markFill is not a function`, which is the framework telling the truth about
 * a boundary rather than a bug in either file.
 *
 * <p>So the drawing lives here, in a module with no React in it, and both
 * sides import it. It is also the half worth testing: a path string and a
 * ratio are checkable, where a gradient is not.
 *
 * <h2>Optical sizes, not just scale</h2>
 *
 * <p>The rule the seam mark was built on, and it matters more here because
 * there is more in the drawing. Nine bars on a 32-unit grid is a 1.95-unit
 * pitch, which at 16px is 1px of bar and 0.4px of gap: a grey smear. And the
 * artwork's proportion — 28 wide against 15.6 tall — leaves the lens filling
 * less than half of its square box, which is right beside a 42px word and far
 * too timid beside a 13px one.
 *
 * <p>So both change with the size. The bar count drops, the ribbon thickens,
 * and the lens grows taller against its width until it nearly fills the box at
 * 18px. The drawing changes so the impression does not, the way a typeface has
 * a caption cut.
 *
 *     >= 40px   nine bars, 1.8:1, the thinnest ribbon — the artwork's own cut
 *     24-39px   five bars, 1.6:1
 *     <  24px   three bars, 1.3:1, the thickest ribbon — the band, a row, a chip
 */

const TIP_L = 4;
const TIP_R = 30;
/** The chord sits just off centre, and that offset is the displacement. */
const TIP_Y = 15.2;

export interface Cut {
  /** y of the outer curve's peak. Lower is a taller lens. */
  outerApex: number;
  /** y of the inner curve's peak. Nearer the centre is a thicker ribbon. */
  innerApex: number;
  /** Half the waveform's profile, centre outward, as heights on the grid. */
  bars: number[];
  pitch: number;
  width: number;
}

export function cutFor(size: number): Cut {
  if (size >= 40) {
    return {
      outerApex: 8.2,
      innerApex: 11.2,
      bars: [12.4, 9.8, 7.4, 5.2, 3.4],
      pitch: 1.95,
      width: 1.2,
    };
  }
  if (size >= 24) {
    return { outerApex: 7, innerApex: 11.4, bars: [13, 8.8, 5.2], pitch: 3.3, width: 1.9 };
  }
  return { outerApex: 5.6, innerApex: 11, bars: [13.4, 7.4], pitch: 4.5, width: 2.6 };
}

/**
 * How much of the mark's square box the lens actually reaches, top to bottom.
 *
 * <p>Published because the box is square and the lens is not: at the large cut
 * the drawing stops about 26% of the way up from the bottom edge. Anything
 * stacking type under the mark has to subtract that, or the gap in the rendered
 * page is twice what the number in the file says. See `LockupStacked`.
 */
export function markFill(size: number): number {
  return (32 - cutFor(size).outerApex * 2) / 32;
}

/**
 * One crescent, drawn once.
 *
 * <p>Explicit cubics rather than elliptical arcs. Arcs were tried first, and
 * the four sweep flags across two crescents are one sign error away from a
 * filled disc with a slit in it — which is exactly what the first cut rendered.
 * A Bezier's control points say where the curve goes, and a symmetric pair of
 * them says it twice.
 *
 * <p>The other crescent is this path under `rotate(180 16 16)` — which is what
 * makes the two halves exactly each other rather than two hand-tuned shapes
 * that nearly agree, and is where the mark's rotational symmetry now lives. The
 * seam mark had the same symmetry and got it the same way.
 *
 * <p>The tips are sharp because both curves leave them almost horizontally —
 * the shoulder control reaches 6.6 along x and only a little off `TIP_Y` in y —
 * and then diverge. Tangents differing by a few degrees at a shared endpoint is
 * what a point is; two curves meeting at right angles would be a leaf.
 */
export function crescent({ outerApex, innerApex }: Cut): string {
  const mid = (TIP_L + TIP_R) / 2;
  const shoulder = 6.6;
  /* Half-width of the flat at the apex, so the peak is smooth rather than a
     corner: the two controls either side of it sit level with it. */
  const plateau = 4;
  return [
    `M${TIP_L} ${TIP_Y}`,
    `C${TIP_L + shoulder} ${TIP_Y - 2.6} ${mid - plateau} ${outerApex} ${mid} ${outerApex}`,
    `C${mid + plateau} ${outerApex} ${TIP_R - shoulder} ${TIP_Y - 2.6} ${TIP_R} ${TIP_Y}`,
    `C${TIP_R - shoulder} ${TIP_Y - 1.6} ${mid + plateau} ${innerApex} ${mid} ${innerApex}`,
    `C${mid - plateau} ${innerApex} ${TIP_L + shoulder} ${TIP_Y - 1.6} ${TIP_L} ${TIP_Y}`,
    "Z",
  ].join(" ");
}

/**
 * Where each waveform bar sits, centre outward in mirrored pairs.
 *
 * <p>A symmetric waveform reads as a level meter; an asymmetric one reads as
 * noise. So the profile is written once, in `Cut.bars`, and this mirrors it.
 */
export function barsOf(cut: Cut): { x: number; y: number; h: number; w: number }[] {
  return cut.bars.flatMap((h, i) =>
    (i === 0 ? [0] : [-i, i]).map((step) => ({
      x: 16 + step * cut.pitch - cut.width / 2,
      y: 16 - h / 2,
      h,
      w: cut.width,
    })),
  );
}
