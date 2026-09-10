"use client";

/**
 * The way out of the side pane, drawn inside the side pane.
 *
 * <h2>Why this is its own file</h2>
 *
 * <p>It used to be a button in the shell's action row above the page. That row
 * had nothing else left in it — `HeaderSlot` has no consumers — so the shell was
 * keeping a 60px strip alive for one control, and only while the pane was open.
 * Which meant pressing `Ask` on a meeting pushed the entire document down 60px
 * and closing the chat pulled it back up: the shell reserving height for
 * something that is not the document's, and a document that moves when a panel
 * opens beside it.
 *
 * <p>So it lives in the pane's own header now, at the far end of the tabs that
 * were already there. A component rather than markup inline in the meeting page
 * because that page is the only pane occupant today and should not be the only
 * place this exists: the next thing to fill the pane gets the same control, with
 * the same label, by rendering the same thing.
 *
 * <p>Not a toggle. It only ever renders on an open pane, and a control labelled
 * "Hide" that can show is a control that lies — see `closeSidePane`.
 *
 * <h2>NOTHING RENDERS THIS ANY MORE</h2>
 *
 * <p>The meeting pane was the only occupant, and its two header rows became
 * one: the tab row this sat at the end of is gone, and the way out is now the
 * `X` in `AskHeader` — the same control Home's pane has, so both panes are shut
 * the same way. A panel-collapse glyph is a fair icon for what it did and one
 * that only reads that way to somebody who already knows.
 *
 * <p>Left here rather than deleted, on the same terms as `ChatRail`: it is a
 * presentational component with its own passing tests and no data of its own,
 * and the redesign that replaced it is not yet approved. Deleting it in the
 * same change would mean reverting two things to reverse one.
 *
 * <p>It should go in the sweep once the panel is settled — this note, the
 * component, and components/pane-close.test.tsx, together. `closeSidePane` in
 * components/side-pane is what survives it and is what `AskHeader` calls.
 */

import * as React from "react";
import { PanelRightClose } from "lucide-react";
import { closeSidePane } from "@/components/side-pane";
import { cn } from "@/lib/utils";

export function PaneClose({
  /**
   * What is being hidden, in the label.
   *
   * <p>"Hide AI chat" rather than "Close side panel": the pane is a shell
   * concept and the thing on screen is a chat. A screen reader announcing the
   * layout primitive would be naming the implementation.
   */
  label = "Hide AI chat",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={closeSidePane}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-4",
        "transition-colors duration-press ease-soft hover:bg-surface-hover hover:text-ink",
        className,
      )}
    >
      <PanelRightClose className="h-4 w-4" />
    </button>
  );
}
