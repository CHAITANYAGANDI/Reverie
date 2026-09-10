"use client";

/**
 * One beat of the hero's arrival.
 *
 * <h2>Why this is not `Reveal`</h2>
 *
 * <p>`Reveal` fires on a viewport crossing — `whileInView`, once. That is right
 * for everything below the fold and wrong for the hero, which is already in the
 * viewport when the page loads: `whileInView` would fire every beat at the same
 * instant and the sequence would collapse into one fade.
 *
 * <p>So this animates on mount and is driven by a delay. Same curve, same
 * `data-reveal` contract, same reduced-motion rule — the only difference is
 * what starts it.
 *
 * <h2>The three rules it inherits</h2>
 *
 * <ol>
 *   <li><b>Reduced motion is absence.</b> A zero-duration transition, not a
 *       faster one — the element is simply there. Zeroing the clock rather
 *       than returning a plain tag is deliberate: the server cannot know the
 *       preference, so a branched tree hydrates wrongly and takes the whole
 *       root down with it. See the note in reveal.tsx.</li>
 *   <li><b>Never a reason the text is missing.</b> `data-reveal`, because
 *       framer renders `initial` into the server HTML's style attribute and the
 *       page's `<noscript>` block forces every `[data-reveal]` visible. A
 *       landing page whose headline depends on JavaScript is a landing page
 *       with no headline for a crawler.</li>
 *   <li><b>`m`, never `motion`.</b> Features come from `LandingMotion`, which
 *       runs `strict` — a full `motion` component would pull drag and layout
 *       projection onto the one route where a stranger pays for it before they
 *       have decided anything.</li>
 * </ol>
 *
 * <p>Nothing here blocks interaction. The links are in the DOM and clickable
 * from the first frame; the animation is on opacity and transform only, neither
 * of which takes a hit test away.
 */

import * as React from "react";
import { m, useReducedMotion } from "framer-motion";
import { LANDING_EASE } from "@/components/v2/landing/reveal";

export function HeroBeat({
  children,
  className,
  delay,
  /** 10px reads as arriving. Larger reads as flying in, which is not calm. */
  y = 10,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  /** Seconds. The hero's clock is `HERO_BEATS` in hero-brand. */
  delay: number;
  y?: number;
  as?: "div" | "p" | "span";
}) {
  const still = useReducedMotion();
  const Tag = m[as];

  return (
    <Tag
      data-reveal
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      /* Reduced motion zeroes the clock rather than changing the tree -- see
         the note on the same decision in components/v2/landing/reveal. A
         plain tag here would render `opacity:0` on the server and nothing on
         the client, and the whole root would fall back to client rendering. */
      transition={still ? { duration: 0 } : { duration: 0.66, ease: LANDING_EASE, delay }}
    >
      {children}
    </Tag>
  );
}
