"use client";

import * as React from "react";
import { useSyncExternalStore } from "react";
import { useDispatch } from "react-redux";
import { api } from "@/lib/api";
import {
  cacheOwner,
  claimApiCache,
  currentSessionId,
  subscribeAuthReady,
} from "@/lib/auth-store";
import { claimProcessingOwner } from "@/lib/processing-jobs";
import { resetActiveChats } from "@/lib/active-chat";
import { resetPendingTurns } from "@/lib/pending-turn";

/**
 * The API cache belongs to exactly one sign-in, and this is where it changes
 * hands.
 *
 * <h2>The store survives the sign-in, and that is the problem</h2>
 *
 * <p><code>Providers</code> builds the Redux store once, into a
 * <code>useRef</code>, so it belongs to the React root. The App Router does not
 * remount the root layout on a client navigation, and both halves of a session
 * change are client navigations: Clerk's <code>signOut</code> navigates to
 * <code>afterSignOutUrl</code>, and <code>&lt;SignIn&gt;</code> navigates to
 * <code>fallbackRedirectUrl</code>. So the whole of
 *
 * <pre>  user A → sign out → user B signs in  </pre>
 *
 * <p>can happen in one store's lifetime. An RTK Query cache entry is keyed by
 * endpoint and serialised argument — <code>getMeetings({page: 0, size: 50})</code>
 * — and not one of them contains a user or a session, so B's first request is a
 * cache <em>hit</em> on A's.
 *
 * <h2>Why this is not just an effect any more</h2>
 *
 * <p>It was, and the comment above it in <code>Providers</code> claimed that
 * being declared before <code>{children}</code> made it run first. That is true
 * of one commit's effects and worthless as a guarantee: it is a property of
 * sibling order, which nobody reviews, and it says nothing about the commit in
 * which the gate opens.
 *
 * <p>And there was a worse case. <code>sessionId</code> reaches the tree
 * through React context, which updates during <em>render</em>; readiness
 * reaches <code>AuthGate</code> through the auth store, written from
 * ClerkBridge's <em>effect</em> — and a parent's effect runs after its
 * children's. So there is a commit in which the tree renders under session B
 * while the store still reports session A as ready: gate open, authenticated
 * subtree mounted, reading a cache that belongs to somebody else. No amount of
 * sibling ordering fixes that, because the reset and the mount are not in the
 * same commit.
 *
 * <p>So ownership is published into the same state machine as the token, and
 * <code>isAuthReady()</code> requires both. The gate cannot open until this has
 * run, whenever this happens to run — which is what makes it a barrier rather
 * than a race that usually goes the right way.
 *
 * <h2>Nothing is cleared on an ordinary start</h2>
 *
 * <p>An unclaimed cache (<code>cacheOwner() === null</code>) has no previous
 * tenant to protect anybody from, so the first session takes ownership without
 * a reset. That is every ordinary page load, and a reset there could only ever
 * disturb the queries it was supposed to be guarding.
 *
 * <h2>What counts as a change</h2>
 *
 * <p>The session id from the auth store — Clerk's, or the dev user id in dev
 * mode, which has no sessions but does have a tenant that can be switched.
 * <b>One</b> identity, read from the same place the gate reads, so the two
 * halves cannot disagree about which sign-in they are talking about. A token
 * refresh does not change it, and neither does a route change.
 */
export function SessionCacheGuard() {
  const dispatch = useDispatch();
  const sessionId = useSyncExternalStore(subscribeAuthReady, currentSessionId, () => null);

  React.useEffect(() => {
    // Signed out, or Clerk has not said yet. There is nothing to hand the
    // cache to, and emptying it now would only mean emptying it again later.
    if (sessionId === null) return;

    const previous = cacheOwner();
    if (previous === sessionId) return;

    /*
     * `resetApiState`, not `invalidateTags`. An invalidation marks entries
     * stale and leaves the bodies in the store, and a stale body is still
     * handed to a component while the refetch is in flight -- which, since the
     * resource-state work, is precisely the case that renders cached data
     * rather than a skeleton. Right for a refresh of your own data; wrong
     * across a change of tenant.
     */
    if (previous !== null) {
      dispatch(api.util.resetApiState());
      /*
       * The module stores, for the same reason and only in the same case.
       *
       * These live in plain module scope, so an ordinary sign-out -- which
       * navigates the document -- already destroys them, and clearing them on
       * an unclaimed first load would throw away a question somebody is
       * waiting on. `previous !== null` is exactly "the tenant changed inside
       * one document", which is the only way they can survive into a session
       * that did not create them.
       */
      resetActiveChats();
      resetPendingTurns();
    }

    /*
     * Watched jobs, which are a different problem with a different answer.
     *
     * `sessionStorage` outlives the document, so unlike the two above this
     * cannot be guarded by `previous !== null`: after a sign-out and a reload
     * the cache owner starts null again while the stored ids are still sitting
     * there. The store is handed the session instead and decides for itself
     * whether what it saved belongs to this one -- so a claim both restores
     * this session's jobs and refuses everybody else's, whether or not this
     * document ever saw the sign-in that wrote them.
     */
    claimProcessingOwner(sessionId);

    // Only now. The claim is what releases the gate, so publishing it before
    // the cache is actually empty is the bug this component exists to prevent.
    claimApiCache(sessionId);
  }, [sessionId, dispatch]);

  return null;
}
