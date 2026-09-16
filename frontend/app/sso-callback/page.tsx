"use client";

/**
 * The OAuth landing route, as a shell with no Clerk in it.
 *
 * <h2>The blocker this exists to fix</h2>
 *
 * <p>`next build` failed here:
 *
 * <pre>
 *   Error occurred prerendering page "/sso-callback"
 *   Error: useClerk can only be used within the &lt;ClerkProvider /&gt; component.
 * </pre>
 *
 * <p>This route takes no parameters and calls no dynamic API, so Next
 * prerenders it: it renders the RSC tree — layout, `Providers`, `AuthProvider`,
 * page — and server-renders the client components to HTML. The page's first
 * line called `useClerk()`, and `useClerk` asserts its provider rather than
 * degrading, so the render threw.
 *
 * <p>Nothing server-side was ever going to provide that context.
 * `AuthProvider` branches on `AUTH_MODE`, which is resolved from
 * `NEXT_PUBLIC_AUTH_MODE` at build time:
 *
 * <ul>
 *   <li><b>clerk mode</b> — the provider is a `next/dynamic` with
 *       `ssr: false`, which renders nothing on the server. It therefore
 *       swallowed the page too, the page body never ran, and the build
 *       happened to pass while the fault sat latent.</li>
 *   <li><b>dev mode</b> — `DevAuthProvider` is an ordinary client component
 *       and does server-render its children, and dev mode has no Clerk at all.
 *       The page ran, `useClerk()` found no provider, and the build failed.</li>
 * </ul>
 *
 * <p>So the fault was never Next's: a route's top-level render depended on a
 * provider that exists in one of two modes and only on the client. Which is
 * also why `/sign-in` survives the same prerender — it uses `useSignIn` from
 * `@clerk/nextjs/legacy`, which returns `{ isLoaded: false }` outside a
 * provider instead of throwing.
 *
 * <h2>The boundary</h2>
 *
 * <p>The route is this shell, which imports nothing from Clerk and calls no
 * hook. The exchange — every branch of it, unchanged — lives in
 * `./callback` and is loaded with `ssr: false`, so it is evaluated only in the
 * browser, after hydration, by which time `AuthProvider` has mounted
 * `ClerkProvider`.
 *
 * <p>Three renders, one output. The prerender draws {@link CallbackFrame}; the
 * first client render draws it again, because the dynamic chunk has not
 * resolved; and the callback's own working state draws the same frame. Server
 * and client agree on the first paint, which is what keeps this free of a
 * hydration mismatch, and the captcha container is now in the served HTML
 * rather than waiting on JavaScript.
 *
 * <p>The route is still public — the middleware is untouched, and it has to be,
 * because the provider returns here before a session exists.
 */

import dynamic from "next/dynamic";
import { AUTH_MODE } from "@/lib/auth-store";
import { CallbackFrame } from "./frame";

/*
 * `ssr: false`, which is the whole fix, and `loading` so the server has
 * something to draw. Without the loading branch the prerendered HTML for this
 * route would be empty and the dark frame would appear only once the chunk
 * landed — a white flash between two dark screens, which is the one thing this
 * route's own note says it must not be.
 *
 * <p>Allowed here because this file is a client component. `ssr: false` on
 * `next/dynamic` is refused inside a Server Component in Next 15, which is
 * worth knowing before somebody removes the directive above.
 */
const Callback = dynamic(() => import("./callback").then((m) => m.SsoCallback), {
  ssr: false,
  loading: () => <CallbackFrame />,
});

export default function SsoCallbackPage() {
  /*
   * ONLY IN CLERK MODE.
   *
   * <p>`useClerk` throws without its provider in the browser exactly as it does
   * during a prerender, so mounting the exchange in dev mode would move the
   * crash from the build to the first person who opened the route. Dev mode has
   * no Clerk, no Google and no round trip to complete, so there is nothing for
   * the exchange to do there; what it gets is the frame.
   *
   * <p>A build-time constant, so in clerk mode this compiles to the dynamic
   * component and in dev mode to the frame — the server and the client always
   * agree on which branch they are in.
   */
  if (AUTH_MODE !== "clerk") {
    return <CallbackFrame />;
  }

  return <Callback />;
}
