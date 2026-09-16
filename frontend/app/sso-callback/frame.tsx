/**
 * What this route shows while the exchange runs.
 *
 * <p>In its own file because two things render it and neither may import the
 * other: `page.tsx` is the prerendered shell and must stay free of Clerk, and
 * `callback.tsx` is the Clerk-dependent half that `page.tsx` loads with
 * `ssr: false`. If the shell imported the frame from the callback it would pull
 * that module — and `@clerk/nextjs` with it — back into the server graph,
 * which is the thing the split exists to prevent.
 *
 * <p>A server component, deliberately: it holds no state and no hook, so there
 * is no reason for it to cost a client bundle. It renders identically on the
 * server, during hydration and after the callback mounts, which is what keeps
 * the swap from the shell to the real component invisible and free of a
 * hydration mismatch.
 */

export function CallbackFrame() {
  /*
   * NOTHING, IN THE RIGHT COLOUR.
   *
   * <p>The whole of what this route shows while it works, which at ordinary
   * speed is a frame or two. `min-h-screen` and the surface colour so the step
   * between two dark screens is not a white one; no text, no mark, no spinner,
   * because every one of those makes plumbing look like a destination.
   */
  return (
    <div className="grid min-h-screen place-items-center bg-surface">
      {/* Not visible, and not nothing. A sighted reader gets a dark frame or
          two; without this a screen-reader user gets silence on a route that
          is a real navigation stop. */}
      <span className="sr-only" role="status">
        Completing authentication…
      </span>

      {/*
        WHERE CLERK PUTS A BOT CHECK, IF IT ASKS FOR ONE.

        <p>Bot sign-up protection can challenge an OAuth sign-up as readily as
        the email one, and this is the element Clerk renders the challenge
        into. Without it there is nowhere to put the challenge and the
        sign-up is refused — which is what production was doing: the Clerk
        log read `sign_up.captcha.required`, then `sign_up.captcha.failed`,
        then `oauth_callback.failed`, for a person who had done nothing wrong
        but press Continue with Google.

        <p>The sign-up form has carried one of these all along. This route
        did not, because it draws nothing — and drawing nothing is exactly
        how the element went missing.

        <p>It renders in the first commit rather than being created when it is
        wanted: React commits the DOM before it runs effects, so by the time
        the exchange starts this is already on the page. Mounting it from
        inside the effect would be a race with the very call that needs it.

        <p>Now that the frame is also the shell's own output it is in the
        served HTML as well, so the element exists before a single line of
        JavaScript has run — which is strictly earlier than before and changes
        nothing else.

        <p>Empty it occupies nothing, so the route still shows a dark frame
        and no Reverie UI. Deliberately NOT `sr-only` or `hidden`: most
        challenges are invisible, but the one that is not has to be clickable
        or the sign-up cannot be completed at all. Centred for the same
        reason — if a widget does appear, it appears where somebody is
        looking rather than jammed into a corner.
      */}
      <div id="clerk-captcha" data-cl-theme="dark" data-cl-size="flexible" />
    </div>
  );
}
