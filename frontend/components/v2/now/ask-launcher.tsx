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
 * <p>The glyph is not the search glyph. Search returns a list and lives in the
 * band; this returns a sentence. Drawing both with a magnifier is what made
 * people try to search here.
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
           content, which is the whole test for whether something gets a fill. */
        "flex h-11 items-center gap-2.5 rounded-md bg-white/[0.04] px-3.5 " +
        "shadow-[inset_0_0_0_1px_rgb(var(--line-strong))] " +
        "transition-colors duration-press ease-soft hover:bg-white/[0.06]"
      }
    >
      <Waypoints className="h-4 w-4 shrink-0 text-ink-4" aria-hidden />
      <span className="flex-1 text-body text-ink-4">Ask Reverie about any of it</span>
    </Link>
  );
}
