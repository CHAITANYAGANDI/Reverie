import { describe, it, expect } from "vitest";
import { barsOf, crescent, cutFor, markFill } from "@/components/v2/mark-geometry";

/**
 * The mark's drawing, as numbers.
 *
 * <h2>Why this is worth asserting</h2>
 *
 * <p>Because the mark is the one graphic in the product that appears at four
 * sizes on every screen, and because the thing that went wrong while it was
 * being drawn was not a colour or a margin — it was geometry. The first cut
 * used elliptical arcs and one wrong sweep flag rendered a filled disc with a
 * slit in it, which looked deliberate enough to nearly ship.
 *
 * <p>What is checked here is the part that has a right answer: the optical cuts
 * exist and differ, the waveform is symmetric, and the path closes where it
 * started so the two ribbons meet at points. The gradient and the draw order
 * are judgement and were settled by rendering at 300px, which no assertion
 * would have helped with.
 */
describe("the optical cuts", () => {
  it("gives the small sizes fewer bars, because the pitch is sub-pixel", () => {
    /*
     * Nine bars on a 32-unit grid is a 1.95-unit pitch: at 16px that is 1px of
     * bar and 0.4px of gap, which renders as a grey smear rather than as a
     * waveform. The count drops with the size and the bars get wider.
     */
    expect(barsOf(cutFor(240))).toHaveLength(9);
    expect(barsOf(cutFor(42))).toHaveLength(5);
    expect(barsOf(cutFor(18))).toHaveLength(3);

    expect(cutFor(18).width).toBeGreaterThan(cutFor(64).width);
  });

  it("thickens the ribbon as the mark gets smaller", () => {
    // `innerApex` nearer the centre line is a fatter crescent. A 1.6px ribbon
    // at 18px is not there on a 1x display.
    expect(cutFor(18).innerApex).toBeLessThan(cutFor(64).innerApex);
  });

  it("fills more of the box as the mark gets smaller", () => {
    /*
     * The artwork is 28 wide against 15.6 tall, so at the large cut the lens
     * uses under half of its square box — right beside a 42px word, and far
     * too timid beside a 13px one. The small cuts are squarer.
     */
    // 128 rather than 64: the display cut's boundary moved to 96. See the
    // note in the test below for what showed that it had to.
    expect(markFill(128)).toBeCloseTo(0.4875, 3);
    expect(markFill(42)).toBeGreaterThan(markFill(128));
    expect(markFill(18)).toBeGreaterThan(markFill(42));
    // And never taller than its box, whatever the cut.
    for (const size of [18, 32, 64, 128]) {
      expect(markFill(size)).toBeLessThan(1);
    }
  });

  it("chooses a cut by rendered size and not by scale", () => {
    /*
     * The boundaries are the documented ones — and the first one MOVED, from 40
     * to 96, which is worth stating rather than quietly editing.
     *
     * <p>It was never exercised at 40. The only caller of the nine-bar cut was
     * the landing hero at 264px, where it is the artwork exactly. When the band
     * and the lockup grew to a 42px lens they crossed the old line and took a
     * cut meant for a display size: 3px bars on a 5px pitch against a 1.9px
     * ribbon, which reads as a cluster of vertical bars rather than as a lens.
     * Seen by magnifying the running band, not by reading the table.
     */
    // A mark asked for at 96 is the
    // artwork's own drawing; at 39 it is the five-bar cut.
    expect(barsOf(cutFor(96))).toHaveLength(9);
    expect(barsOf(cutFor(95))).toHaveLength(5);
    // The two sizes the product actually draws either side of it.
    expect(barsOf(cutFor(264))).toHaveLength(9);
    expect(barsOf(cutFor(42))).toHaveLength(5);
    expect(barsOf(cutFor(24))).toHaveLength(5);
    expect(barsOf(cutFor(23))).toHaveLength(3);
  });
});

describe("the waveform", () => {
  it("is symmetric about the centre, which is what makes it a meter", () => {
    // An asymmetric comb reads as noise. The profile is written once, centre
    // outward, and mirrored — so this is really asserting the mirroring.
    const bars = barsOf(cutFor(64));
    const centres = bars.map((b) => b.x + b.w / 2).sort((a, z) => a - z);
    for (let i = 0; i < centres.length; i += 1) {
      expect(centres[i] + centres[centres.length - 1 - i]).toBeCloseTo(32, 5);
    }
  });

  it("puts its tallest bar in the middle", () => {
    const bars = barsOf(cutFor(64));
    const tallest = bars.reduce((a, b) => (b.h > a.h ? b : a));
    expect(tallest.x + tallest.w / 2).toBeCloseTo(16, 5);
  });

  it("centres every bar on the mark's own centre line", () => {
    // Vertically centred, so the meter reads as growing both ways from the
    // axis rather than sitting on a floor.
    for (const b of barsOf(cutFor(64))) {
      expect(b.y + b.h / 2).toBeCloseTo(16, 5);
    }
  });

  it("stays inside the lens it sits in", () => {
    // The bars are drawn in front of the ribbons and may cross them, which is
    // the artwork's own order — but a bar taller than the whole lens would
    // stick out past the silhouette and read as a rendering fault.
    for (const size of [18, 32, 64]) {
      const cut = cutFor(size);
      const lens = 32 - cut.outerApex * 2;
      for (const b of barsOf(cut)) {
        expect(b.h, `${size}px`).toBeLessThanOrEqual(lens);
      }
    }
  });
});

describe("the crescent path", () => {
  it("closes where it started, so the two ribbons meet at points", () => {
    /*
     * The tips are where the top crescent's path begins and ends, and the
     * bottom one is this path rotated 180°. If the path did not close on its
     * own start the tips would be blunt and the two halves would cross rather
     * than touch.
     */
    const d = crescent(cutFor(64));
    expect(d.startsWith("M4 15.2")).toBe(true);
    expect(d.endsWith("4 15.2 Z")).toBe(true);
  });

  it("is two curves out and two back, and nothing else", () => {
    // Four cubics: over the top through the apex, and back along the inside.
    // A fifth would mean somebody added a corner.
    expect(crescent(cutFor(64)).match(/C/g)).toHaveLength(4);
  });

  it("draws a different path for every cut", () => {
    const paths = new Set([18, 42, 128].map((s) => crescent(cutFor(s))));
    expect(paths.size).toBe(3);
  });
});
