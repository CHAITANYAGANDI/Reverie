"use client";

/**
 * THE ONE ASK HEADER, on every surface that asks.
 *
 * <p>One row, on every surface that asks:
 *
 *     [mark]  Which conversation ⌄              +    ⤢    ✕
 *
 * <p>Which is a change of shape rather than of content. What was there was
 * `ChatHistory` alone — a conversation title that opened a picker, New chat,
 * maximise, and the close button pushed in beside them by whichever surface was
 * rendering it. Nothing said what the panel was.
 *
 * <h2>The mark says it, and the words used to</h2>
 *
 * <p>It read `[mark] Ask Reverie` and the conversation title was pushed out to
 * the middle of the row. Two things were wrong with that in a 26rem rail: the
 * panel's name is the least useful thing in a header somebody opens
 * deliberately, and it was spending about eighty pixels to say what the mark
 * beside it already said. So the words go and the mark stays, with the
 * conversation — the one piece of state up here that changes — reading first.
 *
 * <p>`ChatHistory` is unchanged and passed in as `actions`: every one of its
 * behaviours (open a thread, rename, delete, new, maximise) is its own and
 * survives untouched.
 *
 * <h2>Scope is a slot, and nothing fills it yet</h2>
 *
 * <p>The references put a scope chip up here, beside the name. Both chats
 * already state their scope, at the bottom, inside the composer: the workspace
 * one as the context picker's chips, the meeting one as the composer's `scope`
 * label. So the slot exists and neither surface passes it — a second copy of
 * the scope in a 416px pane would be the same fact twice, and the copy up here
 * would be the one that cannot be changed.
 *
 * <p>Worth stating rather than deleting, because the reference's chip is a
 * dropdown and one of these could not be. The workspace chat can genuinely
 * narrow — meetings, one folder — but a meeting chat reads one transcript
 * through one endpoint and has no way to widen; the references show its chevron
 * opening onto "Everything · 68", a scope that endpoint cannot serve. Anything
 * put in this slot for the meeting chat must therefore be text, not a control.
 */

import * as React from "react";
import { X } from "lucide-react";
import { ReverieAiMark } from "@/components/v2/reverie-ai-mark";
import { cn } from "@/lib/utils";

export function AskHeader({
  scope,
  actions,
  onClose,
  className,
}: {
  /** The scope chip: the workspace picker, or a meeting's static pill. */
  scope?: React.ReactNode;
  /**
   * The row between the mark and the way out.
   *
   * <p>Real state and real controls only — the conversation, New chat,
   * maximise, and on a meeting the outline. Laid out as a flex row here, and
   * composed by the caller: what goes in it differs by surface, and a header
   * that knew which of its children was the conversation picker would be
   * deciding a layout it cannot see. Callers give `ChatHistory` a
   * `min-w-0 flex-1` wrapper so its own `ml-auto` reaches the end of the row.
   */
  actions?: React.ReactNode;
  /**
   * Shut the panel.
   *
   * <p>Absent in page mode, where there is nothing to shut: `/ask` is a
   * destination rather than a summoned surface.
   */
  onClose?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {/*
        THE ORB, AND IT IS THE PANEL'S NAME.

        <p>Not a decoration and not a control: with the words gone it is the
        whole of what says this panel is Reverie's assistant answering rather
        than a form on the page underneath. So it carries a title — the one
        place in the app where this mark is named out loud, because it is the
        only identity in a header that has no heading. Everywhere else it sits
        inside a labelled button and is `aria-hidden`, or the button would be
        read twice.

        <p>26px, up from a 16px `BrandMark`. Two things were wrong with that:
        it was the *product's* mark, which says "Reverie" where this has to say
        "Reverie's Ask", and at 16px a mark with a waveform in it is a smudge.
        26 is the largest that leaves the conversation picker beside it its
        full width in a 26rem rail — measured, not chosen.
      */}
      <span className="flex shrink-0 items-center">
        <ReverieAiMark size={26} title="Reverie AI" />
      </span>

      {scope && <div className="min-w-0">{scope}</div>}

      {/*
        `flex-1` AND `min-w-0`, and neither is spare.

        <p>`flex-1` because the conversation title now reads immediately after
        the mark rather than in the middle of the row. It was `ml-auto`, which
        pushed the whole group right and left an eighty-pixel hole where the
        panel's name had been.

        <p>`min-w-0` because this region holds that title, which in a 26rem
        pane is the one thing here that has to give -- and it was `shrink-0`,
        the obvious thing to write for a row of buttons. Unable to shrink, a
        title like "Is the beta date still real?" pushed the row 55px past the
        pane's right edge and took the close button with it: the panel could
        not be shut at all. Measured at 1440, where the button landed at x=1451
        in a 1440px window. `ChatHistory` was already built to truncate --
        `min-w-0 max-w-sm` and a `truncate` on the label -- and could not,
        because a chain of `min-w-0` is only as good as its weakest link.

        <p>The close button carries its own `shrink-0`, which is the one thing
        in the row that must never be the thing that gives.
      */}
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {actions}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Ask Reverie"
            title="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-4 transition-colors duration-press ease-soft hover:bg-surface-hover hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
