"use client";

/**
 * THE ONE ASK HEADER, on every surface that asks.
 *
 * <p>The references draw it identically over Home and over a meeting:
 *
 *     [mark] Ask Reverie  [scope]                      ...        ✕
 *
 * <p>Which is a change of shape rather than of content. What was there was
 * `ChatHistory` alone — a conversation title that opened a picker, New chat,
 * maximise, and the close button pushed in beside them by whichever surface was
 * rendering it. Nothing said what the panel was, and nothing said what it was
 * reading; both are the first two questions somebody opening a chat has.
 *
 * <p>So the identity and the scope go on the left where they are read first,
 * and the archive, the maximise and the close stay on the right where they
 * were. `ChatHistory` is unchanged and passed in as `actions` — every one of
 * its behaviours (open a thread, rename, delete, new, maximise) is its own and
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
import { BrandMark } from "@/components/v2/brand-mark";
import { cn } from "@/lib/utils";

export function AskHeader({
  scope,
  actions,
  onClose,
  className,
}: {
  /** The scope chip: the workspace picker, or a meeting's static pill. */
  scope?: React.ReactNode;
  /** Real state and real controls only — the archive, maximise. */
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
      {/* The mark, at the size it takes in the band. Not a decoration: it is
          what says this panel is Reverie answering rather than a form on the
          page underneath. */}
      <span className="flex shrink-0 items-center gap-2 text-ink" aria-hidden>
        <BrandMark size={16} />
      </span>
      <h2 className="v2-page-sub shrink-0 font-headline text-ink">Ask Reverie</h2>

      {scope && <div className="min-w-0">{scope}</div>}

      {/*
        `min-w-0`, NOT `shrink-0`, and the difference was a bug worth the note.
        <p>It was `shrink-0`, which is the obvious thing to write for a row of
        buttons -- and this region also holds the conversation's title, which
        in a 26rem pane is the one thing here that has to give. With the region
        unable to shrink, a title like "Is the beta date still real?" pushed
        the row 55px past the pane's right edge and took the close button with
        it: the panel could not be shut at all. Measured at 1440, where the
        button landed at x=1451 in a 1440px window.
        <p>`ChatHistory` was already built to truncate -- `min-w-0 max-w-sm`
        and a `truncate` on the label -- and could not, because a chain of
        `min-w-0` is only as good as its weakest link and this was it. The
        close button carries its own `shrink-0` instead, which is the one thing
        in the row that must never be the thing that gives.
      */}
      <div className="ml-auto flex min-w-0 items-center gap-1">
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
