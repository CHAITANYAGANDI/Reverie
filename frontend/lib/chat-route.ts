"use client";

/**
 * LEAVING A PAGE GIVES YOU A NEW CHAT. The rule, and the only place it lives.
 *
 * <h2>The rule</h2>
 *
 * <p>When somebody leaves a page and later comes back and opens Ask, the
 * default view is a new chat. What they were asking before is not gone — every
 * conversation is on the server and in the history picker — but a surface does
 * not reopen mid-exchange from a visit that ended.
 *
 * <p>It applies to all three surfaces identically: the pane on Home, the pane
 * on a meeting, and the `/ask` route.
 *
 * <h2>What it must not fire on</h2>
 *
 * <p>This is the whole reason the file exists. None of these is navigation:
 *
 * <ul>
 *   <li>closing the side pane, and opening it again</li>
 *   <li>maximising the pane over the page, and restoring it</li>
 *   <li>switching a meeting between Summary and Transcript</li>
 *   <li>opening a meeting's Outline tab, which unmounts the chat</li>
 *   <li>the chat presentation component unmounting for any other reason</li>
 * </ul>
 *
 * <p>The mechanism this replaced was `resetOnLeave` in lib/active-chat: a
 * cleanup on the chat component's unmount. That is an accurate implementation
 * of a different rule. It happened to look right on Home and `/ask` — their
 * panels unmount exactly when their routes do — and it was wrong on a meeting,
 * where the panel is a tab and unmounts every time the reader looks at the
 * outline. A rule about pages has to be enforced where pages change.
 *
 * <h2>How it decides</h2>
 *
 * <p>Not by watching for departures. Each store records the pathname a thread
 * was last spoken to on — `origins` in lib/active-chat, `path` in
 * lib/pending-turn — and on every route change this forgets whatever was
 * adopted somewhere the reader no longer is.
 *
 * <p><b>Today this is indistinguishable from "forget everything on a route
 * change",</b> and that is worth saying plainly rather than implying the origin
 * is doing more work than it is: exactly one chat scope lives on each page, so
 * every remembered thread belongs to the page being left. The origin is the
 * precise statement of the rule — forget what was adopted somewhere the reader
 * no longer is — and it is what keeps this correct if a page ever hosts two
 * scopes, or a scope ever outlives one page. It is not a bug fix over the
 * blunter version.
 *
 * <h3>The answer that lands after you have gone</h3>
 *
 * <p>A request is not aborted by leaving, so `send()` resolves and adopts the
 * conversation it was given whether or not anybody is still looking — after
 * this has already run. What keeps that from resurrecting the thread is that
 * the reset deletes it as the reader leaves, so the late write lands on a
 * surface with nothing on it and stamps its own origin: wherever the reader is
 * now. The next time they arrive at the page they asked on, that origin is not
 * this one and the thread is forgotten.
 *
 * <p>Note the one case this deliberately allows: if the answer lands while the
 * reader is back on the page they asked from, the thread stays and the answer
 * appears. It is a live answer to a question they asked, `announceAnswer` does
 * not fire because the path it was asked on is the path they are on, and
 * discarding it to satisfy the letter of the rule would throw away the thing
 * they were waiting for.
 *
 * <h2>Where it runs</h2>
 *
 * <p>`useChatRouteBoundary` in components/app-shell, which is the one component
 * that sees every route change in the application group and outlives all of
 * them. Not in a chat component: a chat component's lifetime is the thing this
 * exists not to depend on.
 */

import * as React from "react";
import { chatOrigins, forgetActiveChats } from "@/lib/active-chat";
import { forgetPendingTurns, pendingOrigins } from "@/lib/pending-turn";

/**
 * Forget every thread and question adopted somewhere other than here.
 *
 * @param pathname the route the reader is on now
 */
export function forgetChatsLeftBehind(pathname: string): void {
  forget((origin) => origin !== pathname);
}

/**
 * Forget all of them, wherever they came from.
 *
 * <p>For re-entering the application: see the hook below.
 */
export function forgetAllChats(): void {
  forget(() => true);
}

function forget(leftBehind: (origin: string) => boolean): void {
  const scopes = new Set<string>();
  // Both stores, because they can disagree for one network round trip — a
  // question is in flight before the conversation it belongs to exists. See
  // `path` in lib/pending-turn.
  for (const [scope, origin] of chatOrigins()) {
    if (leftBehind(origin)) scopes.add(scope);
  }
  for (const [scope, origin] of pendingOrigins()) {
    if (leftBehind(origin)) scopes.add(scope);
  }
  if (scopes.size === 0) return;
  forgetActiveChats(scopes);
  forgetPendingTurns(scopes);
}

/**
 * Apply the rule at the route boundary. One call, in the shell.
 *
 * @param pathname from `usePathname()`, so it excludes the query string —
 *   which is right: `?t=122` on a meeting is a deep link into the page you are
 *   already on, not a departure from it.
 */
export function useChatRouteBoundary(pathname: string): void {
  /*
   * Whether this is the shell's first run rather than a route change.
   *
   * <p>A ref rather than a piece of state because it must not cause a render,
   * and it survives the mount-unmount-mount that StrictMode does in
   * development — where both passes are harmless anyway, since nothing can
   * have been adopted before the application has mounted.
   */
  const entered = React.useRef(false);

  React.useEffect(() => {
    if (!entered.current) {
      entered.current = true;
      /*
       * The shell mounting means the application group was (re)entered, and
       * anything remembered belongs to a visit that has ended — whatever page
       * it was on. Home to the landing page and back is the case: the shell
       * unmounts outside the group, so no route change is observed while away,
       * and an origin comparison alone would find `/home` matching `/home` and
       * resume the thread.
       *
       * On a genuinely fresh load there is nothing to forget, so this costs a
       * walk over two empty maps.
       */
      forgetAllChats();
      return;
    }
    forgetChatsLeftBehind(pathname);
  }, [pathname]);
}
