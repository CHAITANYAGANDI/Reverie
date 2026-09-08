"use client";

/**
 * THE CONTROL THAT OPENS ASK ON HOME. One button, and the same one a meeting has.
 *
 * <h2>Why it is no longer a bar</h2>
 *
 * <p>It was a 40px field the full width of the list, reading "Ask Reverie about
 * your meetings…" — drawn that way because the approved reference drew a
 * search-shaped field there. It was never a field: it accepted no typing and
 * held no conversation, and a control shaped like an input that cannot be typed
 * into is worse than one that admits what it is.
 *
 * <p>What settled it is that the same action already had a button, in a
 * meeting's mode row, and the two are now the same panel — so there is no
 * reason for one of them to be forty pixels tall and the width of the page.
 * This is that button: `[mark] AI`, quiet, sized to its label, in the place the
 * bar used to occupy.
 *
 * <h2>Why it is a button and not a link</h2>
 *
 * <p>It was a `<Link>` to `/ask`, on the reasoning that there is one workspace
 * Ask and it has a page. That was right about there being one and wrong about
 * where it should appear: pressing this navigated away from Home, so asking a
 * question about your meetings meant losing the list of them. Ask is a thing
 * you do *while* looking at something, which is what the side pane is for and
 * how the same question is asked from inside a meeting.
 *
 * <p>The `/ask` route is untouched and still reachable from the band and the
 * mobile tabs, for anybody who wants the chat with the whole window to itself;
 * it is the same conversation archive either way — see
 * components/chat/workspace-ask.
 *
 * <p>Which costs the things a link had: it is no longer middle-clickable, has
 * no address on hover, and does nothing before hydration. Fair for a control
 * whose whole job is to reveal a panel in this document — the alternative is a
 * URL meaning "Home, but with the pane open", which is state in the address bar
 * that nothing else in the shell puts there.
 *
 * <h2>The two things it says</h2>
 *
 * <p>`AI`, because that is what the label says on the meeting page and one
 * name is better than two. And a hidden continuation, because "AI" alone is a
 * poor thing to hear announced: the accessible name is "AI — ask about your
 * conversations", which contains the visible text, so the label a person reads
 * and the name a screen reader speaks cannot disagree.
 *
 * <p>`aria-expanded` rather than `aria-haspopup="dialog"`. It reveals a region
 * that is a sibling of the page and does not trap focus or take a modal
 * backdrop, so it is a disclosure — and `aria-controls` names the shell's pane
 * so the relationship is stated rather than implied by position.
 */

import { BrandMark } from "@/components/v2/brand-mark";
import { Button } from "@/components/ui/button";
import { SIDE_PANE_ID, openSidePane, useSidePane } from "@/components/side-pane";

export function AskLauncher() {
  const pane = useSidePane();

  return (
    <Button
      variant="ghost"
      size="sm"
      /* `-ml-3` cancels the button's own `px-3`, so the mark sits on the
         column's left edge with the greeting above it rather than three
         pixels short of it. */
      className="-ml-3 gap-1.5"
      /* Not a toggle. Pressing it while the chat is open has to leave it open
         — the same rule as the meeting page's, and for the same reason: a
         control labelled with a question shutting the answer in your face is
         worse than one that does nothing. Closing is the pane's own ✕. */
      onClick={openSidePane}
      aria-expanded={pane.open}
      aria-controls={SIDE_PANE_ID}
    >
      <BrandMark size={16} /> AI
      <span className="sr-only"> — ask about your conversations</span>
    </Button>
  );
}
