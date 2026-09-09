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
 *
 * <h2>The ground it is read on</h2>
 *
 * <p>The same wash as Home, Library, a folder and a meeting — and it was the
 * one page in the shell without it, which is how it came to look like a
 * different application: near-black from the band to the composer, with the
 * whole of the middle empty on a thread nobody has started yet.
 *
 * <p>Pulled up by exactly the band height, as everywhere else, so the field is
 * continuous through the glass and the band's hairline is the only line there.
 * `relative` is what the wash is positioned against, and it renders before the
 * panel so ordinary paint order puts it underneath — see
 * components/v2/ambient-canvas.
 *
 * <p>34rem, Home's number rather than the landing's 60vmax. The thread scrolls
 * inside the panel rather than the page scrolling, so the wash stays where it
 * is put: it lifts the top of the conversation and is gone by the time the
 * reading measure begins.
 */

import { AmbientCanvas } from "@/components/v2/ambient-canvas";
import { WorkspaceAsk } from "@/components/chat/workspace-ask";

export default function AskPage() {
  return (
    <div className="relative h-[calc(100vh-var(--band))]">
      <AmbientCanvas height="34rem" top="calc(var(--band) * -1)" />
      <WorkspaceAsk surface="ask" variant="page" />
    </div>
  );
}
