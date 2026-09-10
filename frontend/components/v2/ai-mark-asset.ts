/*
 * THE REVERIE AI ORB, AS FACTS ABOUT A FILE.
 *
 * <h2>What replaced what</h2>
 *
 * <p>This module replaces `ai-mark-geometry.ts`, which drew the orb as vector
 * geometry — a sphere, two caps cut by a lens, a rim light and a bar table, in
 * three optical cuts. That drawing is gone, and the reason is worth writing
 * down because it was a real question with a measurable answer.
 *
 * <p>The drawing existed on the assumption that a 1254px render with a real bloom
 * cannot survive being scaled to a 24px button. So both were rasterised at
 * every production size — 30, 28, 26, 24, 20, 18, 16 — through a canvas at
 * exactly the size the product draws them, and magnified with nearest-neighbour
 * so the actual pixels were on screen rather than the browser's smoothing of a
 * screenshot. (The first attempt used `transform: scale(6)` on a small `<img>`
 * and proved nothing: Chrome rasterises an image at its *composited* size, so
 * that was the asset at 174px.)
 *
 * <p>The assumption was wrong. The real artwork keeps its sphere, its rim
 * light, both flowing bands and a legible waveform down to 24px, and stays
 * unmistakably itself at 18 and 16 where the waveform reduces to a bright core.
 * The vector was cleaner-edged and read flatter at every size — a blue disc
 * with a grey comb in it. So there is one implementation of this identity and
 * it is the approved artwork.
 *
 * <h2>Why the file is not the file the artwork arrived in</h2>
 *
 * <p>`public/brand/reverie-ai-orb.png` is the approved source and is never
 * edited. It also cannot be loaded directly: it is PNG colour-type 2, so it has
 * no alpha and carries a baked navy background; the orb occupies about 43% of
 * its 1254px frame with a separate reflection blob below it; and it is 1.2 MB.
 * An `<img width=30>` of it would render a 13px orb inside a 30px dark square.
 *
 * <p>So `scripts/extract-brand-assets.py` crops the approved pixels to the orb
 * and turns the baked background into transparency. It invents nothing — every
 * RGB value in the output comes from the source — and the composite over the
 * app's canvas is within 4/255 per channel of the original across the lit mark.
 *
 * <h2>Why these three constants are here rather than in the component</h2>
 *
 * <p>Because the component is `"use client"` and every export of a client
 * module is a client *reference* rather than a value: a server component that
 * imports one and calls it gets a 500. That has happened twice in this
 * codebase. `aiOrbBox` is a function, so it lives where a server component may
 * call it.
 */

/** The extracted orb. Derived from the approved source — see the note above. */
export const AI_ORB_SRC = "/brand/reverie-ai-orb-mark.webp";

/**
 * The asset's width as a multiple of the painted sphere inside it.
 *
 * <p>The crop is 648px square around a 540px sphere, so the outer 9% on each
 * side is the artwork's own bloom. Which is deliberately the same ratio the
 * vector mark used, so `size` still means "the sphere a reviewer measures on
 * screen" and not one call site had to change when the drawing became a file.
 */
export const AI_ORB_BLOOM = 1.2;

/** The element that holds a sphere of `size` px, including its bloom. */
export function aiOrbBox(size: number): number {
  return Math.round(size * AI_ORB_BLOOM);
}

/**
 * The intrinsic pixels of the extracted file.
 *
 * <p>256 square, which is 4x the largest size anything draws it at (the 56px
 * resting orb, in a 67px box) and so covers a 3x display with room over. Passed
 * to the `<img>` as `width`/`height` would be wrong — those have to be the
 * *layout* size or the browser reserves the wrong box — so this exists for the
 * one test that pins it and for anybody wondering whether the file is big
 * enough for a retina panel.
 */
export const AI_ORB_INTRINSIC = 256;
