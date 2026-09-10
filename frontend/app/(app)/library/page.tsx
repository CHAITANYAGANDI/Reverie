"use client";

/**
 * LIBRARY — every meeting.
 *
 * <h2>The composition</h2>
 *
 * <p>The frame Home is on: a broad list, a quiet vertical rule running the
 * height of the window, and a margin beside it. See `.v2-page` in
 * app/globals.css. The list is the archive; the margin is the filing system.
 *
 * <p>What it replaced here was `.v2-spread` — a 680px reading measure with a
 * 400px margin, centred. That unit exists because 74 characters is where the
 * eye stops losing a line of a transcript, and this page is a list of rows: it
 * reads nothing. And the margin used to begin with a hand-measured 230px
 * spacer, whose only job was to drop "Folders" level with the first heading in
 * the measure. The frame is one grid row, so the two regions begin on the same
 * line by construction and the spacer is gone.
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
 * <h2>Two filters, because two of the four are real</h2>
 *
 * <p>The reference draws four chips: Any time, a folder scope, Any kind, Any
 * voice. Dates go on the wire. Folders turned out to be real as well, just not
 * as a parameter: `GET /projects/{id}/meetings` and `GET /projects/unfiled`
 * have always existed, so narrowing to a folder is a different question rather
 * than a filter on the archive query. See `useLibraryList`, which is also
 * where the one subtlety lives — why the date window is applied in the browser
 * for those two scopes and on the wire for the archive.
 *
 * <p>Kinds and voices are still not drawn. Nothing filters by source or by
 * speaker, so both would be controls that cannot narrow anything, and two of
 * the four kinds are not concepts this product has.
 *
 * <p>The count beside them is the server's count for exactly the question that
 * produced the rows. Not the reference's "68 meetings · 41h 20m": no endpoint
 * returns an archive-wide duration, and adding up the rows on screen and
 * presenting it as the whole library would be a measurement of the page.
 *
 * <h2>What the mockup has that this does not</h2>
 *
 * <p>A speaker count and a sentence of summary under every title.
 * `MeetingResponse` carries neither — checked against the Java DTO, not only
 * the TypeScript — and the only ways to draw them are a request per row or an
 * invention. Both are refused; the row is otherwise the mockup's.
 *
 * <p>And a centred "That's everything in your Library." block under the last
 * row. It was never built and is not being built: the list ending is what says
 * the list has ended, and a reassurance under every archive is furniture that
 * scrolls.
 */

import * as React from "react";
import Link from "next/link";
import { CalendarDays, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AmbientCanvas } from "@/components/v2/ambient-canvas";
import { NowConversationRow } from "@/components/v2/now/conversation-row";
import { Masthead } from "@/components/v2/masthead";
import { Group } from "@/components/v2/group";
import { FolderMargin } from "@/components/v2/library/folder-margin";
import {
  FolderFilter,
  ALL_MEETINGS,
  scopeLabel,
  type FolderScope,
} from "@/components/v2/library/folder-filter";
import { useLibraryList } from "@/components/v2/library/use-library-list";
import {
  DateFilter,
  ANY_TIME,
  restoreWindow,
  type DateWindow,
} from "@/components/date-filter";
import { useStickyPreference, type PreferenceCodec } from "@/lib/preferences";

/** The choice, not the window. See the identical codec on Now for why. */
const WHEN_CODEC: PreferenceCodec<DateWindow> = {
  save: (value) => value.choice ?? null,
  load: (raw) => restoreWindow(raw),
};

/**
 * What the archive is, in one sentence.
 *
 * <p>The mockup's, verbatim. It replaced "Everything in this workspace, filed
 * or not. Reverie keeps a meeting until you delete it or your retention policy
 * does." — both clauses of which were true, and neither of which a subtitle was
 * the right place for. "Filed or not" was the page's statement of a guarantee
 * that lives on the wire, and is asserted there: see "asks for everything,
 * filed or not" in this page's suite. The retention sentence is a fact about an
 * account setting, and it is on the page that holds that setting.
 */
const SUB = "Everything you’ve captured, organized in one place.";

export default function LibraryPage() {
  // Its own key, not Home's. The two lists are read for different reasons --
  // Home is a glance at this week, this is a search of the archive -- and a
  // window narrowed on one of them has no business narrowing the other.
  const whenPref = useStickyPreference<DateWindow>("library.when", ANY_TIME, WHEN_CODEC);
  const { value: when, set: setWhen } = whenPref;

  /*
   * THE FOLDER SCOPE IS NOT REMEMBERED, WHERE THE DATE WINDOW IS.
   *
   * <p>Deliberately, and it is the one place these two controls differ. A
   * remembered folder is a stored id, and a folder can be deleted from
   * /folders or from its own page -- so the stored choice outlives the thing
   * it names, and somebody returns to a Library that is empty because of a
   * folder that no longer exists. A date window cannot go stale that way.
   *
   * <p>So this resets to the whole archive on every visit, which is also the
   * safer default for the page whose title is "Every meeting".
   */
  const [scope, setScope] = React.useState<FolderScope>(ALL_MEETINGS);

  const list = useLibraryList({ when, scope, ready: whenPref.ready });
  const { state, groups } = list;

  const narrowed = when.from !== null || when.to !== null;
  const scoped = scope.kind !== "all";

  return (
    <div className="relative">
      {/* The same wash as Home, at the same height, pulled up by the band so
          the field is continuous through the glass. One element behind the
          whole page rather than one per column -- see components/v2/
          ambient-canvas.tsx. */}
      <AmbientCanvas height="34rem" top="calc(var(--band) * -1)" />

      <div className="v2-page relative">
        <div className="min-w-0">
          <Masthead
            size="page"
            label="Library"
            title="Every meeting"
            sub={SUB}
            bar={
              <>
                <DateFilter value={when} onChange={setWhen} />
                <FolderFilter value={scope} onChange={setScope} />
                {/* The count for this exact question, or nothing. A number
                    that had to be guessed at is worse than no number. */}
                {state === "list" && list.total !== null && (
                  <span className="v2-page-meta ml-auto text-ink-3">
                    <span className="tabular font-mono">{list.total}</span>{" "}
                    {list.total === 1 ? "meeting" : "meetings"}
                  </span>
                )}
              </>
            }
          />

          {state === "skeleton" ? (
            <div className="space-y-5" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : state === "error" ? (
            <LibraryLoadError onRetry={list.refetch} />
          ) : state === "empty" ? (
            <EmptyLibrary
              narrowed={narrowed}
              dateLabel={when.label}
              scope={scope}
              onClearDate={() => setWhen(ANY_TIME)}
              onClearScope={() => setScope(ALL_MEETINGS)}
            />
          ) : (
            <div className="space-y-7">
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
                      /* The frame's row, and the archive keeps its clock: here
                         the time of day is part of telling which of two
                         meetings called Product Weekly this one is. Home turns
                         it off -- see `size` and `clock` on the row. */
                      <NowConversationRow key={meeting.id} meeting={meeting} size="page" />
                    ))}
                  </ul>
                </Group>
              ))}

              {/* Said only when it is true, and said where the list runs out.
                  Fifty of two hundred with nothing at the bottom is a list
                  somebody scrolls to the end of and believes. Only the archive
                  scope can be capped; a folder endpoint returns the whole
                  folder. */}
              {list.capped && (
                <p className="text-foot text-ink-4">
                  Showing the {list.shown} most recent of{" "}
                  <span className="tabular font-mono">{list.total}</span>
                  {narrowed ? " in this window." : "."}
                </p>
              )}
            </div>
          )}
        </div>

        {/*
         * THE MARGIN. Not a pane and not a card: no fill, no radius, no
         * scrollbar of its own. One 1px rule down its left edge, which is
         * `[data-page-margin]` in app/globals.css.
         *
         * <p>Always drawn. It used to disappear on two of the four states --
         * a failed archive and a window that had excluded everything -- on the
         * grounds that those needed the whole measure to explain themselves.
         * The measure is 960px wide now, so the explanation has room either
         * way, and a page whose second column comes and goes with the state of
         * the first is a page that changes shape while somebody reads it. It
         * also mattered more than it looked: /folders is only linked from
         * here, so a brand new account could reach the filing system on some
         * states and not others.
         */}
        <div data-page-margin>
          <FolderMargin />
        </div>
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
 * Nothing to show, and which of the reasons it is.
 *
 * <p>Three now, where there were two: the date window excluded everything, the
 * folder scope did, or the account genuinely has nothing in it. Naming the
 * wrong one is the whole failure mode here -- "Nothing here yet" over a
 * narrowed list tells somebody with a full archive that it is empty -- so the
 * two narrowings are stated in the order somebody would undo them, and each
 * gets the control that undoes it.
 *
 * <p>The reference for the filtered case names three filters and counts their
 * intersections: "five meetings in Hiring and fourteen with Nina — just none
 * that are both". Nobody is counting near misses here: each of those numbers
 * is another request, and the third filter does not exist. What is left is the
 * true version of the same sentence.
 */
function EmptyLibrary({
  narrowed,
  dateLabel,
  scope,
  onClearDate,
  onClearScope,
}: {
  narrowed: boolean;
  dateLabel: string;
  scope: FolderScope;
  onClearDate: () => void;
  onClearScope: () => void;
}) {
  /* "in AWD" / "outside your folders" / nothing. Built as a phrase rather than
     branched into six sentences, so every combination reads as English and
     none of them can be written twice. */
  const where =
    scope.kind === "folder"
      ? `in ${scope.name}`
      : scope.kind === "unfiled"
        ? "outside your folders"
        : "";
  const scoped = where !== "";

  if (scoped || narrowed) {
    return (
      <div>
        <p className="flex items-center gap-2 text-body font-headline text-ink">
          {scoped ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-ink-4" aria-hidden />
          ) : (
            <CalendarDays className="h-4 w-4 shrink-0 text-ink-4" aria-hidden />
          )}
          {/* "from" rather than "in" for the window, and the label verbatim:
              it reads correctly for all three shapes a window can take. */}
          Nothing {where}
          {scoped && narrowed ? " " : ""}
          {narrowed ? `from ${dateLabel}` : ""}
        </p>
        <p className="mt-1.5 max-w-[58ch] text-callout leading-[1.5] text-ink-3">
          The rest of your library is still here.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {/* One button per narrowing that is actually in effect. A "clear
              filters" that clears something nobody set is a control offering to
              undo an action that never happened. */}
          {narrowed && (
            <Button variant="outline" size="sm" onClick={onClearDate}>
              Show any time
            </Button>
          )}
          {scoped && (
            <Button variant="outline" size="sm" onClick={onClearScope}>
              All meetings
            </Button>
          )}
        </div>
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
          Home
        </Link>
        .
      </p>
    </div>
  );
}
