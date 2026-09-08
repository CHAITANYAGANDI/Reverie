"use client";

/**
 * ONE CONVERSATION, AS A ROW RATHER THAN A CARD.
 *
 * <h2>What this replaced</h2>
 *
 * <p>A rounded bordered card with a 32px filled circle holding an icon, a
 * status pill beside the title, and a progress bar that grew the card by sixty
 * pixels while it ran. Twenty of those stacked with gaps between them is the
 * shape the V2 study set out to remove: every row announcing itself as an
 * object, so the list has no rhythm and the eye has nowhere to travel.
 *
 * <p>The rule V2 replaces it with is that hierarchy comes from space,
 * alignment, type and a hairline — and a surface is spent only where it does
 * something. A row in a list does nothing with a border that a 1px rule between
 * rows does not do more quietly.
 *
 * <p>So: a title, a metadata line, and a hairline above every row but the
 * first. The hover surface is the only fill, it is 3.5% white, and it is there
 * because the row is a link and a link should say so under the pointer.
 *
 * <h2>State goes in the metadata line</h2>
 *
 * <p>Not into a right-hand column and not into a pill. A processing row is then
 * exactly as tall as a finished one, which is what lets twenty of them read as
 * a list. The old row varied by about sixty pixels depending on status.
 *
 * <p>Everything shown is already on `MeetingResponse` or already streaming to
 * the row. Nothing here fetches a summary to put a sentence under the title:
 * that would be one request per row, and the reference's prose is not in the
 * list payload.
 *
 * <h2>Two sizes, and why the markup branches</h2>
 *
 * <p>`size="home"` is the same row with a glyph column: a 16px glyph, a 15px
 * title over 12px metadata, and 14px of air above and below. It began at
 * 24/20/16 with 28px of padding, measured off an approved reference that
 * turned out to be a ~1.2x capture -- a 114px row that read as a card without
 * a border -- and came down in two steps to a ~72px one. What still separates
 * it from the archive's row is the glyph column, the indent that creates, and
 * a chevron at the trailing edge.
 *
 * <p>The two sizes also disagree about the clock, which is the one FACT that
 * differs rather than a treatment of the same fact. Home does not show a time
 * at all; Library reads it first in the metadata line. See `facts` below.
 *
 * <p>Everything that decides WHAT a row says is shared: the icon, the live
 * status subscription, the facts line and its dots, the failure text. Two
 * drawings of a conversation is how a status pill ends up on one screen and not
 * the other, and none of that is duplicated below.
 *
 * <p>The markup of the two lines is not shared, and deliberately. At list size
 * the metadata sits at the row's own left edge, under the glyph; at Home's it
 * is indented onto the title's axis, inside the glyph's column. That is a
 * different tree rather than different classes on one tree, and the attempt to
 * express both with `display: contents` silently moved Library's metadata onto
 * its title's baseline. `"list"` is the default, so every caller but Home gets
 * the branch it already had, character for character.
 */

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Clock, FileAudio, FileText, Youtube } from "lucide-react";
import { useLiveMeetingStatus } from "@/components/processing-row";
import { stageText } from "@/lib/processing-stages";
import { formatDuration, isTerminal } from "@/lib/format";
import type { MeetingResponse } from "@/lib/types";

/** The separator the whole product uses between metadata facts. */
function Dot() {
  return (
    <span aria-hidden className="px-1.5 text-ink-5">
      ·
    </span>
  );
}

export function NowConversationRow({
  meeting,
  action,
  size = "list",
}: {
  meeting: MeetingResponse;
  /**
   * A control for this row, drawn at its trailing edge.
   *
   * <p>For the one list that has one: a folder's meetings carry "Remove from
   * folder". Outside the link, because a menu inside an anchor is neither valid
   * nor clickable, and absolutely positioned so a row with a menu is exactly as
   * tall as one without — which is the whole reason this row reads as a list.
   *
   * <p>Optional and unused on Now, so that page is unchanged. Library, a folder
   * and Now share one drawing of this row on purpose: two drawings is how a
   * status pill ends up on one screen and not the other.
   */
  action?: React.ReactNode;
  /**
   * How large the row is drawn. See the note above.
   *
   * <p>`"list"` is the default, so Library, a folder and every other caller is
   * untouched by Home's correction.
   */
  size?: "list" | "home";
}) {
  const big = size === "home";
  const Icon =
    meeting.sourceType === "YOUTUBE"
      ? Youtube
      : meeting.sourceType === "DOCUMENT"
        ? FileText
        : FileAudio;

  // Live, because Now does not poll its list. Terminal meetings open no
  // subscription — see the hook.
  const { status, reported } = useLiveMeetingStatus(meeting.id, meeting.status);
  const processing = !isTerminal(status);
  const failed = status === "FAILED";

  /*
   * The facts, in the order the reference reads them. Built as a list so the
   * dots fall between what is actually there rather than around gaps — a row
   * with no duration must not render "09:12 · · Processing".
   */
  const at = new Date(meeting.createdAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  const facts: React.ReactNode[] = [];
  /*
   * FIRST IN THE LINE, AND ONLY AT LIST SIZE.
   *
   * <p>Home draws no clock. It had one at the far end of the row, opposite the
   * title, on the reasoning that twenty rows with one time each give the eye a
   * column to run down -- and on a real screen that column was the loudest
   * thing in the list, in mono, competing with the titles for a fact almost
   * nobody came to the page for. The day heading above the group already says
   * which day, and the rows are in order within it.
   *
   * <p>Library keeps it. There the row is a search result: the archive is
   * ordered and filtered, and the time is part of identifying which of two
   * meetings called Product Weekly this one is. It reads beside the duration
   * at 11.5px, where it has always been.
   */
  if (!big) {
    facts.push(
      <span key="at" className="tabular font-mono">
        {at}
      </span>,
    );
  }
  if (meeting.durationSeconds) {
    /* A clock beside it on Home, which is what the reference draws. Decoration
       rather than data, so `aria-hidden` -- "32 min" already says what it is.
       Not at list size, where the metadata line is 11.5px and a glyph in it
       would be noise rather than an anchor. */
    facts.push(
      big ? (
        <span key="len" className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0 text-ink-5" aria-hidden />
          {formatDuration(meeting.durationSeconds)}
        </span>
      ) : (
        <span key="len">{formatDuration(meeting.durationSeconds)}</span>
      ),
    );
  }
  if (meeting.tags.length > 0) {
    facts.push(<span key="tags">{meeting.tags.slice(0, 2).join(", ")}</span>);
  }
  if (processing) {
    /* The state and then the stage, which is what the reference row reads:
       "Processing · Transcribing". No percentage — the server reports a stage,
       and the bar this replaces derived its number from *which* stage it was
       in, which is a figure nobody measured. */
    facts.push(
      <span key="state" className="text-ink-2">
        Processing
      </span>,
      <span key="stage" className="text-ink-2">
        {stageText({ status, reported })}
      </span>,
    );
  } else if (failed) {
    /* What the server actually said, and the bare status when it said nothing.
       "Failed" is a fact about the job; a cause invented to fill the line would
       send somebody looking for a problem that may not be theirs. */
    facts.push(
      <span key="state" className="text-danger">
        {meeting.errorMessage?.trim() || "Failed"}
      </span>,
    );
  }

  const meta = facts.length > 0 && (
    <span
      data-row-meta
      className={
        big
          ? "v2-home-meta mt-2 flex flex-wrap items-center text-ink-3"
          : "mt-[5px] flex flex-wrap items-center text-foot text-ink-3"
      }
    >
      {facts.map((fact, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Dot />}
          {fact}
        </React.Fragment>
      ))}
    </span>
  );

  return (
    <li className="relative">
      <Link
        href={`/meetings/${meeting.id}`}
        /* The bleed is `sm:` and up. It exists so the hover fill and the
           hairline run a little past the text rather than stopping at it, and
           it needs slack on both sides to do that — at 390 the measure is
           already flush against the page padding, so ten pixels each way is
           ten pixels of horizontal scroll. */
        className={
          "block rounded-md transition-colors duration-press ease-soft hover:bg-white/[0.035]" +
          /* 14px above and below at Home's size, for a ~72px row. It was 28
             and a 114px row, off the magnified reference. */
          (big ? " py-3.5 sm:-mx-3 sm:px-3" : " py-3 sm:-mx-2.5 sm:px-2.5") +
          // Room for the control, so a long title runs out before it rather
          // than under it. Only when there is one.
          (action ? " pr-9 sm:pr-9" : "")
        }
      >
        {big ? (
          /* HOME. The glyph gets a column: 16px, 16px of gap, and the title
             and its metadata both begin on the axis that leaves -- 40px in
             from the row's content edge. It was 24px and 70px, which at the
             smaller type left the titles floating a long way from their
             glyphs. */
          <span className="flex items-start gap-4 pl-2">
            <Icon className="h-4 w-4 shrink-0 translate-y-px text-ink-4" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2.5">
                <span
                  data-row-title
                  className="v2-home-title min-w-0 flex-1 truncate font-headline text-ink"
                >
                  {meeting.title}
                </span>
                {/* THE WAY IN, and nothing else out here now.
                    <p>`shrink-0` against the title's `flex-1 truncate`, so a
                    long name runs out of room before it runs under the
                    chevron. It is the only thing at this end: the clock that
                    used to sit beside it is gone, and at list size the time
                    reads in the metadata line where it always did. */}
                <ChevronRight
                  className="h-4 w-4 shrink-0 translate-y-px text-ink-4"
                  aria-hidden
                />
              </span>
              {meta}
            </span>
          </span>
        ) : (
          /* THE ARCHIVE'S ROW, unchanged: the glyph on the title's baseline,
             and the metadata at the row's own left edge underneath it. */
          <>
            <span className="flex items-baseline gap-2.5">
              <Icon className="h-[13px] w-[13px] shrink-0 translate-y-px text-ink-5" aria-hidden />
              <span
                data-row-title
                className="min-w-0 flex-1 truncate text-title-3 font-headline text-ink"
              >
                {meeting.title}
              </span>
            </span>
            {meta}
          </>
        )}
      </Link>
      {action && <div className="absolute right-0 top-3">{action}</div>}
    </li>
  );
}
