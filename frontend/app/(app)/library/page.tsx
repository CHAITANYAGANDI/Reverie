"use client";

/**
 * LIBRARY — every meeting.
 *
 * <h2>The composition, and what it replaced</h2>
 *
 * <p>`design-demo/final/14-library.html`: a 680px measure, a 40px gap and a
 * 400px margin, scrolling as one document. The measure is the archive; the
 * margin is the filing system.
 *
 * <p>What was here instead read as two stacked database tables. An `h1` and a
 * date filter on one flex row, then a full-width folder section — heading, New
 * folder button, a two-column sort header, and either the folders or a centred
 * empty state with an icon and a paragraph in it — then an `h2` reading
 * "Conversations", then the archive as rounded bordered cards each with a 32px
 * filled circle. An account with no folders spent roughly three hundred
 * vertical pixels saying so, above the only thing anybody opens this page for.
 *
 * <p>So the folders moved to the margin (see FolderMargin), the archive became
 * the document, and the masthead says what the page is before it offers a
 * control that narrows it.
 *
 * <h2>Neither this page nor Now filters by folder</h2>
 *
 * <p>Unchanged, and still the one thing worth asserting on the request. Now used
 * to send `unfiled=true` and this page never did, which made that parameter the
 * seam between them — and made Now's name a lie, since filing a meeting took it
 * off a list called Recent. It is gone from both. What separates them is how
 * much they show: Now asks for the newest twenty, this asks for fifty and
 * reports the rest.
 *
 * <p>A Library that ever inherited that flag would look completely right until
 * somebody opened a folder and found meetings the "everything" list had never
 * shown them, which is why the test is on the query and not on the rows.
 *
 * <h2>One filter, because there is one filter</h2>
 *
 * <p>The reference draws four chips: Any time, Every folder, Any kind, Any
 * voice. `GET /meetings` takes `search`, `tag`, `status`, `from`, `to` and
 * `unfiled` — so of those four, only the dates exist. The other three would be
 * controls that cannot narrow anything, and a folder chip would be the very
 * predicate this app removed. One real filter beats four convincing ones.
 *
 * <p>The count beside it is `totalElements`, which is the server's count for
 * exactly the query that produced the rows. Not the reference's "68 meetings ·
 * 41h 20m": no endpoint returns an archive-wide duration, and adding up the
 * fifty rows on screen and presenting it as the whole library would be a
 * measurement of the page rather than of the archive.
 */

import * as React from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { useGetMeetingsQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NowConversationRow } from "@/components/v2/now/conversation-row";
import { Masthead } from "@/components/v2/masthead";
import { Group } from "@/components/v2/group";
import { FolderMargin } from "@/components/v2/library/folder-margin";
import {
  DateFilter,
  ANY_TIME,
  restoreWindow,
  type DateWindow,
} from "@/components/date-filter";
import { useStickyPreference, type PreferenceCodec } from "@/lib/preferences";
import { groupByDay } from "@/lib/days";
import { homeListState } from "@/lib/home-list-state";

/** The choice, not the window. See the identical codec on Now for why. */
const WHEN_CODEC: PreferenceCodec<DateWindow> = {
  save: (value) => value.choice ?? null,
  load: (raw) => restoreWindow(raw),
};

/**
 * What the archive is, in one sentence.
 *
 * <p>The reference's second clause — "Reverie keeps a meeting until you delete
 * it or your retention policy does" — is kept because it is true here:
 * `RetentionService` and `RetentionJob` exist, the window is a real account
 * setting, and nothing else removes a meeting. It would have been cut had it
 * been describing a policy engine this product does not have.
 */
const SUB =
  "Everything in this workspace, filed or not. Reverie keeps a meeting until you delete it or your retention policy does.";

export default function LibraryPage() {
  // Its own key, not Now's. The two lists are read for different reasons — Now
  // is a glance at this week, this is a search of the archive — and a window
  // narrowed on one of them has no business narrowing the other.
  const whenPref = useStickyPreference<DateWindow>("library.when", ANY_TIME, WHEN_CODEC);
  const { value: when, set: setWhen } = whenPref;

  const meetings = useGetMeetingsQuery(
    {
      page: 0,
      size: 50,
      from: when.from ?? undefined,
      to: when.to ?? undefined,
      // No `unfiled`. That parameter is what would make this list "everything
      // outside your folders"; this list is everything.
    },
    {
      // The remembered window cannot be read while rendering, so the first
      // render always holds ANY_TIME. Asking then would fetch the archive and
      // immediately fetch it again narrowed.
      skip: !whenPref.ready,
      // A meeting's status changes without anybody touching the list, and the
      // cached copy is whatever was true when it was last fetched.
      refetchOnMountOrArgChange: true,
    },
  );
  const { data } = meetings;

  const state = homeListState({
    restored: whenPref.ready,
    isUninitialized: meetings.isUninitialized,
    isLoading: meetings.isLoading,
    isFetching: meetings.isFetching,
    isError: meetings.isError,
    isSuccess: meetings.isSuccess,
    // `null` when there is no page cached, NOT 0. `data?.content ?? []` reads
    // "no answer yet" as "the answer is none", which tells somebody with a
    // hundred meetings that they have none.
    count: data ? data.content.length : null,
  });

  const groups = React.useMemo(() => groupByDay(data?.content ?? []), [data]);
  const narrowed = when.from !== null || when.to !== null;

  /*
   * THE MARGIN IS FOR A PAGE THAT HAS AN ARCHIVE ON IT.
   *
   * <p>`15-library-empty.html` is `.single` rather than `.spread` — a filter
   * that excluded everything, or a failure, gets the whole measure to explain
   * itself in rather than a folder list beside it. The skeleton keeps the
   * margin so that rows arriving do not shift the page sideways.
   */
  const spread = state === "skeleton" || state === "list";

  return (
    <div className="px-4 pb-16 lg:px-6">
      <div className="v2-spread" data-margin={spread ? undefined : "empty"}>
        <div className="min-w-0">
          <Masthead
            label="Library"
            title="Every meeting"
            sub={SUB}
            bar={
              <>
                <DateFilter value={when} onChange={setWhen} />
                {/* The server's count for this exact query, or nothing. A
                    number that had to be guessed at is worse than no number. */}
                {state === "list" && data && (
                  <span className="ml-auto text-foot text-ink-4">
                    <span className="tabular font-mono">{data.totalElements}</span>{" "}
                    {data.totalElements === 1 ? "meeting" : "meetings"}
                  </span>
                )}
              </>
            }
          />

          {state === "skeleton" ? (
            <div className="space-y-4" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : state === "error" ? (
            <LibraryLoadError onRetry={() => void meetings.refetch()} />
          ) : state === "empty" ? (
            <EmptyLibrary
              narrowed={narrowed}
              label={when.label}
              onClearDate={() => setWhen(ANY_TIME)}
            />
          ) : (
            <>
              {groups.map((group) => (
                <Group
                  key={group.key}
                  heading={group.label}
                  aside={
                    <span className="tabular font-mono text-foot text-ink-4">
                      {group.items.length}
                    </span>
                  }
                >
                  <ul className="[&>li+li>a]:shadow-[inset_0_1px_0_rgb(var(--line))]">
                    {group.items.map((meeting) => (
                      <NowConversationRow key={meeting.id} meeting={meeting} />
                    ))}
                  </ul>
                </Group>
              ))}

              {/* Said only when it is true, and said where the list runs out.
                  Fifty of two hundred with nothing at the bottom is a list
                  somebody scrolls to the end of and believes. */}
              {data && data.totalElements > data.content.length && (
                <p className="text-foot text-ink-4">
                  Showing the {data.content.length} most recent of{" "}
                  <span className="tabular font-mono">{data.totalElements}</span>
                  {narrowed ? " in this window." : "."}
                </p>
              )}
            </>
          )}
        </div>

        {/*
         * THE MARGIN. Not a pane: no border, no fill, no scrollbar of its own.
         * It is the second column of this page and it stops where its content
         * stops. The spacer is the reference's, and it drops the first margin
         * heading level with the first heading in the measure.
         */}
        {spread && (
          <div className="mt-10 min-w-0 lg:mt-0">
            {/* Measured, not guessed: it drops "Folders" onto the same
                baseline as the first day heading in the measure. The
                reference's own 214px was for its masthead metrics, not
                these. */}
            <div aria-hidden className="hidden h-[230px] lg:block" />
            <FolderMargin />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The archive could not be fetched, and we are not going to pretend otherwise.
 *
 * <p>Without this a failed request falls through to an empty state, which tells
 * somebody with a full archive that it is empty. The two readings are opposites
 * and only one of them is recoverable by waiting. `role="alert"` because this
 * replaces content the reader was waiting for.
 *
 * <p>On the canvas rather than inside a dashed rectangle. The card was doing
 * nothing a heading and a paragraph do not do more quietly, and a bordered box
 * in the middle of a page of hairlines is the loudest thing on the screen.
 */
function LibraryLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert">
      <p className="text-body font-headline text-ink">Couldn&apos;t load your library</p>
      <p className="mt-1.5 max-w-[58ch] text-callout leading-[1.5] text-ink-3">
        Your conversations are still here. Something went wrong fetching them.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/**
 * Nothing to show, and which of the two reasons it is.
 *
 * <p>Only two here, where Now has four. This list has no scope to have hidden
 * anything — it is everything — so the date window is the only filter that can
 * empty it, and the other case is an account with nothing in it yet.
 *
 * <p>The reference for the filtered case names three filters and counts their
 * intersections: "five meetings in Hiring and fourteen with Nina — just none
 * that are both". Two of those filters do not exist, the counts would each be a
 * second request, and the near-miss groups under it would be two more. What is
 * left is the true version of the same sentence: the window excluded everything,
 * the rest of the archive is fine, and here is the control that widens it.
 */
function EmptyLibrary({
  narrowed,
  label,
  onClearDate,
}: {
  narrowed: boolean;
  label: string;
  onClearDate: () => void;
}) {
  if (narrowed) {
    return (
      <div>
        <p className="flex items-center gap-2 text-body font-headline text-ink">
          <CalendarDays className="h-4 w-4 text-ink-4" aria-hidden />
          {/* "from" rather than "in", and the label verbatim: it reads correctly
              for all three shapes the window can take. */}
          Nothing from {label}
        </p>
        <p className="mt-1.5 max-w-[58ch] text-callout leading-[1.5] text-ink-3">
          There are no conversations in this stretch of time. The rest of your
          library is still here.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onClearDate}>
          Show any time
        </Button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-body font-headline text-ink">Nothing here yet</p>
      <p className="mt-1.5 max-w-[58ch] text-callout leading-[1.5] text-ink-3">
        Record a meeting or import audio you already have, and it will be here.{" "}
        {/* The actions are not repeated. Record and Import are in the band on
            every screen in the app, and a second pair here would be two places
            to press for one thing. */}
        Record and Import are at the top of every page — or start from{" "}
        <Link href="/home" className="underline underline-offset-2 hover:text-ink-2">
          Now
        </Link>
        .
      </p>
    </div>
  );
}
