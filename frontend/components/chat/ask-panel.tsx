"use client";

/**
 * THE ASK PANEL'S LAYOUT, and none of its data.
 *
 * <p>Three surfaces ask questions — the pane beside Home, the pane beside a
 * meeting, and the `/ask` page — and the references draw all three the same
 * way: an identity-and-scope header, the answer as a document, the evidence
 * beside it, and one docked composer.
 *
 * <p>This owns that arrangement and nothing else. It takes rendered nodes, so
 * the workspace chat and the meeting chat keep their own endpoints, their own
 * conversation archives and their own pending turns — which are different and
 * must stay different. A shared layout with a shared query would be a data bug
 * wearing a design fix. `ChatRail` made the same promise and this keeps it.
 *
 * <h2>Why the evidence is beside the answer only when there is room</h2>
 *
 *     wide (expanded pane, /ask page)      narrow (the 416px rail, a phone)
 *     ┌───────────────┬──────────┐         ┌──────────────────────┐
 *     │ answer        │ evidence │         │ answer               │
 *     │               │          │         │ ── what it is built  │
 *     │               │          │         │    on                │
 *     ├───────────────┴──────────┤         ├──────────────────────┤
 *     │ composer                 │         │ composer             │
 *     └──────────────────────────┘         └──────────────────────┘
 *
 * <p>The references are all drawn at a width the side pane only has when it is
 * maximised — the rail is 26rem, and 400px of evidence beside 680px of answer
 * does not fit in 416.
 *
 * <h2>And why it is measured rather than a breakpoint</h2>
 *
 * <p>Because the window's width does not answer the question. The same panel is
 * 416px inside a 1440px screen when it is a rail, the full window when it is
 * maximised, 390px on a phone, and the whole route on `/ask` — so a `lg:`
 * variant would be wrong in three of those four. What decides it is how wide THIS
 * element is, which is a container query; Tailwind v3 needs a plugin for those
 * and one measurement in a `ResizeObserver` is the same answer without the
 * dependency.
 *
 * <p>It reports narrow until it has measured, which is what the server renders
 * and the safe direction to be wrong in: a stacked answer in a wide panel looks
 * unfinished for one frame, where two 200px columns in a rail would be
 * unreadable.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Where this panel is drawn.
 *
 * <p>Only the gutters, in the end: the interesting difference — one column or
 * two — is measured rather than declared. `"pane"` is the side pane, tighter
 * because it is a rail against the window's edge; `"page"` is `/ask`, which
 * gets a document's margins. What actually distinguishes them in behaviour is
 * that a pane is passed an `onClose` and a route is not.
 */
export type AskVariant = "pane" | "page";

/**
 * How wide the panel has to be before the evidence goes beside the answer.
 *
 * <p>Measured, and it was 768 first — which is where the two tracks stop
 * *overflowing*, not where they stop being wrong. At a 768px panel the grid
 * resolves to `296px 400px`: the evidence takes its full 400 and the answer is
 * left with about thirty-four characters, so the footnotes are wider than the
 * thing they are footnotes to. Found by measuring the five QA widths rather
 * than by reading the declaration.
 *
 * <p>1024 gives the answer 552px — around sixty-three characters, within
 * sight of the 74 the whole V2 layout is built to protect — and the evidence
 * its 400. Below it they stack, which is the right answer for a 416px rail and
 * for a phone.
 */
export const TWO_COLUMN_AT = 1024;

/**
 * The document column, in page mode: 680 + 40 + 400.
 *
 * <p>Exactly the two tracks and the gap between them, so the pair is centred in
 * the window rather than centred in a wider box with the evidence floating
 * short of its right edge. `/ask` is a route with the whole window, and a
 * conversation set flush left in 1440px of it is a line of text the eye loses
 * its place in — see `--measure`.
 */
const COLUMN = "mx-auto w-full max-w-[70rem]";

const WideContext = React.createContext(false);

/** Whether the panel around this is wide enough for two columns. */
export function useAskWide(): boolean {
  return React.useContext(WideContext);
}

export function AskPanel({
  variant,
  header,
  children,
  dock,
  scrollRef,
  headerRule = true,
  className,
}: {
  variant: AskVariant;
  /** `AskHeader`, configured by whichever scope is rendering this. */
  header: React.ReactNode;
  /** The thread: turns, their evidence, and the pending one. */
  children: React.ReactNode;
  /** Suggestions and the composer. */
  dock: React.ReactNode;
  /**
   * Rule the header off from the thread.
   *
   * <p>True everywhere except the meeting pane, which has a row of its own
   * above this one — the Ask / Outline tabs and the pane's close
   * button — and that row already carries a full-width rule. Measured with
   * both: two hairlines 53px apart across a 416px rail, which is a panel with
   * two headers rather than one.
   */
  headerRule?: boolean;
  /**
   * The scrolling region, handed back so the caller can follow the newest turn.
   *
   * <p>This element and not a sentinel inside it: `scrollIntoView` scrolls
   * every scrollable ancestor including the document, which is how a chat panel
   * came to drag the whole page down as its history loaded.
   */
  scrollRef?: React.Ref<HTMLDivElement>;
  className?: string;
}) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [wide, setWide] = React.useState(false);

  React.useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      setWide(entry.contentRect.width >= TWO_COLUMN_AT);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <WideContext.Provider value={wide}>
      <div ref={rootRef} className={cn("flex h-full min-h-0 flex-col", className)}>
        {/* The header never scrolls. It carries the scope and the way out, and
            a panel whose close button leaves with the conversation is one
            somebody has to scroll back up to shut. */}
        <div
          data-ask-region="header"
          className={cn(
            "shrink-0",
            headerRule && "border-b border-line",
            variant === "pane" ? "px-4 py-2.5" : "px-4 py-3 lg:px-6",
          )}
        >
          {/* Aligned with the document rather than with the window's corners.
              The archive and New chat used to sit at the far edges of the
              screen, which was right when the thread underneath was 680px and
              they had nothing to line up with; the answer and its evidence are
              1120px now, so the controls belong over the end of that. */}
          <div className={cn(wide && COLUMN)}>{header}</div>
        </div>

        {/* `min-h-0` is what makes this scroll instead of growing: a flex child
            defaults to `min-height: auto`, so a long conversation pushes the
            composer off the bottom of the window. */}
        <div
          ref={scrollRef}
          data-ask-region="thread"
          className={cn(
            "min-h-0 flex-1 overflow-y-auto",
            variant === "pane" ? "px-4 py-5" : "px-4 py-7 lg:px-6",
          )}
        >
          <div className={cn(wide && COLUMN)}>{children}</div>
        </div>

        <div
          data-ask-region="dock"
          className={cn(
            "shrink-0",
            variant === "pane" ? "px-4 pb-3.5 pt-2.5" : "px-4 pb-5 pt-3 lg:px-6",
          )}
        >
          {/* The same column as the thread, always. They have drifted apart
              before, and a composer a few pixels wider than the answer above
              it gives the box a visible step that reads as a rendering
              fault. */}
          <div className={cn(wide && COLUMN)}>{dock}</div>
        </div>
      </div>
    </WideContext.Provider>
  );
}

/**
 * ONE TURN: the question, the answer, and what the answer is built on.
 *
 * <p>Two columns where the panel is wide enough, stacked where it is not. The
 * widths are the product's own document system — `680 + 40 + 400` is what a
 * transcript and a brief are set to, so an answer is read at the same line
 * length as the words it came from.
 *
 * <p>Stacked, the evidence stays with the answer it belongs to rather than
 * being collected at the bottom of the thread, which is why it is passed per
 * turn and not as a panel-level region.
 */
export function AskTurn({
  question,
  answer,
  evidence,
  actions,
}: {
  /** The user's turn. Quiet: the answer is what somebody came for. */
  question?: React.ReactNode;
  answer: React.ReactNode;
  /** `AskEvidence`, or nothing when the answer cited nothing. */
  evidence?: React.ReactNode;
  /** Copy, delete — the real ones only. */
  actions?: React.ReactNode;
}) {
  const wide = useAskWide();

  return (
    <article
      className={cn(
        "grid gap-x-10 gap-y-5",
        wide && "grid-cols-[minmax(0,42.5rem)_minmax(15rem,25rem)]",
      )}
    >
      <div className="min-w-0">
        {question}
        {answer}
        {actions}
      </div>
      {/* Second in the DOM as well as on the right, so a screen reader and a
          narrow panel both get the answer before its footnotes. */}
      {evidence && <div className="min-w-0">{evidence}</div>}
    </article>
  );
}
