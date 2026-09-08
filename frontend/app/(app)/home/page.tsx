"use client";

/**
 * Home.
 *
 * <h2>The composition</h2>
 *
 * <p>From the approved 1672x941 reference, and it is a frame of Home's own:
 * ~890px of list, a quiet vertical rule, and a ~463px margin, with the whole
 * thing held to the reference width and centred past it. See `.v2-page` in
 * app/globals.css for the numbers, and for why this is not `.v2-spread`.
 *
 * <p>What was here before that was the spread: a 680px reading measure with a
 * 400px margin, widened on this page to 780 + 376. On a 1672px screen that put
 * the whole composition in the middle of the window with 236px of nothing down
 * each side, and it is the wrong unit for this page -- `--measure` exists
 * because 74 characters is where the eye stops losing a line of a transcript,
 * and Home is a list of rows. It reads nothing.
 *
 * <p>Two columns, and neither spans the other. The masthead used to span both
 * tracks, which is why the margin began under the launcher; the thing before
 * that needed a 186px spacer to fake the same alignment. It is one grid row
 * now, so both regions start on the same line by construction.
 *
 * <h2>Two facts the list payload does not carry</h2>
 *
 * <p>The reference's rows read `10 sec / 1 speaker` over a sentence of
 * summary. `MeetingResponse` has neither a speaker count nor any summary field
 * -- checked against the Java DTO, not only the TypeScript -- and the only
 * ways to put them on screen would be a request per row or an invention. Both
 * are refused, so a Home row is the reference's row less its third line and
 * less one metadata fact. Everything else about it is the reference's,
 * including the air above and below the text.
 *
 * <h2>What the composition replaced</h2>
 *
 * <p>A 768px column of rounded cards beside a shell-owned
 * 400–448px bordered pane with its own scrollbar and its own tab bar — a second
 * application standing next to the first. The V2 study rejects exactly that: a
 * persistent AI panel beside Home, and a list whose every row announces itself
 * as an object.
 *
 * <p>So the pane is gone from this page. The chat it held was a second workspace
 * chat with a whole destination of its own already in the band, and the margin
 * now carries the thing that actually belongs in a margin — your own list. The
 * meeting page still uses `SidePane`; it is unchanged.
 *
 * <h2>Recent means recent, and nothing else narrows it</h2>
 *
 * <p>There was a scope picker above the list with two options: <i>Recent
 * Conversations</i> and <i>All Conversations</i>. <i>Recent</i> sent
 * `unfiled=true` — a folder filter under a name about time — and it was the
 * default, so filing a meeting into a folder made it vanish from the page
 * called Recent.
 *
 * <p>Both are gone. This list is <b>the newest {@link RECENT_SIZE} conversations
 * in the window, wherever they are filed</b>, and Library is the complete
 * archive with the folders. The two pages differ by how much they show rather
 * than by a hidden predicate, which is a difference a person can see.
 *
 * <h2>What is deliberately not here</h2>
 *
 * <p>The reference draws "Needs you" and "What Reverie noticed" from
 * cross-meeting memory: decisions reversed, promises slipped twice, risks open
 * thirteen days. None of it exists — the migrations dropped
 * `meeting_decisions`, `decision_links`, `commitments` and
 * `commitment_evidence`, and nothing replaced them. See
 * docs/v2-implementation/feature-parity.md §2.
 *
 * <p>What survives is the <em>rhythm</em> of that region, filled from the rows
 * already on screen: a conversation that failed needs a person, a conversation
 * still being made does not, and they are never put under one heading. Both
 * counts are derived from the fetched page, so they cost no request and cannot
 * disagree with the rows underneath them.
 */

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { FileAudio, Mic, Plus, CalendarDays, RotateCw } from "lucide-react";
import { useGetMeetingsQuery, useGetPreferencesQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NowConversationRow } from "@/components/v2/now/conversation-row";
import { NowActionItems } from "@/components/v2/now/action-items";
import { useActionItems } from "@/components/v2/now/use-action-items";
import { cn } from "@/lib/utils";
import { AskLauncher } from "@/components/v2/now/ask-launcher";
import { SidePane } from "@/components/side-pane";
import { AmbientCanvas } from "@/components/v2/ambient-canvas";
import { isTerminal } from "@/lib/format";
import { groupByDay } from "@/lib/days";
import { homeListState } from "@/lib/home-list-state";
import type { MeetingResponse } from "@/lib/types";
import { LIBRARY, recordHref } from "@/lib/routes";

/**
 * How many conversations "recent" is.
 *
 * <p>A bound rather than a filter, and it is what separates this page from
 * Library. Both ask the same question of the same endpoint; this one asks for
 * the top of the answer. Twenty is four or five days for somebody in meetings
 * all week, and it is short enough that the list is still a glance rather than
 * an archive — which is the whole distinction being drawn.
 */
const RECENT_SIZE = 20;

/**
 * The Ask pane, fetched the first time it is drawn.
 *
 * <p>`dynamic` rather than a plain import, because the workspace chat brings
 * the composer, the context picker, the conversation archive, the markdown
 * renderer and the evidence rail with it -- and Home is the page the
 * application opens on. Statically imported it was 80kB of Home's first load,
 * every visit, for a panel that only appears when somebody presses Ask.
 *
 * <p>`ssr: false` for the same reason it renders nothing on the server anyway:
 * the pane is a portal into an element the shell owns, which does not exist
 * until the shell has mounted. See components/side-pane.
 *
 * <p>No loading state. It is behind a `SidePane` that is itself a frame late,
 * and a spinner in a panel that is opening is chrome where the conversation is
 * about to be.
 */
const WorkspaceAskPane = dynamic(
  () => import("@/components/chat/workspace-ask").then((m) => m.WorkspaceAskPane),
  { ssr: false },
);

export default function HomePage() {
  const meetings = useGetMeetingsQuery(
    {
      page: 0,
      size: RECENT_SIZE,
      // NO `unfiled`. It is the parameter this page used to send and the reason
      // its name was a lie: a meeting recorded inside a folder was filed there
      // and disappeared from Recent, which is not what recent means.
      //
      // AND NO `from`/`to`. This page had a date window of its own, remembered
      // until sign-out. It is gone: the list is the newest RECENT_SIZE
      // conversations, and a date filter over a fixed-size recency list can
      // only ever subtract from it -- it cannot surface anything the
      // unfiltered list does not already show. Narrowing by date is Library's,
      // where it is narrowing the whole archive and can therefore find
      // something. See docs/v2-implementation/feature-parity.md.
    },
    {
      /*
       * Ask again every time Now is opened. A meeting's status is the one field
       * in this list that changes without anybody touching the list, and the
       * cached copy is whatever was true when it was last fetched.
       */
      refetchOnMountOrArgChange: true,
    },
  );
  const { data } = meetings;

  /*
   * Four states, decided in one place -- see lib/home-list-state.ts.
   *
   * `count` is `null` when there is no page cached, NOT 0. That distinction is
   * the bug: `data?.content ?? []` read "no answer yet" as "the answer is
   * none", so a failed request told people with hundreds of meetings that they
   * had none.
   */
  const listState = homeListState({
    // Nothing to restore any more, so the list is never waiting on a
    // preference before it may ask. `homeListState` keeps the flag because
    // Library still has one.
    restored: true,
    isUninitialized: meetings.isUninitialized,
    isLoading: meetings.isLoading,
    isFetching: meetings.isFetching,
    isError: meetings.isError,
    isSuccess: meetings.isSuccess,
    count: data ? data.content.length : null,
  });

  /*
   * THREE SETS, AND EVERY ROW IS IN EXACTLY ONE.
   *
   * <p>Sorted by what the row needs rather than by when it happened, because
   * that is the question this page exists to answer. A failed conversation
   * needs a person; one still being made does not and is never filed under a
   * heading that says it does. Everything settled falls through to the diary.
   *
   * <p>Grouped on the status in the fetched page rather than on each row's live
   * status: the live one arrives per row over its own socket, and regrouping
   * the page underneath somebody as a meeting finishes would move a row they
   * were about to click. The row's own metadata line stays live.
   */
  const rows = React.useMemo(() => data?.content ?? [], [data]);
  const failed = React.useMemo(() => rows.filter((m) => m.status === "FAILED"), [rows]);
  const making = React.useMemo(
    () => rows.filter((m) => !isTerminal(m.status)),
    [rows],
  );
  const settled = React.useMemo(
    () => rows.filter((m) => m.status !== "FAILED" && isTerminal(m.status)),
    [rows],
  );
  const days = React.useMemo(() => groupByDay(settled), [settled]);

  /** Every section, in order, so the first one can carry the date filter. */
  const sections = React.useMemo(() => {
    const out: { key: string; heading: string; note?: string; items: MeetingResponse[] }[] = [];
    if (failed.length > 0) {
      out.push({
        key: "attention",
        heading: "Needs attention",
        note:
          failed.length === 1
            ? "1 conversation needs attention"
            : `${failed.length} conversations need attention`,
        items: failed,
      });
    }
    if (making.length > 0) {
      out.push({
        key: "progress",
        heading: "In progress",
        note:
          making.length === 1
            ? "1 conversation is still being made"
            : `${making.length} conversations are still being made`,
        items: making,
      });
    }
    for (const day of days) out.push({ key: day.key, heading: day.label, items: day.items });
    return out;
  }, [failed, making, days]);

  const showing = listState === "list";

  /*
   * THE MARGIN'S CONTENT, FETCHED HERE.
   *
   * <p>One call, read by this page and passed to the component that draws it --
   * not the same query twice. See components/v2/now/use-action-items.
   *
   * <p>It no longer decides the layout. It used to: an account with no
   * standalone items drew no margin and the page re-centred on the
   * conversation list, so Home had two compositions and adding the first item
   * moved every row on the screen. The column is drawn in every state now --
   * loading, failed, empty, full -- and what changes is the sentence under the
   * rule. See components/v2/now/action-items.
   */
  const actions = useActionItems();

  return (
    /*
     * ONE DOCUMENT, ON ONE CANVAS. The page used to give its list its own
     * `h-[calc(100vh-var(--band))] overflow-y-auto`, which made a second
     * scrolling region beside the pane's — two scrollbars on the default
     * screen. The margin is part of this page and scrolls with it.
     *
     * <p>`relative` for the wash below, and nothing else: no background, no
     * width, no padding. Those are the frame's, one level in, so the wash can
     * span the window while the content sits inside 136px gutters.
     */
    <div className="relative">
      {/*
       * THE ATMOSPHERE, and it is the page's rather than a column's.
       *
       * <p>One element behind everything, so the iris lift over the upper
       * centre and the trace of green in the upper right run continuously
       * under the list, under the rule and under the margin. A gradient per
       * region would put a seam down the middle of the page, and a fill behind
       * the margin would make it a panel -- which is the one thing this
       * composition is not.
       *
       * <p>Pulled up by the band so the field is continuous through the glass.
       * 34rem rather than the landing's 60vmax: the masthead here is four
       * lines, not a hero, and the wash has to be gone by the time the list
       * starts. It came down with the type -- at 46rem over the tighter
       * composition the wash outlasted the rows it was meant to sit behind.
       */}
      <AmbientCanvas height="34rem" top="calc(var(--band) * -1)" />

      {/*
       * THE FRAME. Two columns, one grid row, and a rule between them that is
       * the margin's own left edge -- see `.v2-page` in app/globals.css.
       */}
      <div className="v2-page relative">
        <div className="min-w-0">
          {/* `empty` is unqualified now. With no window there is only one way
              for this list to be empty -- the account is -- where before the
              masthead had to distinguish that from a date range that happened
              to return nothing. */}
          <Masthead empty={listState === "empty"} />

          {/*
            The one functional surface on the page, and it opens the pane
            rather than being a chat of its own.

            <p>It was a 40px field the full width of the list, because the
            approved reference drew a search-shaped field here. It is a button
            now, and the same button a meeting has -- the two open the same
            panel, so there was no reason for one of them to be the width of
            the page. `mt-4` is the air the bar used to occupy as height.
          */}
          {listState !== "empty" && (
            <div className="mt-4">
              <AskLauncher />
            </div>
          )}

          {listState === "skeleton" ? (
            <div className="mt-8 space-y-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : listState === "error" ? (
            <div className="mt-8">
              <HomeLoadError onRetry={() => void meetings.refetch()} />
            </div>
          ) : listState === "empty" ? (
            <div className="mt-10">
              <EmptyState />
            </div>
          ) : (
            /* 32px under the launcher: enough that the list is a separate
               thing from the control above it, and no more. It was 58, off
               the magnified reference. */
            <div className="mt-8 space-y-7">
              {sections.map((section) => (
                <Group key={section.key} heading={section.heading} note={section.note}>
                  <Rows meetings={section.items} />
                </Group>
              ))}

              {/* Said only when it is true, and said where the list runs out.
                  A page showing twenty of two hundred conversations with
                  nothing at the bottom is a list somebody scrolls to the end
                  of and believes. `totalElements` is on the response already. */}
              {data && data.totalElements > data.content.length && (
                <p className="v2-page-meta text-ink-4">
                  Showing the {data.content.length} most recent of{" "}
                  <span className="tabular">{data.totalElements}</span>.{" "}
                  <Link href={LIBRARY} className="underline underline-offset-2 hover:text-ink-2">
                    All of them are in Library
                  </Link>
                  .
                </p>
              )}
            </div>
          )}
        </div>

        {/*
         * THE MARGIN. Not a pane and not a card: no fill, no radius, no
         * scrollbar of its own. One 1px rule down its left edge, which is
         * `[data-page-margin]` in app/globals.css, and the page's background
         * running underneath it uninterrupted. There is nothing beneath the
         * list either, because a promotional card in the core product is
         * marketing standing where whitespace belongs.
         *
         * <p>Always drawn. See the note beside `useActionItems` above.
         */}
        <div data-page-margin>
          <NowActionItems items={actions} />
        </div>
      </div>

      {/*
       * ASK, IN THE SHELL'S PANE RATHER THAN ON A PAGE OF ITS OWN.
       *
       * <p>Home used to have no pane at all: its chat was an `<aside>` inside
       * this page, it was removed for being a second workspace chat competing
       * with `/ask`, and the launcher above became a link to that page. What
       * that traded away was the ability to ask about the list while the list
       * is on screen — which is the whole point of asking, and is how the same
       * question is asked from inside a meeting.
       *
       * <p>It is the pane and not an aside because the pane is a column of the
       * shell: full height, against the window's edge, with this page ending
       * where it begins. An aside here would begin under the band, end where
       * this page's padding ends, and need this file to restate the pane's
       * width to clear it. See components/side-pane.
       *
       * <p>Not a second chat, either. Same endpoints and the same conversation
       * archive as `/ask`; only the open thread is separate, keyed
       * `workspace:home`. See components/chat/workspace-ask.
       *
       * <p>Outside the frame, deliberately. `.v2-page` is a two-track grid and
       * anything inside it is one of those tracks; the pane belongs to the
       * window.
       */}
      <SidePane>
        <WorkspaceAskPane />
      </SidePane>
    </div>
  );
}

/* --------------------------------- sections -------------------------------- */

/**
 * A heading, an optional note or control beside it, and the rows.
 *
 * <p>A 14px heading in muted blue-grey, anything else pushed to the far end of
 * the same baseline. No card, and no rule under the heading — the hairlines
 * between rows are the only lines in the list.
 *
 * <p>It was `.v2-label`: 11.5px at 560 with a little tracking, which is the
 * label for a group inside a 680px reading column, and beside Home's row
 * titles it read as a caption that had lost its picture. It carries no bottom
 * margin: the first row's own top padding is the gap, which is what makes the
 * space above the first title the same as the space between every pair of rows
 * after it.
 */
function Group({
  heading,
  note,
  aside,
  children,
}: {
  heading: string;
  note?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-3">
        <h2 className="v2-page-sub text-ink-3">{heading}</h2>
        {note && <p className="v2-page-meta text-ink-3">{note}</p>}
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** The hairline lives between rows, which is the only line the list has. */
function Rows({ meetings }: { meetings: MeetingResponse[] }) {
  return (
    <ul className="[&>li+li>a]:shadow-[inset_0_1px_0_rgb(var(--line))]">
      {meetings.map((meeting) => (
        /* The frame's drawing of the row -- a glyph column and a chevron at
           the far end -- and no clock. Library takes the same size and keeps
           its clock; see `size` and `clock` on the row. */
        <NowConversationRow key={meeting.id} meeting={meeting} size="page" clock={false} />
      ))}
    </ul>
  );
}

/* ------------------------------- the masthead ------------------------------ */

/**
 * Where you are in the day, and one true sentence about what is under it.
 *
 * <p>The reference's subtitle — "two meetings landed overnight, and a decision
 * you took on the twenty-eighth reverses one from the twelfth" — is the memory
 * layer talking, and there is no such thing here. What replaces it says what
 * this page actually is, and it invents no counts: the two numbers that do
 * exist are stated as headings over the rows they count, where they cannot
 * drift from them.
 */
function Masthead({ empty }: { empty: boolean }) {
  const { mode, userId, profile } = useAuth();
  const prefs = useGetPreferencesQuery();

  /*
   * The clock is read after mounting, never during a render.
   *
   * This page is prerendered as static content, so a greeting computed while
   * rendering would be baked at BUILD time — "Good evening" at nine in the
   * morning, for everybody, until the next deploy — and would mismatch on
   * hydration into the bargain.
   */
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => setNow(new Date()), []);

  // The same order of precedence as the account menu: what this person typed
  // into Settings, then what they told their identity provider, then nothing.
  // Never the user id -- an opaque key in the place a name goes reads as
  // somebody else's account, which is exactly how it was reported.
  const full = prefs.data?.displayName?.trim() || profile.name || (mode === "dev" ? userId : "");
  // First name only. "Good morning, Chaitanyasai Gandi" is a form letter.
  const first = full.trim().split(/\s+/)[0] || null;

  const hour = now?.getHours() ?? 0;
  const greeting =
    hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const title = empty
    ? first
      ? `Nothing here yet, ${first}.`
      : "Nothing here yet."
    : first
      ? `${greeting}, ${first}.`
      : `${greeting}.`;

  return (
    /*
     * No padding ABOVE. The frame owns the air over the date -- 99px at the
     * reference, which is what puts it on the reference's line under a 48px
     * band -- because a masthead with its own `pt-10` inside a frame with its
     * own top padding is two numbers deciding one gap.
     *
     * <p>24px underneath, which is this block's. It belongs here rather than
     * on the launcher: the launcher is not drawn at all on an empty account,
     * and a top margin on a thing that is sometimes absent is a gap that
     * sometimes disappears.
     */
    <header className="pb-6">
      {/* Both lines reserve their height, so the greeting arriving one tick
          after the list does not push the list down under a reader's cursor.
          `min-h` rather than `h` on the greeting: at 390px it wraps, and a
          fixed height would print the second line through the lede. */}
      <p className="v2-page-sub h-[19px] text-ink-3">
        {now
          ? now.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })
          : ""}
      </p>
      <h1 className="v2-page-greet mt-2 min-h-[1.875rem] font-headline text-ink">
        {now ? title : ""}
      </h1>
      <p className="v2-page-lede mt-2 max-w-[68ch] text-ink-3">
        {/*
          THE REFERENCE'S SENTENCE, VERBATIM.
          <p>This read "Recent conversations, wherever they are filed, and what
          needs your attention." for one turn -- the middle clause being the
          sentence that replaced `unfiled=true` and the promise that filing a
          conversation into a folder does not hide it from this page.
          <p>The clause is gone and the guarantee is not. A promise in a
          subtitle was never what kept it: the query is, and it is asserted on
          the wire and on the rows -- see "never asks the server to hide filed
          conversations" and "keeps showing a conversation that has been filed
          into a folder" in this page's suite. Copy that restates a guarantee
          is copy that goes stale the day the guarantee breaks, and it reads to
          somebody who has never heard of the bug as an odd thing to mention.
        */}
        {empty
          ? "Reverie becomes useful after your first conversation. Record one in the browser, or bring in a file you already have."
          : "Recent conversations and anything that needs your attention."}
      </p>
    </header>
  );
}

/* -------------------------------- the list -------------------------------- */

/**
 * The list could not be fetched, and we are not going to pretend otherwise.
 *
 * <p>Without it a failed request fell through to "No conversations — Record /
 * Import", which tells somebody with a full archive that it is empty and offers
 * to help them start their first meeting. The two readings are opposites and
 * only one of them is recoverable by waiting.
 *
 * <p>`role="alert"` because this replaces content the reader was waiting for --
 * somebody who has already moved on would otherwise never learn it did not
 * arrive.
 */
function HomeLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert">
      <p className="flex items-center gap-2 text-body font-headline text-ink">
        <RotateCw className="h-4 w-4 text-ink-4" aria-hidden />
        Couldn&apos;t load your conversations
      </p>
      <p className="mt-1.5 max-w-[58ch] text-callout leading-[1.5] text-ink-3">
        Your conversations are still here. Something went wrong fetching them.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/* ------------------------------- the first minute -------------------------- */

/**
 * Nothing to show, and which of the two reasons it is.
 *
 * <p>This list sends no `unfiled`, so nothing here can hide a meeting: an empty
 * list has two causes and both are already known without asking anything. The
 * probe, the folder read and two of the four screens went with the third case.
 * What did not go is the rule underneath them — an empty list is a *claim about
 * the account*, and only a settled, successful, genuinely empty response may
 * make it. That lives in {@link homeListState}.
 *
 * <h2>The first minute</h2>
 *
 * <p>`09-now-first.html`: two buttons, the allowance, and an honest account of
 * what happens to a recording. The reference's third step is "it is compared
 * against every meeting before it", which is the memory layer and does not
 * exist. The third step here is what the product actually gives you afterwards,
 * and every claim in the block under it was checked against production before
 * it was written down.
 */
function EmptyState() {
  /*
   * ONE SCREEN, WHERE THERE WERE TWO.
   *
   * <p>This used to branch: a date window that returned nothing got "Nothing
   * from {label}" with a way to widen it, and only a genuinely empty account
   * got the first-minute screen. With the window gone there is one way for
   * this list to be empty and it is the account, so the branch and the widen
   * button went with it.
   */
  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        <Button asChild>
          <Link href={recordHref("/home")}>
            <Mic className="mr-2 h-4 w-4" /> Record a meeting
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/upload">
            <Plus className="mr-2 h-4 w-4" /> Import a recording
          </Link>
        </Button>
      </div>
      {/* `UsageLimitService.MINUTES_ALLOWANCE` and `IMPORT_ALLOWANCE`. */}
      <p className="mt-3 text-foot text-ink-5">
        100 minutes of transcription and three imports, for the life of the
        account. No card.
      </p>

      <div className="h-11" />

      <section className="mb-6">
        <h2 className="v2-label mb-4">What happens to a conversation</h2>
        <div className="flex flex-col gap-5">
          <Step n="1" title="It is written down, with the speakers separated">
            Reverie transcribes the recording and tells the voices apart, so a
            quotation has a name and a timecode against it.
          </Step>
          <Step n="2" title="It becomes a brief you can work with">
            A summary shaped by the kind of meeting it was, with the action
            items, decisions and risks read out of it — each carrying the
            sentence it came from.
          </Step>
          <Step n="3" title="You can search it, ask about it, and take it with you">
            Search jumps to the moment a phrase was said, Ask Reverie answers
            with the passages behind it, and the whole thing exports as PDF,
            Word, Markdown or plain text.
          </Step>
        </div>
      </section>

      <section>
        <h2 className="v2-label mb-1">Three things worth knowing now</h2>
        <div className="flex flex-col">
          <Fact
            icon={Mic}
            title="Reverie records this device, not the far end of a call"
          >
            Nothing joins the meeting to do it. If the others are on a call, put
            them through the speakers, or record on the machine hosting it.
          </Fact>
          <Fact
            icon={FileAudio}
            title="A file you already have works just as well"
          >
            Import audio or video and it goes through the same pipeline as
            something recorded here.
          </Fact>
          <Fact
            icon={CalendarDays}
            title="Your recordings are never used to train anything"
          >
            They answer your questions and nothing else, they are not reviewed
            by people here, and you choose how long they are kept.
          </Fact>
        </div>
      </section>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3.5">
      <span className="tabular w-[18px] shrink-0 pt-0.5 font-mono text-foot text-ink-5">{n}</span>
      <div className="min-w-0">
        <p className="text-title-3 font-headline text-ink">{title}</p>
        <p className="mt-1 max-w-[52ch] text-callout leading-[1.5] text-ink-3">{children}</p>
      </div>
    </div>
  );
}

function Fact({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Mic;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-4 shadow-[inset_0_1px_0_rgb(var(--line))]">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-5" aria-hidden />
      <div className="min-w-0">
        <p className="text-title-3 font-headline text-ink">{title}</p>
        <p className="mt-1 max-w-[66ch] text-callout leading-[1.5] text-ink-3">{children}</p>
      </div>
    </div>
  );
}
