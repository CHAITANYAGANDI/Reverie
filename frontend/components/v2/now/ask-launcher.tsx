"use client";

/**
 * ONE LINE UNDER THE GREETING, AND IT OPENS THE CHAT WHERE THE CHAT LIVES.
 *
 * <h2>Why it is a button now, and not a link</h2>
 *
 * <p>It was a `<Link>` to `/ask`, on the reasoning that there is one workspace
 * Ask and it has a page. That was right about there being one and wrong about
 * where it should appear: pressing this navigated away from Home, so asking a
 * question about your meetings meant losing the list of them, and coming back
 * meant a second navigation. Ask is a thing you do *while* looking at
 * something, which is exactly what the side pane is for and exactly how the
 * same question is asked from inside a meeting.
 *
 * <p>So this opens the pane, with Home still on the page beside it. The `/ask`
 * route is untouched and still reachable from the band and the mobile tabs, for
 * anybody who wants the chat with the whole window to itself; it is the same
 * conversation archive either way — see components/chat/workspace-ask.
 *
 * <p>Which costs the things a link had. It is no longer middle-clickable, has
 * no address on hover, and does nothing before hydration. Fair for a control
 * whose entire job is to reveal a panel in this document: the alternative is a
 * URL that means "Home, but with the pane open", which is state in the address
 * bar that nothing else in the shell puts there.
 *
 * <p>`aria-expanded` rather than `aria-haspopup="dialog"`. It reveals a region
 * that is a sibling of the page and does not trap focus or take a modal
 * backdrop, so it is a disclosure, not a dialog — and `aria-controls` names the
 * shell's pane so the relationship is stated rather than implied by position.
 *
 * <h2>What is unchanged</h2>
 *
 * <p>The shape. 40px, a 10px radius, a 1px inset edge and a 4% fill, spanning
 * the list column — it was 64 off the approved reference, which turned out to
 * be a ~1.2x capture, then 48, and it is the HEIGHT that came down rather than
 * the length. One glyph, on the left, and nothing on the right: no second
 * Reverie mark, which reads as a logo pasted twice, and no keyboard badge,
 * which would promise a shortcut that does not exist. The glyph is not the
 * search glyph — search returns a list and lives in the band; this returns a
 * sentence.
 */

import { Waypoints } from "lucide-react";
import { SIDE_PANE_ID, openSidePane, useSidePane } from "@/components/side-pane";

export function AskLauncher() {
  const pane = useSidePane();

  return (
    <button
      type="button"
      /* Not a toggle. Pressing it while the chat is open has to leave it open
         — the same rule as the meeting page's Ask, and for the same reason:
         a control labelled with a question shutting the answer in your face
         is worse than one that does nothing. Closing is the pane's own ✕. */
      onClick={openSidePane}
      aria-expanded={pane.open}
      aria-controls={SIDE_PANE_ID}
      className={
        "flex h-10 w-full items-center gap-2.5 rounded-[10px] bg-white/[0.04] px-3.5 text-left " +
        "shadow-[inset_0_0_0_1px_rgb(var(--line-strong))] " +
        "transition-colors duration-press ease-soft hover:bg-white/[0.06]"
      }
    >
      <Waypoints className="h-[18px] w-[18px] shrink-0 text-ink-4" aria-hidden />
      <span className="v2-page-lede flex-1 text-ink-4">Ask Reverie about your meetings…</span>
    </button>
  );
}
