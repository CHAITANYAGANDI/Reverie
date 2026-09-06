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
 */

import * as React from "react";
import Link from "next/link";
import { FileAudio, FileText, Youtube } from "lucide-react";
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

export function NowConversationRow({ meeting }: { meeting: MeetingResponse }) {
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
  const facts: React.ReactNode[] = [
    <span key="at" className="tabular font-mono">
      {new Date(meeting.createdAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })}
    </span>,
  ];
  if (meeting.durationSeconds) {
    facts.push(<span key="len">{formatDuration(meeting.durationSeconds)}</span>);
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

  return (
    <li>
      <Link
        href={`/meetings/${meeting.id}`}
        /* The bleed is `sm:` and up. It exists so the hover fill and the
           hairline run a little past the text rather than stopping at it, and
           it needs slack on both sides to do that — at 390 the measure is
           already flush against the page padding, so ten pixels each way is
           ten pixels of horizontal scroll. */
        className="block rounded-md py-3 transition-colors duration-press ease-soft hover:bg-white/[0.035] sm:-mx-2.5 sm:px-2.5"
      >
        <span className="flex items-baseline gap-2.5">
          <Icon className="h-[13px] w-[13px] shrink-0 translate-y-px text-ink-5" aria-hidden />
          <span className="min-w-0 truncate text-title-3 font-headline text-ink">
            {meeting.title}
          </span>
        </span>
        <span className="mt-[5px] flex flex-wrap items-center text-foot text-ink-3">
          {facts.map((fact, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Dot />}
              {fact}
            </React.Fragment>
          ))}
        </span>
      </Link>
    </li>
  );
}
