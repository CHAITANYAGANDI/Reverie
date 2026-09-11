"use client";

/**
 * When a screen inside the app throws.
 *
 * <p>Until this existed there was no boundary at all below the root, so an
 * exception anywhere in a route — a bad shape from an endpoint, a null nobody
 * expected — took out the whole document and left Next's default error page:
 * a blank screen with an unstyled sentence on it, and on a deployment nothing
 * to do but reload and hope.
 *
 * <p>It sits inside {@code (app)}, so the navigation and the band survive the
 * failure. That is the difference worth having: the screen that broke is
 * replaced, and everything else is still there to leave by. A boundary at the
 * root would take the shell down with the page.
 *
 * <h2>What it does not show</h2>
 *
 * <p>No stack trace, no {@code error.message}, no response body. Two reasons,
 * and the second is the load-bearing one: the text is meaningless to the person
 * reading it, and this app's exceptions are thrown from code holding meeting
 * transcripts and chat questions — a message rendered on screen is a message
 * that can be read over a shoulder or pasted into a bug report. The exception
 * goes to the console and to the collector; the page gets a sentence and a way
 * out. See lib/observability.
 *
 * <p>Wording matches {@link ResourceLoadError} on purpose: "Couldn't load", the
 * reassurance that the data is still there, then the action. Somebody who has
 * seen one of these has seen all of them.
 */

import * as React from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/observability";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    reportError(error, "app-shell");
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center"
    >
      <RotateCw className="h-6 w-6 text-ink-3" aria-hidden />
      <h1 className="mt-4 text-lg font-semibold text-ink">
        This screen didn&rsquo;t load
      </h1>
      <p className="mt-2 max-w-sm text-sm text-ink-3">
        Something went wrong on our side. Your meetings and notes are safe — nothing
        here was lost.
      </p>
      <div className="mt-5 flex items-center gap-2">
        {/* `reset` re-renders the segment rather than reloading the document, so
            a transient failure costs nothing and the rest of the app keeps its
            state. */}
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/home">Go to Home</Link>
        </Button>
      </div>
      {/* The one identifier worth surfacing: it is a build-time hash, it
          contains nothing about this account, and it is what makes a report
          findable in the logs. Only rendered when Next produced one. */}
      {error.digest ? (
        <p className="mt-6 text-xs text-ink-4">Reference: {error.digest}</p>
      ) : null}
    </div>
  );
}
