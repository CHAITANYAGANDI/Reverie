"use client";

/**
 * WHAT IT IS BUILT ON — the citations, as evidence rather than as chips.
 *
 * <h2>What this replaces</h2>
 *
 * <p>Two drawings of the same data. The workspace chat had `SourceList`: a
 * meeting title and up to four bare timecodes per meeting, so the answer was
 * grounded in "Product Weekly · 05:02 · 11:38" — a reference the reader has to
 * follow to learn anything. The meeting chat had a row of round `Quote` pills
 * with the passage hidden in a `title` attribute, which is a tooltip nobody
 * hovers.
 *
 * <p>The references put the passage itself on screen: a left rule, the sentence
 * that was actually used, and where it came from underneath. The citation
 * already carries the text — it was being thrown away.
 *
 * <h2>Only fields that exist</h2>
 *
 * <p>`Citation` is `{ chunkIndex, start?, end?, text, meetingId?, meetingTitle? }`
 * and that is the whole of it. The references show a speaker's name against
 * every quote; there is no speaker on a citation, so none is drawn. A date is
 * drawn only where the caller can supply one from a list it already has — see
 * `meetingDates` — never by fetching a meeting per citation, which is the N+1
 * this rail must not become.
 *
 * <h2>Navigation is the existing navigation</h2>
 *
 * <p>Two behaviours, unchanged from the two components this replaces. A
 * workspace citation is a link to `/meetings/{id}?t={start}`, which is how the
 * archive's deep link has always worked. A meeting citation calls `onSeek`, so
 * the transcript and the player move to the cited second without leaving the
 * page. Passing `onSeek` is what selects the second behaviour.
 */

import * as React from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { timecode } from "@/lib/format";
import { relativeDay } from "@/lib/days";
import { cn } from "@/lib/utils";
import type { Citation } from "@/lib/types";

/** How many passages are drawn before the rest go behind a disclosure. */
export const EVIDENCE_SHOWN = 4;

interface Passage {
  key: string;
  text: string;
  start: number | null;
  meetingId: string | null;
  meetingTitle: string | null;
}

/**
 * The distinct passages, in the order the answer cited them.
 *
 * <p>Deduplicated on meeting + second + text, because the same chunk comes back
 * more than once when an answer leans on it twice — and two identical quotes
 * under one answer reads as the model repeating itself rather than as one
 * sentence used twice.
 *
 * <p>Order is the citation order, not grouped by meeting. `SourceList` grouped,
 * which was right for a list of titles and wrong for a list of quotes: the
 * passages are read top to bottom against an answer that used them in sequence.
 * Where several belong to one meeting the title simply repeats, which is what
 * the references draw.
 */
export function passagesOf(citations: Citation[] | undefined): Passage[] {
  if (!citations) return [];
  const seen = new Set<string>();
  const out: Passage[] = [];
  for (const c of citations) {
    const text = (c.text ?? "").trim();
    if (!text) continue;
    const key = `${c.meetingId ?? ""}|${c.start ?? ""}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      text,
      start: c.start ?? null,
      meetingId: c.meetingId ?? null,
      meetingTitle: (c.meetingTitle ?? "").trim() || null,
    });
  }
  return out;
}

export function AskEvidence({
  citations,
  onSeek,
  meetingDates,
  className,
}: {
  citations?: Citation[];
  /**
   * Jump to the cited second in the transcript on this page.
   *
   * <p>Supplied by the meeting chat and by nothing else. Its presence is what
   * makes a passage a button rather than a link: inside one meeting the cited
   * moment is on screen, and navigating to a deep link would reload the page
   * the reader is already reading.
   */
  onSeek?: (seconds: number) => void;
  /**
   * When each cited meeting happened, keyed by id.
   *
   * <p>Optional, and only ever from a list the caller already has — the
   * workspace chat fetches a hundred meetings for its context picker, so the
   * dates are free. A citation whose meeting is not in that list simply shows
   * no date. Nothing here fetches.
   */
  meetingDates?: Map<string, string>;
  className?: string;
}) {
  const passages = React.useMemo(() => passagesOf(citations), [citations]);
  const [expanded, setExpanded] = React.useState(false);

  if (passages.length === 0) return null;

  const shown = expanded ? passages : passages.slice(0, EVIDENCE_SHOWN);
  const hidden = passages.length - shown.length;

  return (
    <section className={cn("space-y-3", className)} aria-label="What it is built on">
      <h3 className="v2-page-meta font-headline text-ink-3">What it is built on</h3>

      <div className="space-y-3.5">
        {shown.map((p) => (
          <Passage key={p.key} passage={p} onSeek={onSeek} meetingDates={meetingDates} />
        ))}
      </div>

      {/*
        THE REST, REACHABLE. The references say "Seven more passages were read
        and not quoted", which is a claim about retrieval this client cannot
        make -- it is only ever handed the citations the answer used. What it
        can say truthfully is how many of those are not on screen, and open
        them. Throwing the remainder away to keep the rail short would lose
        navigation to real evidence.
      */}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1.5 text-foot text-ink-3 transition-colors hover:text-ink-2"
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          {hidden} more {hidden === 1 ? "source" : "sources"}
        </button>
      )}
    </section>
  );
}

/**
 * One passage: the sentence, then where it is from.
 *
 * <p>`.v2-note` is the product's evidence treatment — one 1px stroke on the
 * left edge and text, no fill and no radius. The same device the transcript
 * margin and the summary's key quotations use, so all three read as one idea.
 */
function Passage({
  passage,
  onSeek,
  meetingDates,
}: {
  passage: Passage;
  onSeek?: (seconds: number) => void;
  meetingDates?: Map<string, string>;
}) {
  const when = passage.meetingId ? meetingDates?.get(passage.meetingId) : undefined;

  /* Meeting title, date and timecode -- each only where it exists. A citation
     with none of them is still worth drawing: the sentence is the evidence. */
  const facts = [
    passage.meetingTitle,
    when ? relativeDay(when) : null,
    passage.start != null ? timecode(passage.start) : null,
  ].filter(Boolean) as string[];

  const body = (
    <>
      {/* The serif, because a passage is verbatim speech -- the same face the
          transcript sets it in, and the same reason. */}
      <span className="v2-read block text-[0.9375rem] leading-[1.5] text-ink-2">
        &ldquo;{passage.text}&rdquo;
      </span>
      {facts.length > 0 && (
        <span className="mt-1.5 block text-foot text-ink-4">
          {facts.map((f, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <span aria-hidden className="px-1.5 text-ink-5">
                  ·
                </span>
              )}
              <span className={i === facts.length - 1 && passage.start != null ? "tabular font-mono" : undefined}>
                {f}
              </span>
            </React.Fragment>
          ))}
        </span>
      )}
    </>
  );

  // In a meeting, the cited moment is on this page: seek to it.
  if (onSeek && passage.start != null) {
    return (
      <button
        type="button"
        onClick={() => onSeek(passage.start as number)}
        title={`Play from ${timecode(passage.start)}`}
        className="v2-note block w-full text-left transition-colors hover:border-l-brand-text"
      >
        {body}
      </button>
    );
  }

  // Across the workspace, it is somewhere else: the deep link that has always
  // opened a meeting at a second.
  if (passage.meetingId) {
    return (
      <Link
        href={
          passage.start != null
            ? `/meetings/${passage.meetingId}?t=${passage.start}`
            : `/meetings/${passage.meetingId}`
        }
        className="v2-note block transition-colors hover:border-l-brand-text"
      >
        {body}
      </Link>
    );
  }

  return <div className="v2-note">{body}</div>;
}
