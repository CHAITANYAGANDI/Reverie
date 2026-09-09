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
 * This is that button: `[mark] AI`, quiet, sized to its label.
 *
 * <p>It sits on the greeting's line, at the right-hand end of the list column,
 * rather than under the masthead where the bar was. Under it, it was a fourth
 * stacked line in a block that already had three and it pushed the
 * conversations down; opposite the greeting it is the one action facing the one
 * heading — the arrangement the margin already uses, where `+ Add` sits across
 * from `Action items` instead of beneath it.
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
 * <p>`Ask Reverie`, and a hidden continuation making the accessible name "Ask
 * Reverie about your conversations". The visible text is contained in the
 * spoken one, so the label a person reads and the name a screen reader speaks
 * cannot disagree.
 *
 * <p>It read `AI`, which was the right answer to a question that has since
 * changed. `AI` existed because the band's third place was called `Ask
 * Reverie` and two controls with one name — one of which navigates away and
 * one of which does not — is a distinction nobody should have to learn by
 * pressing. That place is now `Reverie AI`: a noun naming a destination,
 * beside a verb naming an action, which is the distinction stated rather than
 * avoided. And `AI` was never a good label. It names a technology where every
 * other control in this product names what it does.
 *
 * <h2>The mark is the AI identity, not the product's</h2>
 *
 * <p>`ReverieAiMark`, not `BrandMark`. They answer different questions —
 * "which product am I using?" belongs in the band's corner, and "where is
 * Reverie's assistant?" belongs here — and the orb is what the approved
 * artwork gives the second one. It was an 18px lens: the same mark as the
 * corner of the window, at a size where the waveform inside it was three grey
 * pixels.
 *
 * <p>`aria-expanded` rather than `aria-haspopup="dialog"`. It reveals a region
 * that is a sibling of the page and does not trap focus or take a modal
 * backdrop, so it is a disclosure — and `aria-controls` names the shell's pane
 * so the relationship is stated rather than implied by position.
 */

import { ReverieAiMark } from "@/components/v2/reverie-ai-mark";
import { Button } from "@/components/ui/button";
import { SIDE_PANE_ID, openSidePane, useSidePane } from "@/components/side-pane";

export function AskLauncher() {
  const pane = useSidePane();

  return (
    <Button
      variant="ghost"
      /*
       * `group` is what the orb's hover and press read. It holds no state and
       * runs no hook: the whole response is CSS keyed off this class, which is
       * also why it survives server rendering — see components/v2/reverie-ai-mark.
       *
       * <p>40px tall and 15px type, up from the button's default 36 and 14 —
       * which was itself up from `sm`'s 32 and 12, for the same reason each
       * time. This is the one control on the page and it sits beside a 26px
       * heading; anything smaller reads as a caption next to the greeting
       * rather than as the thing to press. 40 is also what a 30px orb needs
       * around it: at 36 the button's box cut into the sphere's glow.
       *
       * <p>`gap-2.5` keeps a round mark off the ascender of the A beside it.
       *
       * <p>No negative margin. `-ml-3` existed to cancel the button's own
       * padding so the mark lined up with the greeting's first letter;
       * right-aligned there is nothing to line up with on that side, and
       * pulling the box past the column edge would run its hover tint into the
       * rule that separates the list from the margin.
       */
      className="group h-10 gap-2.5 px-3.5"
      /* Not a toggle. Pressing it while the chat is open has to leave it open
         — the same rule as the meeting page's, and for the same reason: a
         control labelled with a question shutting the answer in your face is
         worse than one that does nothing. Closing is the pane's own ✕. */
      onClick={openSidePane}
      aria-expanded={pane.open}
      aria-controls={SIDE_PANE_ID}
    >
      {/* 30px of painted sphere. `active` while the panel is open, which is
          the same fact `aria-expanded` reports below — a slightly wider glow
          and a full-brightness waveform, and no loop: something that pulses
          for ever in the corner of a page is a notification, not a state. */}
      <ReverieAiMark size={30} interactive active={pane.open} />
      <span className="text-[0.9375rem]">Ask Reverie</span>
      <span className="sr-only"> about your conversations</span>
    </Button>
  );
}
