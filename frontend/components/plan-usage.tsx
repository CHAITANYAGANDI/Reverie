"use client";

/**
 * What is left of the allowance, at the foot of the rail.
 *
 * <p>The shape is Otter's — the plan's name, a track beside it, and a bold
 * count under it — because it is the right shape: an allowance is only useful
 * where somebody sees it before they start something, not on a settings tab
 * they open once.
 *
 * <p><strong>The bar is minutes.</strong> It used to be the meeting count,
 * because that was the only number the server enforced; minutes were added up
 * and checked against nothing, so drawing them as a fraction would have
 * invented a ceiling. Both halves of that have changed. The allowance is now
 * 100 transcribed minutes and 3 imports for the life of the account
 * (`UsageLimitService`), the meeting count is capped by nothing at all, and the
 * bar is on the number that actually runs out.
 *
 * <p><strong>And there is no reset date.</strong> This said "None left until
 * 1 September" when the month was spent, which was the useful thing to say
 * about a monthly quota and would be a lie about this one. Nothing arrives on
 * the 1st. What it says instead is what is true: the allowance is the account's
 * whole allowance, and nothing already transcribed is taken away.
 *
 * <h2>Three states, and they are not allowed to look alike</h2>
 *
 * <p><b>On its way</b> is a skeleton, <b>read</b> is the figure, and
 * <b>failed</b> now says so in words. The three are decided by the query's own
 * flags rather than by whether a number happens to be missing, because
 * `undefined` is what this hook returns for every one of them and a component
 * that branches on it can only ever draw one.
 */

import * as React from "react";
import Link from "next/link";
import { useGetUsageQuery } from "@/lib/api";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { planLabel, quotaCount, usageFraction } from "@/lib/plan";
import { cn } from "@/lib/utils";

/**
 * @param className replaces the outer spacing and surface, not just adds to it.
 *   This used to be the footer of a navigation rail and carried `mx-3 mb-3`
 *   accordingly; it is now inside the account menu, where an outer margin is a
 *   gap between the card and a popover edge that has its own padding. The
 *   measurements travel with the caller because only the caller knows what it
 *   is sitting in.
 */
export function PlanUsage({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const { data, isError } = useGetUsageQuery();

  /*
   * A FAILURE SAYS SO, WHERE IT USED TO REMOVE THE WIDGET.
   *
   * <p>This was `if (isError) return null`, on the argument that a rail footer
   * is not the place to report one failed request. The argument was about the
   * wrong cost. An allowance that is simply absent does not read as "we could
   * not fetch this" — it reads as an account with no limit on it, which is the
   * opposite of what an unread allowance means, and it is indistinguishable
   * from the widget having been removed from the product. Silence is not the
   * neutral option when the thing being hidden is a restriction.
   *
   * <p>So it states the one true thing it knows and no more: no figure, no
   * bar, no ceiling, and nothing about the request. `Usage temporarily
   * unavailable` is deliberately the whole message — a status code or a host
   * name here would be an operational detail in a menu, and "temporarily" is
   * the part that says what to do about it, which is nothing.
   *
   * <p>CHECKED BEFORE `data`, exactly as it was. A failed refresh over a
   * cached body must say so rather than keep drawing the last figure: this
   * widget's whole job is to be right about how much is left, and a number
   * that was true a minute ago is presented here as one that is true now.
   *
   * <p>AND IT CANNOT FIRE FOR A SIGNED-OUT READER. `PlanUsage` renders only
   * inside `AccountMenu`, which renders only inside `AppShell`, which
   * `app/(app)/layout` mounts inside `AuthGate` — and that nesting exists for
   * this exact reason: the gate opens on `tokenReady && isLoaded` so that the
   * shell's mount-time requests, the plan allowance named among them, cannot
   * race the Clerk token. A tokenless request would fail (see `baseQuery` in
   * lib/api), so without that gate this branch would announce a failure every
   * time the app started. With it, reaching here means the request genuinely
   * went and genuinely failed.
   *
   * <p>`role="status"` and not `role="alert"`. This codebase keeps `alert` for
   * a failure standing where the reader was waiting for content -- Home's and
   * Library's lists -- and this is a footnote in a menu somebody opened for
   * something else. Polite, so a reader is told when it replaces the skeleton
   * under them, and not interrupted for it.
   */
  if (isError) {
    return (
      <p
        role="status"
        className={cn(
          "mx-3 mb-3 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground",
          className,
        )}
      >
        Usage temporarily unavailable
      </p>
    );
  }

  // Held space rather than nothing, because this sits under a `flex-1` folder
  // tree: appearing late would shove the account menu down at the moment
  // somebody was reaching for it.
  if (!data) {
    return <Skeleton className={cn("mx-3 mb-3 h-[4.75rem] rounded-lg", className)} />;
  }

  const { minutesUsed: used, minutesLimit: limit } = data;
  const spent = limit >= 0 && used >= limit;

  return (
    <Link
      href="/settings/plans"
      onClick={onNavigate}
      className={cn(
        "mx-3 mb-3 block rounded-lg border bg-muted/40 p-3 transition-colors hover:bg-accent",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">{planLabel(data.plan)}</span>
        {/* Out of the accessibility tree on purpose. The line underneath is the
            same fact in words, and announced together they are "sixty percent"
            followed by "3 of 5" — two readings of one number, the vaguer one
            first. */}
        <Progress
          value={usageFraction(used, limit)}
          className="h-1.5 flex-1"
          aria-hidden
        />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{quotaCount(used, limit)}</span>{" "}
        {/* An account with no ceiling says so, because otherwise the track above
            it is unreadable: it sits at a token sliver forever, which looks
            like an allowance barely touched rather than one that cannot run
            out. No plan has that any more, and the branch stays because -1 is
            still what the field means and a row can still carry it. */}
        {/* "used", not "transcribed". The number counts minutes spent, and
            recording spends them as well as importing -- so "transcribed"
            named one of the two ways the allowance goes and read as though a
            recording were free until it was processed. */}
        minutes used{limit < 0 ? " — no limit" : ""}
      </p>

      {/*
        NO IMPORT COUNT.

        <p>It read "0 of 3 imports used" under the minutes, and it is
        withdrawn. This widget is a glance inside the account menu: one bar and
        one number about the limit somebody is actually near. Imports are the
        second allowance and almost nobody is near it, so the line spent a row
        of the menu restating a zero.

        <p>Both allowances are still stated in full where somebody is weighing
        them up -- Settings, Plans, "This account", where each has its own bar
        against what has been used. Nothing was removed from there.

        <p>What survives is the sentence for the one moment it means something:
        the minutes have run out, and it says there is no date to wait for and
        that nothing already transcribed goes away. That is not a statistic.
      */}
      {spent && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          That is the whole allowance. Nothing already transcribed is removed.
        </p>
      )}
    </Link>
  );
}
