"use client";

/**
 * The menu that appears when you select part of a transcript.
 *
 * Everything on it acts on the same selection, so it is one component rather
 * than controls scattered down the page: the alternative is a hover affordance
 * per line per action, which is seven icons on every utterance in a
 * two-thousand-line transcript.
 *
 * Positioning is fixed, not absolute. The transcript scrolls inside the page
 * and the menu is anchored to a selection rectangle read from the viewport, so
 * an absolutely-positioned menu would need the scroll offset of every ancestor
 * to agree. Fixed means the rectangle is the answer.
 */

import * as React from "react";
import {
  Eraser,
  Highlighter,
  Copy,
  ListPlus,
  Link2,
  UserRoundCog,
  FileText,
} from "lucide-react";
import { ReverieAiMark } from "@/components/v2/reverie-ai-mark";
import { cn } from "@/lib/utils";

export type SelectionAction =
  | "highlight"
  | "copy"
  | "ask"
  | "summarize"
  | "action-item"
  | "share"
  | "reassign";

interface Item {
  action: SelectionAction;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * THE ORB, AT A MENU ROW'S SIZE.
 *
 * <p>`Ask Reverie` here is the same invocation as the launcher on Home and the
 * control on a meeting's mode row, reached from a passage instead of from the
 * page — so it carries the same identity. It was a `Sparkles`.
 *
 * <p>A component rather than an entry in the table because the orb takes a
 * size and the table holds glyphs that take a class. It deliberately drops the
 * `className` the row passes it: that class is `h-4 w-4` and a muted grey,
 * neither of which applies to a mark that carries its own dimensions and its
 * own colour, and a CSS height on an `svg` would silently override the size and
 * collapse the sphere.
 *
 * <p>22px, up a step with the rest of them, and still the smallest the
 * approved artwork is drawn at anywhere. Rasterised at true device pixels it
 * carries the sphere, the rim light and a bright waveform core down to 20; by
 * 16 the waveform has gone and only the orb is left.
 *
 * <p>22 is a 26px element in a row whose text line is 20, so `-my-[3px]`
 * absorbs the six pixels that would otherwise make this one row taller than
 * the six around it.
 */
function AskGlyph() {
  return <ReverieAiMark size={22} className="-my-[3px]" />;
}

/**
 * Order is deliberate: the two that need no thought and no network round-trip
 * come first, the two that spend a model call sit together in the middle, and
 * the two that create something elsewhere in the app are last. Nothing here is
 * destructive, so nothing needs separating for safety.
 */
const ITEMS: Item[] = [
  { action: "highlight", label: "Highlight", icon: Highlighter },
  { action: "copy", label: "Copy", icon: Copy },
  /*
   * NO `Add note`. It was the third item, and it is withdrawn -- the whole
   * path, not just the row: `note` is gone from `SelectionAction`, so nothing
   * can ask for it and no handler has to pretend to serve it.
   *
   * <p>Notes already written are untouched. They still draw under the words
   * they are about and still carry their own delete control; withdrawing the
   * way in is not a reason to make somebody's own words unreachable.
   */
  { action: "ask", label: "Ask Reverie", icon: AskGlyph },
  { action: "summarize", label: "Summarize", icon: FileText },
  { action: "action-item", label: "Create action item", icon: ListPlus },
  { action: "share", label: "Copy link to moment", icon: Link2 },
  // Last, and on its own conceptually: everything above adds something
  // alongside the transcript, and this one corrects the transcript itself.
  // It is here rather than on the turn menu because the case it exists for is
  // a short reply the provider buried inside somebody else's turn -- fixing
  // that means naming words, not naming a turn.
  { action: "reassign", label: "Wrong speaker", icon: UserRoundCog },
];

export interface SelectionMenuProps {
  /** Viewport coordinates of the selection, from `Range.getBoundingClientRect()`. */
  anchor: { top: number; left: number; bottom: number } | null;
  onAction: (action: SelectionAction) => void;
  /** Hidden while a mark is being saved, so a double click cannot double-save. */
  busy?: boolean;
  /**
   * The selection already lands on a highlight.
   *
   * <p>Turns the first item into the way out of one. There was no way out:
   * highlighting was a one-way action, so selecting highlighted words offered
   * `Highlight` again -- which either did nothing visible or stacked a second
   * mark over the first. The undo for every other kind of mark is where the
   * mark is; a passage highlight is drawn as a tint on the words themselves,
   * so the only place it can be is here, on the words.
   */
  highlighted?: boolean;
}

/**
 * Marks the menu in the DOM.
 *
 * The page dismisses the menu on any mousedown outside it, and "outside" has to
 * be answered by asking where the press landed. Stopping the event was tried
 * and does not work: React attaches its listeners to the hydration container,
 * which under the App Router is `document` itself — the same node the page's
 * dismiss handler is on — and `stopPropagation` never stops a listener sharing
 * a node with the one that called it.
 */
export const SELECTION_MENU_ATTR = "data-selection-menu";

/**
 * Did this press land inside the menu?
 *
 * Used by whoever closes the menu on an outside click. Getting it wrong is not
 * a cosmetic bug: unmounting the menu on mousedown removes the button before
 * mouseup, and a button that is gone by mouseup is never clicked at all — the
 * menu still looks open and every action silently does nothing.
 */
export function isInsideSelectionMenu(target: EventTarget | null): boolean {
  const node = target as Node | null;
  const el =
    node && node.nodeType === Node.TEXT_NODE
      ? node.parentElement
      : (node as Element | null);
  return Boolean(el?.closest?.(`[${SELECTION_MENU_ATTR}]`));
}

/** Roughly the menu's own size, used only to keep it inside the viewport. */
const MENU_WIDTH = 210;
const MENU_HEIGHT = 300;
const GAP = 8;

export function SelectionMenu({
  anchor,
  onAction,
  busy,
  highlighted,
}: SelectionMenuProps) {
  if (!anchor) return null;

  // Flip above the selection when there is no room below, and never let the
  // menu run off the right edge — on a narrow window a selection near the edge
  // would otherwise put half the actions off-screen.
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  const viewportWidth = typeof window === "undefined" ? 1200 : window.innerWidth;
  const below = anchor.bottom + MENU_HEIGHT + GAP < viewportHeight;
  const top = below ? anchor.bottom + GAP : Math.max(GAP, anchor.top - MENU_HEIGHT - GAP);
  const left = Math.min(Math.max(GAP, anchor.left), viewportWidth - MENU_WIDTH - GAP);

  return (
    <div
      role="menu"
      aria-label="Selection actions"
      {...{ [SELECTION_MENU_ATTR]: "" }}
      style={{ top, left, width: MENU_WIDTH }}
      className={cn(
        "fixed z-50 overflow-hidden rounded-md border bg-popover p-1 shadow-md",
        busy && "pointer-events-none opacity-60",
      )}
      // Preventing the default stops focus moving, which is what would
      // otherwise drop the selection before the click lands. That is the whole
      // job here: keeping the menu open is not, because stopping propagation
      // cannot reach a dismiss handler on `document` (see SELECTION_MENU_ATTR),
      // so the page recognises the menu by attribute instead.
      onMouseDown={(e) => e.preventDefault()}
    >
      {ITEMS.map((item) => (
        <MenuItem
          key={item.action}
          item={item}
          /* The only item that reads its own state. See `highlighted`. */
          highlighted={item.action === "highlight" && Boolean(highlighted)}
          busy={busy}
          onAction={onAction}
        />
      ))}
    </div>
  );
}

/**
 * One row of the menu.
 *
 * <p>Its own component only because one of the eight reads state: `Highlight`
 * becomes `Remove highlight` over words that already carry one. Branching on
 * that inside the `map` would have put a conditional in every row to serve a
 * single case.
 */
function MenuItem({
  item: { action, label, icon: Icon },
  highlighted,
  busy,
  onAction,
}: {
  item: Item;
  /** This row is the highlight row, and the selection is already highlighted. */
  highlighted: boolean;
  busy?: boolean;
  onAction: (action: SelectionAction) => void;
}) {
  return (
    <button
      role="menuitem"
      disabled={busy}
      onClick={() => onAction(action)}
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
    >
      {/* An eraser rather than a struck-through highlighter: lucide has no
          "off" variant of this glyph, and the two shapes are hard to tell
          apart at 16px, which is exactly the size at which a destructive
          action must not be mistakable for the one that creates it. */}
      {highlighted ? (
        <Eraser className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : (
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      {highlighted ? "Remove highlight" : label}
    </button>
  );
}
