"use client";

/**
 * Coming back to a page the browser never threw away.
 *
 * <h2>The bug this exists for</h2>
 *
 * <p>`Continue with Google` sets a busy flag and then leaves the origin
 * entirely: `authenticateWithRedirect` is a navigation, and nothing after it
 * runs. That is fine as long as the page dies on the way out, because the flag
 * dies with it and a fresh load draws a fresh button.
 *
 * <p>Mobile browsers do not let it die. Android Chrome and iOS Safari put the
 * document in the back/forward cache — frozen, not unloaded, with the whole JS
 * heap intact — so pressing Back from Google's consent screen restores the same
 * React tree with the same state it was frozen in. The button comes back still
 * busy: spinner turning, `disabled`, and nothing left to clear it. The flow is
 * over and the only affordance for restarting it is the control that is stuck.
 *
 * <p>Desktop Chrome usually reloads instead of restoring here, which is exactly
 * why this reproduced on a phone and not on the machine it was written on.
 *
 * <h2>`pageshow`, and specifically `persisted`</h2>
 *
 * <p>`pageshow` fires on every show, including the ordinary first paint. The
 * `persisted` flag is the part that means something: true only when the
 * document came out of the back/forward cache, which is precisely the case
 * where stale state survived a journey that has already ended.
 *
 * <p>Deliberately NOT `visibilitychange`. That fires whenever the tab is
 * backgrounded and returned to, including while a redirect is genuinely in
 * flight or a form is genuinely submitting — and clearing a busy flag under a
 * request that is still running re-enables a control that would then fire
 * twice. `persisted` cannot be true unless the navigation away completed and
 * the browser has since come back, so it carries no such ambiguity.
 */

import * as React from "react";

/**
 * Run `onRestore` when this document is restored from the back/forward cache.
 *
 * <p>The callback is held in a ref, so an inline arrow at the call site does
 * not resubscribe the listener on every render.
 */
export function useBfcacheRestore(onRestore: () => void): void {
  const latest = React.useRef(onRestore);
  latest.current = onRestore;

  React.useEffect(() => {
    function shown(event: PageTransitionEvent) {
      if (event.persisted) latest.current();
    }
    window.addEventListener("pageshow", shown);
    return () => window.removeEventListener("pageshow", shown);
  }, []);
}
