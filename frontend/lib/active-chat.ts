"use client";

/**
 * Which thread each chat surface is currently on, and where it was adopted.
 *
 * ## The behaviour this exists to produce
 *
 * **Opening Ask gives you a new chat.** It used to resume whatever you last
 * said: asking the server for history without naming a thread returns the most
 * recent one, so every visit landed mid-conversation from days ago, and a clean
 * sheet was a button press you had to know to look for. Nothing here is
 * persisted, so a page load starts empty and every surface offers a fresh
 * thread.
 *
 * **And leaving a page gives you one too.** That is a route-boundary rule and
 * it is not implemented here — see lib/chat-route.ts, which is the only thing
 * that decides a thread has been left behind. This file's contribution is
 * `origins`: the path each thread was last spoken to on, recorded so that
 * something else can answer "was this adopted somewhere I no longer am?"
 *
 * <p>Recording the path rather than reacting to an unmount is the whole point.
 * A chat panel unmounts for half a dozen reasons that are not navigation — the
 * pane closes, the pane is maximised, somebody opens the Outline tab — and a
 * mechanism keyed on unmounting resets the conversation for all of them.
 *
 * **A thread belongs to one surface.** The pane Home opens and the full Ask
 * page are keyed separately (`workspace:home`, `workspace:ask`) even though
 * they read the same meetings through the same endpoints, because they are two
 * screens and a question asked on one has no business appearing on the other.
 * They briefly shared a key, from when Home's expand button navigated to /ask
 * and the two had to be one conversation; the pane maximises in place now.
 *
 * **And a thread does not outlive a navigation.** All three surfaces behave the
 * same way: leave the page, come back, open Ask, and you are on a new chat with
 * the previous conversation in the picker. One rule, one implementation, in
 * lib/chat-route.ts.
 *
 * ## Why it is not component state
 *
 * The panel beside the home list and the full AI Chat page must not each keep
 * their own idea of which thread is open — two `useState` calls in two trees
 * would drift, and only appear not to because both default to "the most recent
 * thread" and the server resolves that identically for each.
 *
 * ## Why it is not Redux
 *
 * The store is built by a factory with no default instance, and no test in the
 * app renders a `Provider`. Putting this in `uiSlice` would mean wrapping every
 * chat test in one to assert something that has nothing to do with Redux. This
 * is a single value shared between two components, which is what
 * `useSyncExternalStore` is for.
 *
 * A module variable also has exactly the lifetime wanted: it outlives a render
 * and dies on reload, and what it does in between is the caller's choice.
 */

import { useCallback, useSyncExternalStore } from "react";

/** Scope -> conversation id. `workspace:home`, `workspace:ask`, `meeting:<id>`. */
const threads = new Map<string, string>();
/**
 * Scope -> the pathname its thread was last spoken to on.
 *
 * <p>Kept beside the threads rather than inside them so that reading a thread
 * stays a map lookup returning a string. Only lib/chat-route.ts reads this.
 */
const origins = new Map<string, string>();
const listeners = new Set<() => void>();

/** The route this is happening on. `""` where there is no window. */
function here(): string {
  return typeof window === "undefined" ? "" : window.location.pathname;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** Read the thread a scope is on without subscribing. For event handlers. */
export function activeChat(scope: string): string | null {
  return threads.get(scope) ?? null;
}

/** Remember the thread a scope is on, or forget it when given null. */
export function setActiveChat(scope: string, conversationId: string | null): void {
  /*
   * The origin is refreshed before the no-op guard below, so that the field
   * means exactly what it says: where this thread was last spoken to.
   *
   * <p>Deliberately not load-bearing, and worth being precise about. The case
   * it looks like it exists for -- `send()` adopting the same conversation
   * twice, once before awaiting the answer and once from the response, with
   * the second call landing after the reader has navigated away -- is already
   * handled by the reset, which deletes the thread as they leave. That makes
   * the late call a change rather than a no-op, so it restamps the origin
   * whichever order these two statements are in. Mutating the order fails no
   * test in lib/chat-route.test.tsx, which is how that was established.
   *
   * <p>It stays because the alternative is an invariant that holds only while
   * the reset happens to delete before a late write can arrive. `chatOrigins`
   * is read by something that has to trust it.
   */
  if (conversationId) {
    origins.set(scope, here());
  } else {
    origins.delete(scope);
  }
  if (activeChat(scope) === conversationId) return;
  if (conversationId) {
    threads.set(scope, conversationId);
  } else {
    threads.delete(scope);
  }
  emit();
}

/**
 * Every scope holding a thread, and the route it was adopted on.
 *
 * <p>For lib/chat-route.ts and its tests. A copy, so nothing outside this file
 * can quietly mutate the store.
 */
export function chatOrigins(): ReadonlyMap<string, string> {
  return new Map(origins);
}

/**
 * Forget which thread these scopes were on. One notification, not one each.
 *
 * <p>Only the *active* thread goes. Every conversation is still on the server
 * and still in the history picker; what is dropped is which of them a surface
 * opens on.
 */
export function forgetActiveChats(scopes: Iterable<string>): void {
  let changed = false;
  for (const scope of scopes) {
    origins.delete(scope);
    if (threads.delete(scope)) changed = true;
  }
  if (changed) emit();
}

/** Discard every remembered thread. Exists so tests start from a clean sheet. */
export function resetActiveChats(): void {
  const had = threads.size > 0;
  origins.clear();
  if (!had) return;
  threads.clear();
  emit();
}

/**
 * The thread this scope is on, and a setter, as a `useState`-shaped pair.
 *
 * <p>Null until something is asked, which is what puts the starter prompts on
 * screen instead of an old conversation.
 *
 * <h2>There is deliberately no `resetOnLeave`</h2>
 *
 * <p>There was, and it was the wrong shape for the rule it was implementing.
 * The rule is about leaving a *page*; the option cleared the thread when the
 * *component* unmounted, and those are not the same event. A chat panel
 * unmounts when the side pane closes, when it is maximised and restored, and
 * every time somebody opens a meeting's Outline tab — none of which is
 * navigation, and all of which would have thrown away the conversation.
 *
 * <p>It survived on Home and `/ask` only because their panels happen to
 * unmount exactly when their routes do. That is a coincidence of where those
 * two components sit, not a property of the mechanism, and the meeting chat is
 * where the coincidence runs out.
 *
 * <p>So the option is gone rather than merely unused: leaving it in place is
 * leaving a plausible-looking way to reintroduce the bug on the one surface it
 * breaks. The rule lives at the route boundary now — see lib/chat-route.ts.
 */
export function useActiveChat(
  scope: string,
): [string | null, (conversationId: string | null) => void] {
  const conversationId = useSyncExternalStore(
    subscribe,
    () => activeChat(scope),
    // Server-rendered markup has no session, so it renders the empty chat —
    // the same thing the client shows on a first load, which is what keeps
    // the two from disagreeing on hydration.
    () => null,
  );
  const set = useCallback(
    (id: string | null) => setActiveChat(scope, id),
    [scope],
  );
  return [conversationId, set];
}
