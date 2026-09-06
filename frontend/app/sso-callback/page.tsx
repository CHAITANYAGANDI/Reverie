"use client";

/**
 * The half-second between Google and Reverie.
 *
 * <p>`authenticateWithRedirect` sends somebody out to Google and Google sends
 * them back here with a token in the URL. Clerk's
 * `AuthenticateWithRedirectCallback` is what exchanges it for a session — it is
 * headless, renders nothing at all, and then navigates on. So this route is a
 * screen with a component doing invisible work underneath it.
 *
 * <p>Which is why it is worth drawing rather than leaving blank. This is the
 * first thing a new account sees after choosing Google, on the slowest step of
 * the flow, and an empty dark page for a second reads as something having gone
 * wrong.
 *
 * <p>It must be reachable while signed out — the whole point is that the
 * session does not exist yet — so it is listed as public in the middleware.
 *
 * <h2>Where it hands back to when the flow does not complete</h2>
 *
 * <p>Not every arrival here is a success. Cancelling at Google's consent screen
 * comes back here too, as does any OAuth error, and so does a sign-in that
 * needs a step this route cannot take. In each of those cases Clerk stops
 * exchanging and <em>navigates to the sign-in screen</em> — and it has to be
 * told where that is.
 *
 * <p>`signInFallbackRedirectUrl` is not that. It is where to go once a session
 * exists and the flow did not say where it was headed. The one that says where
 * the form lives is `signInUrl`, and without it Clerk falls back to its own
 * hosted Account Portal on `accounts.dev` — a different domain, wearing a
 * different brand, reached by pressing Cancel on a Reverie sign-in. Which is
 * precisely what it did.
 */

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { Lockup } from "@/components/v2/lockup";
import { HOME, SIGN_IN, SIGN_UP, WELCOME } from "@/lib/routes";

export default function SsoCallbackPage() {
  return (
    <div className="relative grid min-h-screen place-items-center px-6 py-16">
      {/* The same wash the sign-in screen carries, so the two seconds between
          Google and the app are not a different product. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_62%_at_50%_-12%,hsl(var(--brand)/0.15),transparent_62%),radial-gradient(80%_40%_at_82%_8%,hsl(var(--success)/0.05),transparent_70%)]"
      />

      <AuthenticateWithRedirectCallback
        /*
          Where the form is, for every arrival that is not a completed session:
          a cancelled consent screen, a refused scope, an account that needs a
          second factor. Without these two the answer is Clerk's hosted pages.
        */
        signInUrl={SIGN_IN}
        signUpUrl={SIGN_UP}
        /*
          Where to go if Clerk cannot tell which flow this was. A returning
          sign-in goes home; a brand-new account goes to the welcome screen.
          Both are fallbacks: the redirect the flow started with normally wins.
        */
        signInFallbackRedirectUrl={HOME}
        signUpFallbackRedirectUrl={WELCOME}
      />

      <div className="relative z-10 flex w-full max-w-[400px] flex-col items-start gap-5">
        <Lockup size={21} />
        <p className="v2-label" role="status">
          Signing you in
        </p>
      </div>
    </div>
  );
}
