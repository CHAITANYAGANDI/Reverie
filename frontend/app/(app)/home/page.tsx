"use client";

/**
 * Now.
 *
 * <h2>The composition, and what it replaced</h2>
 *
 * <p>`design-demo/final/07-now.html` and `09-now-first.html`: a 680px measure,
 * a 40px gap and a 400px margin, centred, scrolling as one document. What was
 * here instead was a 768px column of rounded cards beside a shell-owned
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
import { FileAudio, Mic, Plus, CalendarDays, RotateCw } from "lucide-react";
import { useGetMeetingsQuery, useGetPreferencesQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NowConversationRow } from "@/components/v2/now/conversation-row";
import { NowActionItems } from "@/components/v2/now/action-items";
import { AskLauncher } from "@/components/v2/now/ask-launcher";
import {
  DateFilter,
  ANY_TIME,
  restoreWindow,
  type DateWindow,
} from "@/components/date-filter";
import { useStickyPreference, type PreferenceCodec } from "@/lib/preferences";
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

const WHEN_CODEC: PreferenceCodec<DateWindow> = {
  // The choice, not the window. Storing the instants would pin "Last 7 days" to
  // the week it was picked and leave "Today" labelling a day that has passed.
  save: (value) => value.choice ?? null,
  load: (raw) => restoreWindow(raw),
};

export default function HomePage() {
  // The window is remembered until sign-out. This is a page people leave and
  // come back to constantly, and a filter that reset on every return meant
  // narrowing the list was work you did once per visit rather than once.
  const whenPref = useStickyPreference<DateWindow>("home.when", ANY_TIME, WHEN_CODEC);
  const { value: when, set: setWhen } = whenPref;
  const restored = whenPref.ready;

  const meetings = useGetMeetingsQuery(
    {
      page: 0,
      size: RECENT_SIZE,
      from: when.from ?? undefined,
      to: when.to ?? undefined,
      // NO `unfiled`. It is the parameter this page used to send and the reason
      // its name was a lie: a meeting recorded inside a folder was filed there
      // and disappeared from Recent, which is not what recent means.
    },
    {
      skip: !restored,
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
    restored,
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
   * Whether anything is narrowing the list.
   *
   * <p>Read off the window's bounds, not off `when.choice` — the default window
   * carries a choice too (`{ kind: "preset", key: "any" }`), so a truthiness
   * test on it says "narrowed" always. That is the same predicate `EmptyState`
   * has always used to decide which of its two screens to draw, and the two
   * must agree: one deciding the account is empty while the other blames a date
   * window is a page arguing with itself.
   */
  const narrowed = when.from !== null || when.to !== null;

  return (
    /*
     * ONE DOCUMENT. The page used to give its list its own
     * `h-[calc(100vh-var(--band))] overflow-y-auto`, which made a second
     * scrolling region beside the pane's — two scrollbars on the default
     * screen. The margin is part of this page and scrolls with it.
     */
    <div className="px-4 pb-16 lg:px-6">
      <div className="v2-spread" data-margin={showing ? undefined : "empty"}>
      <div className="min-w-0">
        <Masthead meetings={data?.content} empty={listState === "empty" && !narrowed} />

        {/* The one functional surface in the measure, and it is a door to the
            workspace Ask rather than a chat of its own. */}
        {listState !== "empty" && <AskLauncher />}

        {listState === "skeleton" ? (
          <div className="mt-9 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : listState === "error" ? (
          <div className="mt-9">
            <HomeLoadError onRetry={() => void meetings.refetch()} />
          </div>
        ) : listState === "empty" ? (
          <>
            {/*
              THE FILTER OUTLIVES THE LIST IT EMPTIED.
              <p>Putting it on the first section heading read well and hid it
              exactly when it was needed: a window that returns nothing renders
              no headings, so the only control that could widen it disappeared
              with the rows. It has one home above the sections instead, and it
              is drawn whenever a window is narrowing anything — the
              first-minute screen is the one case with nothing to narrow.
            */}
            {narrowed && (
              <div className="mt-9">
                <FilterRow value={when} onChange={setWhen} />
              </div>
            )}
            <EmptyState when={when} onClearDate={() => setWhen(ANY_TIME)} />
          </>
        ) : (
          <div className="mt-9">
            {/*
              The filter rides the first heading, whichever that turns out to
              be. Given a row of its own it floated in the whitespace between
              the launcher and the list, attached to nothing; the reference puts
              asides on the group head, on the same baseline as its label.
            */}
            {sections.map((section, i) => (
              <Group
                key={section.key}
                heading={section.heading}
                note={section.note}
                aside={i === 0 ? <DateFilter value={when} onChange={setWhen} /> : undefined}
              >
                <Rows meetings={section.items} />
              </Group>
            ))}

            {/* Said only when it is true, and said where the list runs out. A
                page showing twenty of two hundred conversations with nothing at
                the bottom is a list somebody scrolls to the end of and
                believes. `totalElements` is on the response already. */}
            {data && data.totalElements > data.content.length && (
              <p className="text-foot text-ink-4">
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
       * THE MARGIN. Not a pane: no border, no fill, no scrollbar of its own. It
       * is the second column of this page and it stops where its content stops.
       * The spacer is the reference's, and it drops the first margin heading
       * level with the first heading in the measure.
       */}
        {showing && (
          <div className="mt-10 min-w-0 lg:mt-0">
            <div aria-hidden className="hidden h-[186px] lg:block" />
            <NowActionItems />
          </div>
        )}
      </div>
    </div>
  );
}

/** The one question the list cannot answer about itself. */
function FilterRow({
  value,
  onChange,
}: {
  value: DateWindow;
  onChange: (next: DateWindow) => void;
}) {
  return (
    <div className="mb-4 flex justify-end">
      <DateFilter value={value} onChange={onChange} />
    </div>
  );
}

/* --------------------------------- sections -------------------------------- */

/**
 * A heading, an optional note or control beside it, and the rows.
 *
 * <p>`.group` from the reference: a `t-label` heading, anything else pushed to
 * the far end of the same baseline, and 24px under the whole thing. No card and
 * no rule under the heading — the hairlines between rows are the only lines in
 * the list.
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
    <section className="mb-6">
      <div className="mb-2.5 flex items-baseline gap-3">
        <h2 className="v2-label">{heading}</h2>
        {note && <p className="text-foot text-ink-4">{note}</p>}
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
        <NowConversationRow key={meeting.id} meeting={meeting} />
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
function Masthead({ meetings, empty }: { meetings?: MeetingResponse[]; empty: boolean }) {
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
    <header className="pb-5 pt-10">
      {/* Both lines reserve their height, so the greeting arriving one tick
          after the list does not push the list down under a reader's cursor. */}
      <p className="v2-label h-4">
        {now
          ? now.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })
          : ""}
      </p>
      <h1 className="mt-2.5 h-9 text-title-l font-headline text-ink">{now ? title : ""}</h1>
      <p className="mt-2.5 max-w-[58ch] text-[0.9375rem] leading-[1.5] text-ink-3">
        {empty
          ? "Reverie becomes useful after your first conversation. Record one in the browser, or bring in a file you already have."
          : "Your newest conversations, wherever they are filed, and the list you keep for yourself."}
      </p>
      {!empty && (meetings?.length ?? 0) > 0 && <div className="h-6" />}
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
function EmptyState({ when, onClearDate }: { when: DateWindow; onClearDate: () => void }) {
  if (when.from !== null || when.to !== null) {
    return (
      <div className="mt-9">
        <p className="flex items-center gap-2 text-body font-headline text-ink">
          <CalendarDays className="h-4 w-4 text-ink-4" aria-hidden />
          {/* "from" rather than "in", and the label verbatim: it reads correctly
              for all three shapes the window can take. */}
          Nothing from {when.label}
        </p>
        <p className="mt-1.5 max-w-[58ch] text-callout leading-[1.5] text-ink-3">
          There are no conversations in this stretch of time. Your other
          conversations are still here.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" onClick={onClearDate}>
            Show any time
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={LIBRARY}>Go to Library</Link>
          </Button>
        </div>
      </div>
    );
  }

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
