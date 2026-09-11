"use client";

/**
 * Which meetings are being processed right now, for the whole app.
 *
 * ## What this exists to fix
 *
 * Saving a recording pushed you to `/meetings/<id>`, and until the pipeline
 * finished that page was a single full-width card with a percentage on it.
 * Nothing else was rendered — no transcript, no chat, no player — because every
 * one of those is gated on `status === "READY"`. So a forty-minute recording
 * turned the app into a progress screen for eight minutes, and the only way out
 * was to navigate away and lose sight of the job entirely.
 *
 * Neither half of that is right. Processing is a *background* job: the ai-service
 * consumes from Kafka and never once looks at whether a browser is open, and
 * closing the tab has never stopped a meeting being transcribed. The interface
 * was the only thing implying otherwise.
 *
 * So the wait moves into the list. Saving lands on Home, where the meeting has
 * a row of its own carrying its stage and its bar, and the meeting page keeps
 * its own progress as a slim banner rather than as the whole page. See
 * components/processing-row.tsx and components/processing-card.tsx.
 *
 * A third copy floated in the bottom-right corner of every page for a while and
 * has been removed; what tracks a job now draws nothing at all. See
 * components/processing-dock.tsx for what is left and why it still exists.
 *
 * ## Why a module store and not Redux
 *
 * The same reasoning as lib/active-chat: a set of ids shared between the
 * watcher, the meeting page and three upload paths, with no reducer logic worth
 * the name.
 * `useSyncExternalStore` is what that is for.
 *
 * ## Why it is written to sessionStorage
 *
 * A reload used to lose the job, and with it the completion toast and the cache
 * invalidation that stops Home listing a finished meeting as still processing.
 * `sessionStorage` and not `localStorage`: this is "what this tab is watching",
 * and a job tracked in a tab you closed last Tuesday is noise.
 *
 * Nothing sensitive is stored. Meeting ids are opaque and are already in the
 * URL of the page that lists them.
 *
 * ## Why what is stored names its owner
 *
 * `sessionStorage` is scoped to the tab, and a tab outlives a sign-in. Signing
 * out navigates the document, which destroys every module store in this file —
 * but not `sessionStorage`, which is the one thing that survives precisely
 * because it was built to. So the sequence
 *
 * <pre>  A tracks a meeting → A signs out → B signs in, same tab  </pre>
 *
 * used to end with B's browser polling A's meeting every five seconds. The
 * server refuses it, so no content crossed; what crossed was the *claim* that
 * B has a job running, and a request loop nothing would ever stop.
 *
 * It cannot be fixed by clearing on sign-out alone — a tab closed mid-job, or a
 * crash, never reaches that code — nor by asking the in-memory cache owner,
 * which after a document reload starts out null while the stored entry is still
 * there. The stored value has to be able to answer "whose is this?" on its own,
 * so it carries the session that wrote it and is adopted only by that session.
 * See `claimProcessingOwner`.
 *
 * ## The store is not the source of truth
 *
 * It holds ids, not statuses. Whether a meeting is still processing is decided
 * by the server, every time, through the same `useGetMeetingQuery` the rest of
 * the app uses — so a job that finished while the tab was closed resolves on the
 * first poll and drops out. An id in here means "watch this", never "this is
 * unfinished".
 */

import { useCallback, useSyncExternalStore } from "react";

const KEY = "reverie:processing";

let ids: string[] = [];
const listeners = new Set<() => void>();

/**
 * Which sign-in these ids belong to, or null before anybody has claimed them.
 *
 * <p>Null is not "everyone" — it is "nobody yet", and it is deliberately
 * unadoptable: a stored entry written while unclaimed names `null` as its owner
 * and no session id ever equals that. Ids tracked before a claim still work in
 * memory for the life of the document; they simply cannot be inherited.
 */
let owner: string | null = null;

/** The persisted shape. The owner is the half that makes it safe to read back. */
interface Stored {
  owner: string | null;
  ids: string[];
}

/**
 * The array handed to `useSyncExternalStore`, rebuilt only when it changes.
 *
 * Required, not a micro-optimisation: the hook compares snapshots with `Object.is`
 * and re-renders whenever they differ, so returning a fresh array from
 * `getSnapshot` is an infinite render loop rather than a wasted render.
 */
let snapshot: readonly string[] = [];

function emit(): void {
  snapshot = [...ids];
  try {
    // Best effort. Private-mode Safari throws on write, and a tracking
    // convenience must never be why a save fails.
    const stored: Stored = { owner, ids };
    window.sessionStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    /* not being able to remember across a reload is survivable */
  }
  for (const listener of listeners) listener();
}

/**
 * Whatever is in storage, if it is the shape this version writes.
 *
 * <p>An array is what the previous version wrote, and it is dropped rather than
 * migrated: it names no owner, so there is no way to tell whose it was, and
 * "assume it belongs to whoever is here now" is the bug. The cost is that a
 * tab already mid-job when this ships stops watching it — one poll cycle of
 * inconvenience against restoring a stranger's job.
 */
function read(): Stored | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const candidate = parsed as Partial<Stored>;
    if (!Array.isArray(candidate.ids)) return null;
    return {
      owner: typeof candidate.owner === "string" ? candidate.owner : null,
      ids: candidate.ids.filter((v): v is string => typeof v === "string" && v.length > 0),
    };
  } catch {
    // A corrupt entry is not worth a crash on a cold start; watching nothing
    // is exactly what happens today without this file.
    return null;
  }
}

let loaded = false;

/**
 * Nothing is read back until somebody proves who they are.
 *
 * <p>This used to restore the stored ids. It no longer restores anything —
 * {@link claimProcessingOwner} is the only door, and it is the only place that
 * can compare the stored owner against the current session. What is left here
 * is the lazy flag, because this file is imported by components that render on
 * the server during the initial pass, where `sessionStorage` does not exist.
 */
function load(): void {
  if (loaded) return;
  loaded = true;
}

/**
 * Hand this tab's watched jobs to a session, and read back only that session's.
 *
 * <p>Called from the one place that already decides cache ownership, so a
 * sign-in cannot open the app under one session while this store still holds
 * another's. Idempotent: the same session claiming twice is the ordinary case
 * (re-render, token refresh) and must not discard live jobs.
 *
 * @param sessionId the sign-in now in charge, never null — an unauthenticated
 *     tab has nothing to claim and nothing it may read back
 */
export function claimProcessingOwner(sessionId: string): void {
  loaded = true;
  if (owner === sessionId) return;

  const stored = read();
  owner = sessionId;
  // Adopted only on an exact match. A different owner, a null owner, a legacy
  // array or nothing at all all mean the same thing: not ours, start empty.
  ids = stored && stored.owner === sessionId ? [...stored.ids] : [];
  emit();
}

function subscribe(listener: () => void): () => void {
  load();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Start watching a meeting. Idempotent — the same id twice is one job. */
export function trackProcessing(meetingId: string): void {
  if (!meetingId) return;
  load();
  if (ids.includes(meetingId)) return;
  ids = [...ids, meetingId];
  emit();
}

/** Stop watching. Called when the meeting reaches a terminal state. */
export function untrackProcessing(meetingId: string): void {
  load();
  if (!ids.includes(meetingId)) return;
  ids = ids.filter((id) => id !== meetingId);
  emit();
}

/** Everything being watched, without subscribing. For event handlers. */
export function processingJobs(): readonly string[] {
  load();
  return snapshot;
}

/**
 * Exists so tests start from a clean sheet.
 *
 * <p>Clears the stored copy as well as the in-memory one, and leaves the store
 * marked as loaded. Both matter: `emit` writes through to `sessionStorage`, so
 * a reset that only emptied the array would be undone by the next lazy load,
 * and one test's meeting would still be watched in the next.
 *
 * <p>It is therefore not a way to simulate a page load. Use `vi.resetModules()`
 * and re-import for that, which is what actually happens on one.
 */
export function resetProcessingJobs(): void {
  loaded = true;
  owner = null;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing stored is the state being asked for anyway */
  }
  if (ids.length === 0) return;
  ids = [];
  emit();
}

/** The meetings this tab is watching, newest last. */
export function useProcessingJobs(): readonly string[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return snapshot;
    },
    // Nothing is tracked during server rendering, and the client's first paint
    // has to agree with it or hydration warns. The store loads on subscribe,
    // which happens after.
    () => EMPTY,
  );
}

const EMPTY: readonly string[] = [];

/** Whether one particular meeting is being watched by this tab. */
export function useIsTracked(meetingId: string): boolean {
  const tracked = useProcessingJobs();
  return tracked.includes(meetingId);
}

/** `untrack`, bound to one id, stable across renders. */
export function useUntrack(meetingId: string): () => void {
  return useCallback(() => untrackProcessing(meetingId), [meetingId]);
}
