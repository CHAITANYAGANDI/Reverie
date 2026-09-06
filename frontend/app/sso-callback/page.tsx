"use client";

/**
 * The half-second between Google and Reverie — and every way it can go wrong.
 *
 * <p>`authenticateWithRedirect` sends somebody out to Google and Google sends
 * them back here. What happens next is an exchange with no UI of its own, so
 * this route is a screen with invisible work underneath it. Worth drawing
 * rather than leaving blank: it is the first thing a new account sees, on the
 * slowest step of the flow, and an empty dark page for a second reads as
 * something having gone wrong.
 *
 * <p>It must be reachable while signed out — the whole point is that the
 * session does not exist yet — so it is listed as public in the middleware.
 *
 * <h2>Why this drives the callback rather than mounting Clerk's component</h2>
 *
 * <p>It was `<AuthenticateWithRedirectCallback />`, which does the exchange and
 * then navigates wherever it decides. Two of those decisions were wrong here
 * and neither could be corrected from the outside:
 *
 * <ul>
 *   <li><b>A cancelled sign-in stranded people.</b> Press Cancel on Google's
 *       consent screen and the browser comes back here; the exchange has
 *       nothing to exchange, and the page went on saying "Signing you in"
 *       indefinitely. Passing `signInUrl` was supposed to be enough, and
 *       reported from the real instance, it was not.</li>
 *   <li><b>A transferred sign-in left the product.</b> `transferable` defaults
 *       to true, so a Google identity with no Clerk user turns a sign-in
 *       attempt into a sign-up — and Clerk navigated to its own hosted sign-up
 *       on `accounts.dev` to finish it. A different domain wearing a different
 *       brand, reached by pressing "Continue with Google" on Reverie's own
 *       form.</li>
 * </ul>
 *
 * <p>`handleRedirectCallback` takes a `customNavigate`, so every navigation it
 * wants to make comes through this file: anything pointing off this origin is
 * mapped back onto the equivalent Reverie route, and anything that throws is
 * caught and said out loud instead of being sat on.
 *
 * <p>The transfer is still Clerk's decision to make — it is the one that knows
 * whether an identity exists — and it is deliberately not completed here
 * automatically. Silently creating an account for somebody who pressed "sign
 * in" is what Clerk's own documentation calls an opaque sign-up; the way out of
 * it is a sign-up screen, and now it is ours.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { Lockup } from "@/components/v2/lockup";
import { HOME, SIGN_IN, SIGN_UP, WELCOME } from "@/lib/routes";
import { inApp, refusalFrom } from "@/lib/sso-return";

type Phase = { state: "working" } | { state: "stopped"; message: string };

export default function SsoCallbackPage() {
  const clerk = useClerk();
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>({ state: "working" });

  /*
   * ON MOUNT, AND NOT ON EVERY RENDER.
   *
   * <p>`useClerk()` and `useRouter()` hand back a fresh object on renders that
   * have nothing to do with either changing, so an effect keyed on them re-runs
   * on every render — and setting the failed phase *is* a render. The failure
   * path therefore re-ran the effect, failed again, set the phase again, and
   * span until the test worker died. Found by that test crashing rather than
   * failing, which is its own kind of useful.
   *
   * <p>Fixed by not keying on them. A `useRef` guard would have stopped the
   * loop and broken something quieter: `reactStrictMode` is on, so in
   * development React mounts, unmounts and mounts again on the same instance —
   * refs survive that, so the second mount would have skipped the exchange
   * entirely and left the page saying "Signing you in", which is the bug this
   * file exists to fix. The two are read out of a ref that a prior effect keeps
   * current, so the exchange depends on nothing and runs when it should.
   */
  const latest = React.useRef({ clerk, router });
  React.useEffect(() => {
    latest.current = { clerk, router };
  });

  React.useEffect(() => {
    const { clerk: sdk, router: nav } = latest.current;

    /*
     * An error on the URL is known before anything is attempted, so it is not
     * worth attempting: the exchange would fail and the page would claim to be
     * signing somebody in until it did.
     */
    const refusal = refusalFrom(window.location.search);
    if (refusal) {
      setPhase({ state: "stopped", message: refusal });
      return;
    }

    let done = false;
    void (async () => {
      try {
        await sdk.handleRedirectCallback(
          {
            /* Where the two forms live, for every arrival that is not a
               completed session: a refused scope, a second factor, or a
               sign-in Clerk has decided is really a sign-up. */
            signInUrl: SIGN_IN,
            signUpUrl: SIGN_UP,
            /*
             * Where to go when the flow did not say, and the two roads differ
             * again. A returning sign-in goes to Now; a brand-new account goes
             * to the two questions first — including the case that makes this
             * matter, which is the same Google account coming back after a full
             * deletion. That is a new identity, so Clerk calls it a sign-up,
             * and it should be asked again.
             */
            signInFallbackRedirectUrl: HOME,
            signUpFallbackRedirectUrl: WELCOME,
          },
          async (to) => {
            if (done) return;
            done = true;
            nav.replace(inApp(to, window.location.origin));
          },
        );
      } catch {
        /*
         * The cancel path when the provider gave no reason on the URL, and
         * every other way the exchange can fail. Said rather than swallowed:
         * this is the state that left the page claiming to be signing somebody
         * in forever.
         */
        if (!done) setPhase({ state: "stopped", message: "That sign-in did not finish." });
      }
    })();

    return () => {
      done = true;
    };
    // Mount only: the two it needs come out of the ref above, so a fresh
    // `useClerk()` object cannot re-run an exchange that has already happened.
  }, []);

  return (
    <div className="relative grid min-h-screen place-items-center px-6 py-16">
      {/* The same wash the sign-in screen carries, so the seconds between
          Google and the app are not a different product. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_62%_at_50%_-12%,hsl(var(--brand)/0.15),transparent_62%),radial-gradient(80%_40%_at_82%_8%,hsl(var(--success)/0.05),transparent_70%)]"
      />

      <div className="relative z-10 flex w-full max-w-[400px] flex-col items-start gap-5">
        <Lockup size={21} />

        {phase.state === "working" ? (
          <p className="v2-label" role="status">
            Signing you in
          </p>
        ) : (
          <div role="alert">
            <p className="text-title-1 font-headline text-ink">{phase.message}</p>
            <p className="mt-2.5 text-body leading-[1.55] text-ink-3">
              Nothing on your account was changed.
            </p>
            <Link
              href={SIGN_IN}
              className="mt-6 inline-flex h-10 items-center rounded-md bg-ink px-4 text-body font-headline text-surface transition-opacity duration-press ease-soft hover:opacity-90"
            >
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
