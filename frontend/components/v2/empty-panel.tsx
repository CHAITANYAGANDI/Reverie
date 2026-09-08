"use client";

/**
 * A PAGE WITH NOTHING ON IT, SAID ONCE AND SAID THE SAME WAY.
 *
 * <h2>Why this is shared</h2>
 *
 * <p>Two screens reach this state and they are a click apart: the folder list
 * with no folders in it, and a folder with nothing filed in it. Both were two
 * left-aligned paragraphs where the list would be, which reads as a page that
 * failed to load rather than a page with nothing to show — and the approved
 * designs centre both, with the glyph of the thing that is missing over them.
 *
 * <p>Written once because the two must not drift. They are the same idea at two
 * depths of the same feature, and a reader who creates a folder and opens it
 * immediately sees both within a few seconds of each other.
 *
 * <h2>What it is not</h2>
 *
 * <p>Not a card. The ring is a 1px hairline around a circle of nothing, which
 * is the one ornament these screens get: a filled disc would be the loudest
 * thing on a page whose whole point is that it is empty.
 *
 * <p>The actions slot is optional and often empty. A folder with nothing in it
 * has two things somebody can do about it and they belong under the sentence;
 * the folder LIST has one, and it is a permanent control in the margin, so
 * repeating it here would be two buttons with one label on one screen.
 */

import * as React from "react";
import type { LucideIcon } from "lucide-react";

export function EmptyPanel({
  icon: Icon,
  heading,
  children,
  actions,
}: {
  /** The glyph of the thing there is none of. */
  icon: LucideIcon;
  heading: string;
  /** One or two sentences. Name the thing where it can be named. */
  children: React.ReactNode;
  /** What to do about it, where the page has somewhere to put it. */
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center pt-16 text-center">
      <div
        aria-hidden
        className="flex h-28 w-28 items-center justify-center rounded-full border border-line"
      >
        <Icon className="h-10 w-10 text-ink-4" strokeWidth={1.25} />
      </div>

      {/* `h2`, because the page's own `h1` is its title. The copy is this
          heading's next sibling, which is what the suites read it off. */}
      <h2 className="v2-page-greet mt-7 font-headline text-ink">{heading}</h2>
      <p className="v2-page-lede mt-2.5 max-w-[46ch] text-ink-3">{children}</p>

      {actions && <div className="mt-7 flex items-center gap-3">{actions}</div>}
    </div>
  );
}
