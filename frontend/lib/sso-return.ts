/**
 * Where a Google round-trip is allowed to put somebody, and what to say when it
 * did not work.
 *
 * <p>Both halves of the decision the `/sso-callback` screen makes, as plain
 * functions — a page file may only export a component, and these are the part
 * worth testing without a browser or a Clerk key.
 */

import { HOME, SIGN_IN, SIGN_UP } from "@/lib/routes";

/** The routes Clerk is allowed to send somebody to from the callback. */
const KNOWN = [SIGN_IN, SIGN_UP];

/**
 * Where Clerk wants to go, expressed as a Reverie route.
 *
 * <h2>Why this exists</h2>
 *
 * <p>`transferable` defaults to true, so a Google identity with no Clerk user
 * turns a sign-in attempt into a sign-up — and Clerk finishes that by
 * navigating to a sign-up page. Left to itself it navigated to its own hosted
 * one on `accounts.dev`: a different domain wearing a different brand, reached
 * by pressing "Continue with Google" on Reverie's own form.
 *
 * <p>So every navigation the callback wants to make comes through here. An
 * absolute URL on somebody else's origin keeps its path and loses its host; a
 * path this app does not have becomes the sign-in form rather than a dead end,
 * because the one thing that must not happen on that screen is being left
 * somewhere with no way on.
 *
 * @param to     what Clerk asked for — a path, or a full URL on any origin
 * @param origin this app's own origin, where it is known
 */
export function inApp(to: string, origin?: string): string {
  let path = to;

  if (/^https?:\/\//i.test(to)) {
    try {
      const url = new URL(to);
      // Ours: keep it whole, query included — it may carry a return path.
      if (origin && url.origin === origin) return url.pathname + url.search;
      path = url.pathname;
    } catch {
      return SIGN_IN;
    }
  }

  // Not a path at all, or protocol-relative — which the browser reads as a
  // host, and is how an open redirect gets in.
  if (!path.startsWith("/") || path.startsWith("//")) return SIGN_IN;

  // Its own callback, or the bare top of a portal, is not a destination.
  if (path === "/" || path.startsWith("/sso-callback")) return HOME;

  // Anything under one of the two forms is that form. Clerk routes sub-steps
  // beneath them — `/sign-in/factor-one` — and this app draws one screen.
  for (const route of KNOWN) {
    if (path === route || path.startsWith(`${route}/`)) return route;
  }

  return path;
}

/**
 * Whether Google or Clerk said the attempt did not happen, and what it said.
 *
 * <p>OAuth puts `error` and `error_description` on the redirect, and cancelling
 * a Google consent screen is `access_denied`. Read rather than assumed: a page
 * that reports "you cancelled" over a refused scope or a provider outage is
 * telling somebody to retry a thing that will not work.
 *
 * @returns the sentence to show, or null when nothing went wrong
 */
export function refusalFrom(search: string): string | null {
  const params = new URLSearchParams(search);
  const code = params.get("error");
  if (!code) return null;

  if (code === "access_denied") return "You cancelled that sign-in.";

  const detail = params.get("error_description")?.trim();
  return detail || "Google did not complete that sign-in.";
}
