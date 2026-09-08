"use client";

/**
 * ASK REVERIE, with the whole window to itself.
 *
 * <h2>What is left of this file</h2>
 *
 * <p>Almost nothing, and that is the change. It used to draw the header, the
 * thread, the skeleton, the citations and the dock by hand — a second copy of a
 * chat that Home now opens in the side pane, near-identical and free to drift
 * from it. Both render `WorkspaceAsk`; this passes `variant="page"` and no
 * `onClose`, because a route has nothing to shut.
 *
 * <p>Its own open thread, though, keyed `workspace:ask`. Arriving here does not
 * resume what was being asked in the pane on Home, and asking here does not
 * appear there; both conversations are in the picker if you want them. See
 * `ChatSurface` in lib/use-workspace-chat.
 *
 * <h2>Why the route stays</h2>
 *
 * <p>Because the pane is 26rem and an answer built on eight passages from four
 * meetings is a document. `/ask` is that document at full width, with the
 * evidence beside it rather than under it — the same panel, measured wider.
 * It is in the band's places and the mobile tabs; what changed is that Home's
 * launcher no longer sends you here to ask one question about the list you were
 * looking at.
 *
 * <p>The height is the viewport minus the band, because the panel scrolls its
 * own thread and docks its own composer. A page that grew with the
 * conversation would put the composer below the fold.
 */

import { WorkspaceAsk } from "@/components/chat/workspace-ask";

export default function AskPage() {
  return (
    <div className="h-[calc(100vh-var(--band))]">
      <WorkspaceAsk surface="ask" variant="page" />
    </div>
  );
}
