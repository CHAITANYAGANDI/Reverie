"use client";

/**
 * ONE LINE UNDER THE GREETING, AND IT IS A DOOR RATHER THAN A CHAT.
 *
 * <h2>Why it is a link and not an input</h2>
 *
 * <p>The reference draws a full-width field here. A field that accepts typing
 * and then throws it away when you press Enter is worse than no field, and a
 * field that keeps its own thread is a second chat — which is exactly what this
 * page had, in a 400px pane, alongside a whole destination called Ask.
 *
 * <p>There is one workspace Ask. It has the history, the citations and the
 * composer, and it lives at `/ask`. So this looks like the reference's field
 * and behaves like what it actually is: the way to that page. It carries no
 * conversation state, starts no thread and duplicates no query.
 *
 * <p>Rendered as a `<Link>` rather than a button with a router push, so it is
 * middle-clickable, has an address on hover, and works before hydration —
 * which a control that is the main call to action on the default page should.
 *
 * <p>It has no width of its own and never had: it fills the column it is in,
 * which on Home is the ~890px list column. It used to be wrapped in a
 * `max-w-[var(--measure)]` because the masthead above it spanned both grid
 * tracks; the frame is two real columns now, so the wrapper is gone and this
 * control ends where the rows under it end.
 *
 * <p>The glyph is not the search glyph. Search returns a list and lives in the
 * band; this returns a sentence. Drawing both with a magnifier is what made
 * people try to search here.
 *
 * <p><b>One glyph, on the left, and nothing on the right.</b> No keyboard
 * badge: this is not a shortcut somebody presses from here, and a keycap on a
 * link that navigates is a promise about a key that does nothing. No second
 * mark at the far end either -- two Reverie glyphs in one control read as a
 * logo that has been pasted twice.
 */

import Link from "next/link";
import { Waypoints } from "lucide-react";
import { ASK } from "@/lib/routes";

export function AskLauncher() {
  return (
    <Link
      href={ASK}
      className={
        /* The one functional surface on this page. It is a control rather than
           content, which is the whole test for whether something gets a fill.
           <p>48px and a 10px radius. It was 64, taken off the approved
           reference before that reference turned out to be a ~1.2x capture;
           at 64 beside a 30px greeting it was the largest thing on the page
           by area. 48 is still clearly taller than a 79px row is tall, which
           is all it needs to read as the thing to reach for rather than as
           one more row. Still no glow and no drop shadow: a 1px inset edge
           and a 4% fill, which is what every other raised control in the
           product is made of. */
        "flex h-12 items-center gap-3 rounded-[10px] bg-white/[0.04] px-4 " +
        "shadow-[inset_0_0_0_1px_rgb(var(--line-strong))] " +
        "transition-colors duration-press ease-soft hover:bg-white/[0.06]"
      }
    >
      <Waypoints className="h-[18px] w-[18px] shrink-0 text-ink-4" aria-hidden />
      <span className="v2-home-lede flex-1 text-ink-4">Ask Reverie about your meetings…</span>
    </Link>
  );
}
