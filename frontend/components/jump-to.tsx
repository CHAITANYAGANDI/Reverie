"use client";

/**
 * One way into a long recording: topics, voices and marks, in one list.
 *
 * <h2>What it is made of, and what it refuses to make up</h2>
 *
 * <p>`26-meeting-outline.png` composes this as a command palette over the
 * meeting. Everything in it here comes from data the meeting already has:
 *
 * <ul>
 *   <li><b>Topics</b> are the summary's `outline` groups — the same derivation
 *       components/outline-nav uses, headings only. A group carries
 *       `startSeconds` when the ai-service could place its opening line in the
 *       transcript, and nothing when it could not.</li>
 *   <li><b>Voices</b> come from the transcript's own segments, so every name
 *       listed demonstrably said something and every one has a real first
 *       occurrence to jump to. Not from the meeting's participants: an invited
 *       list is a list of people who may never have spoken.</li>
 *   <li><b>Marks</b> are the real moments — highlights, bookmarks, notes and
 *       reactions — at their own `startSeconds`.</li>
 * </ul>
 *
 * <p>An unanchored topic is shown and inert, which is the rule
 * components/outline-nav already established: hiding it makes this list
 * disagree with the Summary tab, and sending it to 0:00 or to the nearest
 * anchored heading lands the reader on the wrong minute with no way to tell
 * whether the transcript or the summary is the broken one.
 *
 * <p>Nothing here is cross-meeting. The reference set's Memory and ledger
 * screens are a different product; this is a table of contents.
 */

import * as React from "react";
import { ListTree } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { timecode } from "@/lib/format";
import { KIND_LABEL } from "@/lib/moments";
import type { SummarySection, TranscriptMoment, TranscriptSegment } from "@/lib/types";
import { cn } from "@/lib/utils";

/** A topic, with the time it starts if the summary could place it. */
export interface JumpTopic {
  heading: string;
  at: number | null;
  /** Marks inside this topic's span. Omitted when it cannot be bounded. */
  marks: number | null;
}

/** Somebody who actually speaks, and where they first do. */
export interface JumpVoice {
  name: string;
  at: number;
}

/**
 * The summary's outline headings, in the order the summary gives them.
 *
 * <p>Exported so the tests can check the derivation without a dialog, and so
 * it stays the single definition of "what counts as a topic".
 */
export function topicsFrom(
  sections: SummarySection[],
  moments: TranscriptMoment[],
): JumpTopic[] {
  const groups = sections
    .filter((s) => s.kind === "outline")
    .flatMap((s) => s.groups)
    .filter((g) => g.heading.trim());

  /*
   * MARK COUNTS, ONLY WHERE THEY ARE DERIVABLE.
   *
   * <p>A topic's span runs from its own start to the next *anchored* topic's,
   * which needs the anchored ones in time order — the summary's order is the
   * document's, and a template is free to write them in any other. The last
   * anchored topic runs to the end of the recording.
   *
   * <p>An unanchored topic has no span at all, so it gets no count rather than
   * a zero: "0 marks" asserts that nobody marked anything in it, which is not
   * something an unplaceable heading can say.
   */
  const bounds = groups
    .map((g) => g.startSeconds)
    .filter((s): s is number => s != null)
    .sort((a, b) => a - b);

  return groups.map((g) => {
    const at = g.startSeconds ?? null;
    if (at == null) return { heading: g.heading, at: null, marks: null };
    const next = bounds.find((b) => b > at);
    const count = moments.filter(
      (m) => m.startSeconds >= at && (next == null || m.startSeconds < next),
    ).length;
    return { heading: g.heading, at, marks: count > 0 ? count : null };
  });
}

/**
 * Everyone the transcript attributes a line to, and their first line.
 *
 * <p>Segments rather than `speakers[]`: a rename rewrites the transcript, so
 * the segments carry whatever the reader has corrected the names to, and a
 * name found here is guaranteed to have a segment to jump to. First appearance
 * order, which is the order a reader met them in.
 */
export function voicesFrom(segments: TranscriptSegment[]): JumpVoice[] {
  const first = new Map<string, number>();
  for (const s of segments) {
    const name = (s.speaker || "").trim();
    if (!name) continue;
    const at = s.start ?? 0;
    const seen = first.get(name);
    if (seen == null || at < seen) first.set(name, at);
  }
  return Array.from(first, ([name, at]) => ({ name, at }));
}

/** Initials, for the avatar the reference draws beside a name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0];
  return letters.toUpperCase();
}

/** What a mark says in a one-line list. Its own words first. */
function markText(m: TranscriptMoment): string {
  const body = (m.body || "").trim();
  if (body) return body;
  const quote = (m.quote || "").trim();
  return quote ? `“${quote}”` : KIND_LABEL[m.kind];
}

/** One row's worth of "what happens when this is chosen". */
type Row = { key: string; at: number };

export function JumpTo({
  open,
  onOpenChange,
  sections,
  segments,
  moments,
  onJump,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  sections: SummarySection[];
  segments: TranscriptSegment[];
  moments: TranscriptMoment[];
  /**
   * The meeting's own seek. It switches to the transcript when it has to and
   * seeks once the audio can accept it — see `playFrom` on the meeting page.
   * One pipeline, so a topic, a citation and a timecode all land the same way.
   */
  onJump: (seconds: number) => void;
}) {
  const topics = React.useMemo(() => topicsFrom(sections, moments), [sections, moments]);
  const voices = React.useMemo(() => voicesFrom(segments), [segments]);
  const marks = React.useMemo(
    () => [...moments].sort((a, b) => a.startSeconds - b.startSeconds),
    [moments],
  );

  /*
   * The keyboard's roster: every row that actually goes somewhere, in the
   * order they are drawn. Unanchored topics are deliberately absent — arrowing
   * onto a row that cannot do anything is a dead key press.
   */
  const rows = React.useMemo<Row[]>(
    () => [
      ...topics
        .filter((t): t is JumpTopic & { at: number } => t.at != null)
        .map((t) => ({ key: `topic:${t.heading}:${t.at}`, at: t.at })),
      ...voices.map((v) => ({ key: `voice:${v.name}`, at: v.at })),
      ...marks.map((m) => ({ key: `mark:${m.id}`, at: m.startSeconds })),
    ],
    [topics, voices, marks],
  );

  const [active, setActive] = React.useState(0);
  // Back to the top each time it opens. The list is short and the previous
  // position is not something anybody remembers between two openings.
  React.useEffect(() => {
    if (open) setActive(0);
  }, [open]);

  function go(at: number) {
    onOpenChange(false);
    onJump(at);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (rows.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      // Clamps rather than wraps, as the search box does: holding a key down
      // should stop at the end of a list, not come back round to the top and
      // open the wrong thing.
      setActive((i) => Math.max(0, Math.min(e.key === "ArrowDown" ? i + 1 : i - 1, rows.length - 1)));
      return;
    }
    // No Enter branch: focus is on the active row, so the button activates
    // itself. Handling it here as well called `go` twice.
  }

  const nothing = topics.length === 0 && voices.length === 0 && marks.length === 0;
  const index = (key: string) => rows.findIndex((r) => r.key === key);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[min(46rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0"
        onKeyDown={onKeyDown}
      >
        <DialogHeader className="flex-row items-center gap-2 border-b px-4 py-3 text-left">
          <ListTree className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
          <DialogTitle className="text-title-3 font-headline">Jump to</DialogTitle>
          <DialogDescription className="sr-only">
            Topics, voices and marks in this meeting. Choose one to move the transcript and
            the recording to it.
          </DialogDescription>
        </DialogHeader>

        {nothing ? (
          /*
           * One sentence rather than three empty headings. A meeting with no
           * outline, no transcript and no marks has nothing to navigate, and
           * saying so once is the whole truth of it.
           */
          <p className="px-4 py-10 text-center text-callout text-ink-3">
            Nothing to jump to yet.
          </p>
        ) : (
          <div
            role="listbox"
            aria-label="Jump to"
            className="max-h-[min(30rem,calc(100dvh-12rem))] overflow-y-auto py-2"
          >
            {topics.length > 0 && (
              <Section label="Topics">
                {topics.map((t, i) =>
                  t.at == null ? (
                    /* Shown, and inert. See the note at the top of this file. */
                    <p
                      key={`u${i}`}
                      className="px-4 py-1.5 text-body text-ink-4"
                      title="This topic could not be placed in the transcript"
                    >
                      {t.heading}
                    </p>
                  ) : (
                    <Option
                      key={`t${i}`}
                      selected={index(`topic:${t.heading}:${t.at}`) === active}
                      onSelect={() => go(t.at as number)}
                      lead={<Time at={t.at} />}
                      title={t.heading}
                      trail={t.marks == null ? null : `${t.marks} ${t.marks === 1 ? "mark" : "marks"}`}
                    />
                  ),
                )}
              </Section>
            )}

            {voices.length > 0 && (
              <Section label="Voices">
                {voices.map((v) => (
                  <Option
                    key={v.name}
                    selected={index(`voice:${v.name}`) === active}
                    onSelect={() => go(v.at)}
                    lead={
                      <span
                        aria-hidden
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.06] text-cap font-headline text-ink-3"
                      >
                        {initials(v.name)}
                      </span>
                    }
                    title={v.name}
                    trail="jump to first"
                  />
                ))}
              </Section>
            )}

            {marks.length > 0 && (
              <Section label="Marks">
                {marks.map((m) => (
                  <Option
                    key={m.id}
                    selected={index(`mark:${m.id}`) === active}
                    onSelect={() => go(m.startSeconds)}
                    lead={<Time at={m.startSeconds} />}
                    title={markText(m)}
                    trail={KIND_LABEL[m.kind].toLowerCase()}
                  />
                ))}
              </Section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5 first:pt-0">
      <p className="v2-label px-4 pb-1 pt-2 text-ink-3">{label}</p>
      {children}
    </div>
  );
}

function Time({ at }: { at: number }) {
  return (
    <span className="tabular w-12 shrink-0 font-mono text-cap text-ink-4">{timecode(at)}</span>
  );
}

/**
 * One choosable row.
 *
 * <p>`role="option"` inside the listbox above, and a real button so it is
 * reachable by pointer and by tab as well as by the arrow keys.
 */
function Option({
  selected,
  onSelect,
  lead,
  title,
  trail,
}: {
  selected: boolean;
  onSelect: () => void;
  lead: React.ReactNode;
  title: string;
  trail: string | null;
}) {
  const ref = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    /*
     * FOCUS FOLLOWS THE ARROWS, and that is not decoration.
     *
     * <p>Measured at 1440: the dialog opened with Radix's own autofocus on the
     * first row and the arrow keys moved a separate `active` highlight, so one
     * row wore a focus ring and a different one was highlighted. Two selection
     * indicators disagreeing is worse than either alone, and the ring was the
     * one that lied about what Enter would do.
     *
     * <p>Moving real focus also means the row is announced when it is arrowed
     * to, and that Enter and Space activate it natively -- which is why this
     * component has no Enter handler of its own.
     */
    if (!selected) return;
    ref.current?.scrollIntoView({ block: "nearest" });
    ref.current?.focus({ preventScroll: true });
  }, [selected]);

  return (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-1.5 text-left transition-colors",
        selected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
      )}
    >
      {lead}
      <span className="min-w-0 flex-1 truncate text-body text-ink">{title}</span>
      {trail && <span className="shrink-0 text-cap text-ink-4">{trail}</span>}
    </button>
  );
}
