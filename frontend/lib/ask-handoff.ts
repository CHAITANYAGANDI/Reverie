"use client";

/**
 * A question on its way from Search to Ask Reverie.
 *
 * <h2>What this is for</h2>
 *
 * <p>Search is deterministic retrieval — it finds the meeting, the passage, the
 * decision. Ask is the synthesis layer over the same archive. The one thing
 * they need between them is a string: somebody types "diarization", finds four
 * passages, and wants the version of that question that reads the meetings and
 * answers with citations.
 *
 * <p>So this is the handoff, and it is deliberately nothing more than a handoff.
 * Search does not call the chat API, does not render an answer, and does not
 * know what a citation is. It puts the words in Ask's composer and gets out of
 * the way.
 *
 * <h2>Why a module store rather than a route parameter</h2>
 *
 * <p>Because the search box is global and Ask has two surfaces. On Home it is
 * the side pane — no navigation happens at all, so there is no URL to put a
 * parameter in. On `/ask` it is a page, and inventing `?q=` there would be a
 * convention nothing else in this shell uses: the app deliberately keeps
 * chat state out of the address bar (see `lib/active-chat` and the note in
 * `components/v2/now/ask-launcher` on why the launcher stopped being a link).
 *
 * <p>A module store is the pattern this codebase already uses for exactly this
 * shape of problem — `lib/search-overlay` for "open search with a query in it",
 * `lib/active-chat` for which thread a surface has open, `components/side-pane`
 * for whether the pane is showing. Same three parts: a value, a subscription,
 * and nothing persisted.
 *
 * <h2>It fills the box; it does not send</h2>
 *
 * <p>The composer already takes `compose={{ text, nonce }}`, which is how "ask
 * about this passage" works from a transcript selection. This reuses it, and
 * that means the question is typed for you and left for you to send.
 *
 * <p>Deliberate. What people type into a search box is a term rather than a
 * question — "diarization", not "why did we change the transcription provider" —
 * and an AI turn costs minutes from a metered allowance. Sending a bare term
 * the instant somebody presses Enter on a search row would spend those minutes
 * on a question nobody asked, phrased by a search box. The words arrive with
 * the caret after them, which is the moment somebody turns a term into a
 * question.
 */

import * as React from "react";

export interface AskHandoff {
  /** What to put in the composer. */
  text: string;
  /**
   * Which handoff this is.
   *
   * <p>The same question can be handed over twice — search "diarization", read
   * the answer, come back and do it again — and a store keyed on the text alone
   * would swallow the second attempt. `ChatComposer` keys its own effect on this
   * for the same reason.
   */
  nonce: number;
}

let handoff: AskHandoff | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function set(next: AskHandoff | null): void {
  handoff = next;
  for (const listener of listeners) listener();
}

/**
 * Hand a question to Ask.
 *
 * <p>The caller is responsible for making sure an Ask surface is on screen —
 * opening the side pane, or navigating to `/ask`. This only carries the words:
 * a store that also decided where the chat should appear would be a router.
 */
export function askReverie(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  set({ text: trimmed, nonce: Date.now() });
}

/**
 * Take the pending question, if there is one.
 *
 * <p>Cleared on read, which is what stops a question being typed into the
 * composer again every time somebody comes back to `/ask` a week later. The
 * value is already in the surface's own state by then.
 */
export function clearAskHandoff(): void {
  if (handoff !== null) set(null);
}

/** Forget everything. Exists so tests start from a clean sheet. */
export function resetAskHandoff(): void {
  handoff = null;
}

/** The question waiting to be asked, for the surface that will ask it. */
export function useAskHandoff(): AskHandoff | null {
  return React.useSyncExternalStore(
    subscribe,
    () => handoff,
    // The server has no pending question, so the first client pass must agree.
    () => null,
  );
}
