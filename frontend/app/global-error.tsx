"use client";

/**
 * The last boundary: the root layout itself failed.
 *
 * <p>Reached only when {@code app/(app)/error.tsx} cannot be — an exception in
 * the root layout or in one of the providers it mounts. Next replaces the whole
 * document at that point, which is why this renders its own {@code <html>} and
 * {@code <body>}: there is no layout left to sit inside.
 *
 * <p>It therefore cannot assume anything the root layout sets up. No providers,
 * no store, no fonts, no {@code cn}. The stylesheet is imported here rather than
 * inherited, so the page is still Reverie rather than unstyled browser
 * defaults — and if even that fails, the markup is plain enough to read
 * without it.
 *
 * <p>A full reload rather than {@code reset()}: whatever broke was the thing
 * that builds the application, and re-rendering it is asking the same code to
 * fail the same way.
 */

import * as React from "react";
import "./globals.css";
import { reportError } from "@/lib/observability";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    reportError(error, "root-layout");
  }, [error]);

  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <main
          role="alert"
          className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center"
        >
          <h1 className="text-lg font-semibold text-ink">Reverie couldn&rsquo;t start</h1>
          <p className="mt-2 max-w-sm text-sm text-ink-3">
            Something went wrong loading the app. Your meetings and notes are safe.
          </p>
          {/* A plain button, not the design-system one: this file runs when the
              provider tree did not, and importing further into the app is
              importing more of what just failed. */}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-md bg-brand-fill px-4 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            Reload
          </button>
          {error.digest ? (
            <p className="mt-6 text-xs text-ink-4">Reference: {error.digest}</p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
