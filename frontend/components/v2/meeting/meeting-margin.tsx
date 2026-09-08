"use client";

/**
 * WHAT THE MEETING IS, BESIDE WHAT IT SAID.
 *
 * <h2>Why this exists</h2>
 *
 * <p>The facts about a meeting were a dotted line under its title — date ·
 * duration · who spoke · language · tags — and the topics were a second dotted
 * line under the summary's first paragraph. Both are facts about the document
 * rather than part of it, and both sat between the reader and the first
 * sentence: the thing anybody opens this page to read began about two hundred
 * pixels down, after two rows of metadata.
 *
 * <p>So they move out of the column and into the margin, which is the same
 * composition Home and Library are on: a list with something quieter beside
 * it. See `.v2-page` in app/globals.css.
 *
 * <h2>It makes no requests</h2>
 *
 * <p>Every value here is already on the page. The meeting, the transcript's
 * speakers, the summary's sections, the action items and the insights are all
 * fetched by the page for the document; this is a second reading of them. A
 * margin that opened five requests of its own to describe what is already on
 * screen would be the most expensive part of the page.
 *
 * <h2>An index, not a second copy</h2>
 *
 * <p>Action items, decisions and risks are read and changed in the document —
 * ticked off, edited, added to, with the sentence they came from playable
 * beside them. What is here is how many there are, and a way to get to them. A
 * 380px column cannot hold a row that expands into a form, and two places to
 * tick the same box is how one of them silently stops working.
 *
 * <p>The outline is different: it is navigation by nature, so the headings are
 * here in full with their timecodes, and pressing one plays from that moment.
 *
 * <h2>Why the outline is only offered over the transcript</h2>
 *
 * <p>The approved mockup draws "Transcript Outline" beside a summary. Its
 * fixture is a ten-second recording with one topic, which is why the collision
 * is not visible in it: a real summary CONTAINS its outline, as a section of
 * the document, and every heading in that section is already a button that
 * plays from its moment. Drawing them here as well would put two controls with
 * the same accessible name and the same action about 900px apart — which is
 * not a duplicated list, it is a duplicated control.
 *
 * <p>Over the transcript there is nothing to collide with. A transcript has no
 * headings of its own, and this is the only thing that makes an hour of speech
 * navigable. That is the same rule `MeetingRail` applies to its own Outline
 * tab, for the same reason, and it was already written down there.
 */

import * as React from "react";
import {
  CalendarDays,
  Clock,
  FileText,
  GitBranch,
  Languages,
  ListChecks,
  ListTree,
  Tag,
  TriangleAlert,
  Users,
  Youtube,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime, formatDuration, timecode } from "@/lib/format";
import { languageName } from "@/lib/language";
import type { MeetingResponse, SpeakerStats, SummarySection } from "@/lib/types";

/** How the document's own sections are reached from here. */
export const ACTION_ITEMS_ANCHOR = "meeting-action-items";
export const INSIGHTS_ANCHOR = "meeting-insights";

export interface MarginCounts {
  /** False until the request has settled successfully. Nothing is claimed before. */
  ready: boolean;
  open: number;
  total: number;
}

export function MeetingMargin({
  meeting,
  speakers,
  sections,
  actions,
  decisions,
  risks,
  insightsReady,
  showOutline,
  tags,
  onSeek,
}: {
  meeting: MeetingResponse;
  /** Real diarization output. Empty for a document, or before the transcript. */
  speakers: SpeakerStats[];
  /** The summary's sections, which carry both the topics and the outline. */
  sections: SummarySection[];
  actions: MarginCounts;
  decisions: number;
  risks: number;
  /** False until the insights request has settled. */
  insightsReady: boolean;
  /**
   * Whether to draw the outline. True over the transcript only — see the note
   * above for why a summary must not get one.
   */
  showOutline: boolean;
  /**
   * The meeting's tags, as the element the page already renders.
   *
   * <p>Passed in rather than rebuilt: `MeetingTags` owns adding and removing
   * one, and a second drawing of it here would be a second control writing to
   * the same field.
   */
  tags?: React.ReactNode;
  onSeek: (seconds: number) => void;
}) {
  const isDocument = meeting.sourceType === "DOCUMENT";

  /*
   * The topics, from the outline's headings.
   *
   * <p>Keyed on `outline`, not on kind: a template may use the outline *shape*
   * for something that is not a walkthrough -- Interview pairs each question
   * with its answer that way -- and those headings are questions rather than
   * topics the meeting covered.
   */
  const topics = React.useMemo(
    () =>
      sections
        .filter((s) => s.key === "outline")
        .flatMap((s) => s.groups.map((g) => g.heading))
        .map((h) => h.trim())
        .filter(Boolean),
    [sections],
  );

  /* The outline itself, with whatever could be placed in the recording. */
  const outline = React.useMemo(
    () =>
      sections
        .filter((s) => s.kind === "outline")
        .flatMap((s) => s.groups)
        .filter((g) => g.heading.trim()),
    [sections],
  );

  const language =
    meeting.language && meeting.language.slice(0, 2).toLowerCase() !== "en"
      ? languageName(meeting.language)
      : null;

  return (
    /*
     * A COMPLEMENTARY LANDMARK, not a div.
     *
     * <p>This is an index of the document beside it, so several of its region
     * labels are deliberately the same words as headings in the document --
     * "Action items", "Decisions", "Risks". That is how a table of contents
     * works and it is not a defect, but it does mean assistive technology
     * lists each name twice: `aside` with a name is what lets somebody skip
     * the whole thing in one move, and what lets a test say which of the two
     * it means.
     */
    <aside aria-label="About this meeting" className="space-y-5">
      {/* THE FACTS. A label column and a value column, which is what a table of
          four facts wants -- they were a dotted sentence, and a sentence is for
          prose rather than for four unrelated measurements. */}
      <dl className="space-y-2.5">
        {!isDocument && meeting.durationSeconds ? (
          <Fact icon={Clock} label="Duration">
            <span className="tabular">{formatDuration(meeting.durationSeconds)}</span>
          </Fact>
        ) : null}

        {/*
          HOW MANY SPOKE, AND THEN WHO.
          <p>The count first, because that is the question -- and the names
          under it, because they are real diarization output and the line they
          replaced showed them. Nothing is drawn at all where the transcript has
          no speakers: a document has none, and one that has not been made yet
          has none, and "1 speaker" invented for either would be a claim about a
          recording nobody has heard.
        */}
        {speakers.length > 0 && (
          <Fact icon={Users} label="Speakers">
            <span className="tabular">{speakers.length}</span>
            <span className="mt-0.5 block text-foot text-ink-4">
              {speakers.map((s) => s.speaker).filter(Boolean).join(", ")}
            </span>
          </Fact>
        )}

        <Fact icon={CalendarDays} label="Date">
          <span className="tabular">{formatDateTime(meeting.createdAt)}</span>
        </Fact>

        {/*
          WHERE IT CAME FROM, where that is actually known.
          <p>The reference reads "Recorded with Reverie", and for most meetings
          that cannot be said: `sourceType` is `AUDIO` both for something
          recorded in the browser and for an MP3 somebody dragged in, and
          nothing on the payload tells the two apart. So this row is drawn for
          the two sources that ARE distinguishable and omitted otherwise, rather
          than asserting a provenance the server never sent.
        */}
        {meeting.sourceType === "YOUTUBE" ? (
          <Fact icon={Youtube} label="Source">
            {meeting.sourceUrl ? (
              <a
                href={meeting.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-2 transition-colors hover:text-ink"
              >
                YouTube
              </a>
            ) : (
              "YouTube"
            )}
          </Fact>
        ) : isDocument ? (
          <Fact icon={FileText} label="Source">
            Document
          </Fact>
        ) : null}

        {language && (
          <Fact icon={Languages} label="Language">
            {language}
          </Fact>
        )}

        {tags && (
          <Fact icon={Tag} label="Tags">
            {tags}
          </Fact>
        )}
      </dl>

      {topics.length > 0 && (
        <Region heading="Topics">
          {/* Chips, and they are the one place in this margin that gets a fill.
              A topic is a label rather than a control, so no border and no
              hover: an outline at 3:1 on something that cannot be pressed is a
              promise the page does not keep. */}
          <div className="flex flex-wrap gap-1.5">
            {topics.map((t, i) => (
              <span
                key={i}
                className="rounded-md bg-white/[0.05] px-2 py-1 text-foot text-ink-2"
              >
                {t}
              </span>
            ))}
          </div>
        </Region>
      )}

      {/* THE INDEX. Each of these says how many there are and goes to them; the
          rows themselves are in the document. Nothing is claimed before the
          request settles -- "No action items" produced by a dropped connection
          is a sentence about what a meeting asked of somebody, written from
          silence. */}
      {actions.ready && (
        <Region heading="Action items">
          <Index
            icon={ListChecks}
            anchor={actions.total > 0 ? ACTION_ITEMS_ANCHOR : undefined}
            label={
              actions.total === 0
                ? "No action items"
                : actions.open === 0
                  ? `All ${actions.total} done`
                  : `${actions.open} of ${actions.total} open`
            }
          />
        </Region>
      )}

      {insightsReady && (
        <>
          <Region heading="Decisions">
            <Index
              icon={GitBranch}
              anchor={decisions > 0 ? INSIGHTS_ANCHOR : undefined}
              label={decisions === 0 ? "No decisions" : `${decisions} recorded`}
            />
          </Region>

          <Region heading="Risks">
            <Index
              icon={TriangleAlert}
              anchor={risks > 0 ? INSIGHTS_ANCHOR : undefined}
              label={risks === 0 ? "No risks" : `${risks} noted`}
            />
          </Region>
        </>
      )}

      {showOutline && outline.length > 0 && (
        <Region heading="Transcript outline">
          <div className="-mx-2 flex flex-col">
            {outline.map((g, i) =>
              g.startSeconds != null ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSeek(g.startSeconds as number)}
                  title={`Play from ${timecode(g.startSeconds)}`}
                  className="flex items-baseline gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-press ease-soft hover:bg-white/[0.035]"
                >
                  <ListTree className="mt-px h-3.5 w-3.5 shrink-0 text-ink-5" aria-hidden />
                  <span className="v2-page-meta min-w-0 flex-1 text-ink-2">{g.heading}</span>
                  <span className="tabular shrink-0 font-mono text-foot text-ink-4">
                    {timecode(g.startSeconds)}
                  </span>
                </button>
              ) : (
                /*
                 * Shown, but inert.
                 *
                 * <p>Hiding an unplaced heading would make this list disagree
                 * with the outline in the document, leaving a reader to wonder
                 * which topics went missing. Sending it to 0:00 or to the
                 * nearest heading that does have a time is worse: a link that
                 * lands on the wrong minute is indistinguishable from a
                 * transcript that contradicts its own summary.
                 */
                <p
                  key={i}
                  title="This topic could not be placed in the transcript"
                  className="flex items-baseline gap-2.5 px-2 py-1.5"
                >
                  <ListTree className="mt-px h-3.5 w-3.5 shrink-0 text-ink-5" aria-hidden />
                  <span className="v2-page-meta min-w-0 flex-1 text-ink-4">{g.heading}</span>
                </p>
              ),
            )}
          </div>
        </Region>
      )}
    </aside>
  );
}

/** One labelled fact. `dt`/`dd`, because that is what a label and a value are. */
function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2.5">
      <Icon className="mt-px h-3.5 w-3.5 shrink-0 text-ink-5" aria-hidden />
      <dt className="v2-page-meta w-[4.75rem] shrink-0 text-ink-4">{label}</dt>
      <dd className="v2-page-meta min-w-0 flex-1 text-ink-2">{children}</dd>
    </div>
  );
}

/**
 * A region of the margin: a quiet heading, a hairline over it, and its content.
 *
 * <p>The rule is above rather than below, so the last region does not end on a
 * line with nothing under it — which is the same reason a list puts its
 * hairlines between rows rather than after each.
 */
function Region({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-4">
      <h2 className="v2-page-sub mb-2.5 font-headline text-ink">{heading}</h2>
      {children}
    </section>
  );
}

/**
 * How many of something there are, and the way to it.
 *
 * <p>A button only when there is somewhere to go. "No decisions" is a fact
 * rather than a destination, and a control that scrolls to a section which is
 * not on the page is a control that appears to do nothing.
 */
function Index({
  icon: Icon,
  label,
  anchor,
}: {
  icon: typeof ListChecks;
  label: string;
  anchor?: string;
}) {
  const body = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-ink-4" aria-hidden />
      <span className="v2-page-meta">{label}</span>
    </>
  );
  if (!anchor) {
    return <p className="flex items-center gap-2.5 text-ink-3">{body}</p>;
  }
  return (
    <a
      href={`#${anchor}`}
      className={cn(
        "-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1 text-ink-2",
        "transition-colors duration-press ease-soft hover:bg-white/[0.035] hover:text-ink",
      )}
    >
      {body}
    </a>
  );
}
