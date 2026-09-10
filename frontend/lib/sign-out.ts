/**
 * Leaving — and why it cannot be left to Clerk.
 *
 * <h2>The bug this exists for</h2>
 *
 * <p>Deleting an account left somebody sitting on the Settings page of an
 * account that no longer existed. Nothing moved. Only a manual refresh got them
 * off it, and that refresh landed on the sign-in form carrying
 * `?redirect_url=/settings` — the middleware deciding where to send them,
 * because no code in the app had.
 *
 * <h2>Why nothing moved</h2>
 *
 * <p>`clerk.signOut` opens with, near enough:
 *
 * <pre>
 *   signOut = async (callbackOrOptions, options) =&gt; {
 *     if (!this.client || this.client.sessions.length === 0) return;
 *     ...
 *   }
 * </pre>
 *
 * <p>Destroying the identity takes the session with it, so by the time the
 * sign-out is asked for there are no sessions left and it returns on the first
 * line: no revoke, no rejection, and above all no navigation. The `redirectUrl`
 * it was handed is never read. There was nothing to catch and nothing to
 * notice, which is why this looked like a page that had simply frozen.
 *
 * <h2>So the leaving is ours</h2>
 *
 * <p>Handed a function, clerk-js awaits it <em>instead of</em> navigating — one
 * or the other, never both — so the callback is where the leaving goes, and it
 * still happens on the two paths the callback never reaches: the early return
 * above, and a revoke that fails. Somebody who asked to leave leaves, whatever
 * the network did.
 *
 * <p>Once, whichever of the three gets there first.
 */

/** `useAuth().signOut`, in its callback form. */
export type ClerkSignOut = (callback: () => void) => Promise<unknown>;

/**
 * Revoke the session if there is one to revoke, and leave either way.
 *
 * @param signOut  Clerk's own sign-out, called in its callback form
 * @param target   where to land
 * @param navigate how to get there. A document load rather than a route change
 *   — see the caller for why.
 */
export async function signOutAndLeave(
  signOut: ClerkSignOut,
  target: string,
  navigate: (to: string) => void,
): Promise<void> {
  let left = false;
  const leave = () => {
    if (left) return;
    left = true;
    navigate(target);
  };

  try {
    await signOut(leave);
  } catch {
    /* A revoke that failed is still somebody who asked to leave. */
  }
  leave();
}
