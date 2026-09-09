/*
 * THE HERO'S CLOCK — when each beat after the identity starts, in seconds.
 *
 * <h2>Why it is not in `hero-brand.tsx`</h2>
 *
 * <p>Because that file is `"use client"` — it needs `useReducedMotion` and `m`
 * components — and every export of a client module is a client *reference*
 * rather than a value. `app/page.tsx` is a server component and reads these
 * numbers to space the headline, the body and the buttons; importing them from
 * the client module gave a 500 with "Could not find the module …#HERO_BEATS#
 * headlineFirst in the React Client Manifest", which is the framework telling
 * the truth about a boundary rather than a bug in either file.
 *
 * <p>Same reason `mark-geometry` is separate from `brand-mark`. A module with
 * no React in it can be read from both sides.
 *
 * <h2>Why one clock and not four literals</h2>
 *
 * <p>The identity's own beats live in `hero-brand`, because nothing outside it
 * can start them. Everything after the identity is laid out by the page, so the
 * page needs to know when the identity finishes — and two files each guessing
 * that is how a sequence comes to have a gap in it.
 *
 * <p>The headline follows the tagline rather than the whole block: the tagline
 * is the last thing to arrive in the identity, and starting the claim a quarter
 * of a second after it is what makes the two read as two moments rather than as
 * one long fade.
 *
 * <p>They overlap. Nothing waits for the thing before it to finish, which is
 * what keeps the whole arrival inside about 1.5s rather than adding up to four
 * — and the links are in the DOM and clickable from the first frame either way,
 * because the animation is on opacity and transform only.
 */
export const HERO_BEATS = {
  headlineFirst: 1.05,
  headlineSecond: 1.16,
  body: 1.22,
  cta: 1.36,
} as const;
