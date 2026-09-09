"use client";

/*
 * THE REVERIE MARK — Lens.
 *
 * Two crescents meeting at points, with a waveform between them. The crescents
 * are what was there before: one disc split across its equator and the halves
 * displaced, so the mark keeps its rotational symmetry and keeps saying "the
 * same subject recorded twice". What is new is that the halves are drawn as
 * ribbons rather than as solids, which opens the middle — and the middle now
 * holds the thing being recorded.
 *
 * OPTICAL SIZES, NOT JUST SCALE. The drawing changes with the rendered size —
 * bar count, ribbon thickness and the lens's own proportion — so the impression
 * holds where the geometry cannot. That table and the reasoning for it are in
 * components/v2/mark-geometry, which is also where the paths are computed: this
 * file is `"use client"` for `useId`, and a server component may not call a
 * function exported from a client module.
 *
 * The gradient is the identity and it follows the theme: every stop is a
 * `--brand-*` or `--ink` token, so retuning the accent retunes the mark. `mono`
 * is for the one place that needs a single inherited colour — see `Lockup`'s
 * muted variant, where the mark sits in a line of `--ink-3` type and a blue one
 * would be the loudest thing in a footer.
 *
 * The seam study, including the four directions that lost, is in
 * docs/ui-redesign/ (V2 review PDF, sections 05-06).
 */

import * as React from "react";

import { barsOf, crescent, cutFor } from "@/components/v2/mark-geometry";

export interface BrandMarkProps {
  /** Rendered px. Drives the optical size, not just the scale. */
  size?: number;
  className?: string;
  /** Give it an accessible name where it is the only thing identifying Reverie. */
  title?: string;
  /**
   * Draw it in one inherited colour instead of the brand gradient.
   *
   * <p>For a line of type that is already a colour — the footer lockup is
   * `--ink-3`, and a blue mark in it would be the loudest thing on the page.
   */
  mono?: boolean;
}

export function BrandMark({ size = 18, className, title, mono }: BrandMarkProps) {
  const cut = cutFor(size);
  const d = crescent(cut);
  /*
   * A gradient needs an id, and two marks on one page must not share one.
   *
   * <p>React 18's `useId` produces `:r0:`; the colons are stripped because the
   * value goes into a `url(#…)` fragment reference. This is the whole reason
   * this file is a client component — which costs nothing, since a server
   * component may render it as a child either way.
   */
  const id = React.useId().replace(/:/g, "");
  const top = mono ? "currentColor" : `url(#${id}a)`;
  const bottom = mono ? "currentColor" : `url(#${id}b)`;
  const bar = mono ? "currentColor" : `url(#${id}c)`;

  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {!mono && (
        <defs>
          {/* Deep at the tail, brand through the body, near-white at the head.
              The bottom crescent is the same ramp run the other way, which is
              what gives the pair its rotational symmetry in colour as well as
              in shape. */}
          <linearGradient id={`${id}a`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: "hsl(var(--brand-fill))" }} />
            <stop offset="0.42" style={{ stopColor: "hsl(var(--brand))" }} />
            <stop offset="0.72" style={{ stopColor: "hsl(var(--brand-hover))" }} />
            <stop offset="1" style={{ stopColor: "hsl(var(--ink))" }} />
          </linearGradient>
          <linearGradient id={`${id}b`} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "hsl(var(--brand-fill))" }} />
            <stop offset="0.42" style={{ stopColor: "hsl(var(--brand))" }} />
            <stop offset="0.72" style={{ stopColor: "hsl(var(--brand-hover))" }} />
            <stop offset="1" style={{ stopColor: "hsl(var(--ink))" }} />
          </linearGradient>
          {/* The bars fall from white to brand, top to bottom, so the waveform
              reads as lit from above and does not compete with the ribbon
              highlights on either side of it. */}
          <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "hsl(var(--ink))" }} />
            <stop offset="0.55" style={{ stopColor: "hsl(var(--brand-text))" }} />
            <stop offset="1" style={{ stopColor: "hsl(var(--brand))" }} />
          </linearGradient>
        </defs>
      )}

      <path d={d} fill={top} />
      <path d={d} fill={bottom} transform="rotate(180 16 16)" />

      {/*
        THE WAVEFORM, IN FRONT OF THE RIBBONS.

        <p>Drawn after them, which is the artwork's own order and is a decision
        rather than an accident: behind them the ribbons crop the bars flat and
        the rounded caps go — and the caps are what make this read as a level
        meter rather than as a picket fence. Both orders were rendered at 300px
        before this was settled.

        <p>Centre bar first and then outward in pairs, so the profile is written
        once and mirrored. A symmetric waveform reads as a meter; an asymmetric
        one reads as noise.
      */}
      {barsOf(cut).map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx={b.w / 2}
          fill={bar}
        />
      ))}
    </svg>
  );
}

/**
 * The mark performing its own meaning: the halves slide apart and come back
 * together. Reconciliation, which is what Reverie is doing while you wait.
 *
 * Under prefers-reduced-motion the animation is absent rather than slowed —
 * see the media query in globals.css — and whatever text sits beside it is
 * what says "working".
 *
 * <p>The ribbons move and the waveform does not. They are the two `path`
 * children; the `rect`s after them are the bars, and a level meter sliding
 * sideways with the ring would read as the whole mark wobbling.
 */
export function BrandMarkWorking({ size = 18, className }: BrandMarkProps) {
  return (
    <span className={className} data-working>
      <BrandMark
        size={size}
        className="[&>path:first-of-type]:animate-[seam-a_1.6s_var(--ease)_infinite] [&>path:last-of-type]:animate-[seam-b_1.6s_var(--ease)_infinite]"
      />
      <style>{`
        @keyframes seam-a { 0%,100% { transform: translateX(0) } 40% { transform: translateX(2.4px) } }
        @keyframes seam-b { 0%,100% { transform: translateX(0) } 40% { transform: translateX(-2.4px) } }
      `}</style>
    </span>
  );
}
