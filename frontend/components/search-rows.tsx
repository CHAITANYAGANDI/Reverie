"use client";

/**
 * One row of the search panel, per kind of thing found.
 *
 * <h2>Why they are here and not in the dialog</h2>
 *
 * <p>Seven shapes of row, each with its own second line of metadata, is most of
 * the panel's code and none of its behaviour. The dialog owns the query, the
 * selection and the keyboard; this owns what a decision looks like. Splitting
 * them is what keeps the dialog readable enough to reason about the arrow keys
 * in.
 *
 * <h2>The shape every row shares</h2>
 *
 * <p>A glyph, a first line that is the thing itself, and a second line of
 * metadata in `--ink-4`. The reference screenshots are dense — twelve results
 * in the height of four cards — and that density comes from exactly this: one
 * indent, two type sizes, no borders, no chips, no card per result.
 *
 * <p><b>No mark on any of them.</b> The Reverie AI orb appears on the Ask row
 * and nowhere else in this panel. It means "you are entering Reverie's
 * intelligence", not "a model was involved in producing this" — a transcript
 * passage was found by Postgres, and decorating it with the orb would spend the
 * one mark that has a meaning on the one place it does not apply. See the
 * placement note in `components/v2/reverie-ai-mark`.
 *
 * <h2>Metadata is only ever what came back</h2>
 *
 * <p>Every field on these rows is a field the API returns. Where the reference
 * shows something Reverie does not store, the row is shorter rather than
 * invented — `MeetingHit` carries no folder and no speaker count, so a meeting
 * reads "date · duration · N mentions" and not "date · duration · folder · 3
 * voices". A `Reversed` badge on a decision would be worse still: nothing in
 * `meeting_insights` records that a decision was ever revisited.
 */

import * as React from "react";
import {
  FileAudio,
  Folder,
  Gavel,
  Mic,
  Quote,
  Search,
  Settings,
  Tag,
  Upload,
  User,
} from "lucide-react";
import { ReverieAiMark } from "@/components/v2/reverie-ai-mark";
import { Marked } from "@/components/marked-text";
import { snippet } from "@/lib/search";
import { formatDate, formatDuration, timecode } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SearchAction, SearchRow } from "@/lib/search-rows";

/** `·` between facts, and nothing where a fact is missing. */
function Meta({ parts }: { parts: (string | null | undefined)[] }) {
  const real = parts.filter((p): p is string => Boolean(p && p.trim()));
  if (real.length === 0) return null;
  return (
    <span className="mt-0.5 block truncate text-foot text-ink-4">
      {real.join(" · ")}
    </span>
  );
}

export interface SearchRowViewProps {
  row: SearchRow;
  /** The free-text term, for marking. Never the raw input — filters are stripped. */
  query: string;
  selected: boolean;
  onHover: () => void;
  onActivate: () => void;
}

/**
 * A row, as a button in a list item.
 *
 * <p>`aria-selected` and an id, because the panel is a listbox the input owns
 * through `aria-activedescendant`: the focus never leaves the text field, so the
 * only way a reader is told which result is current is this attribute on this
 * element.
 *
 * <p>The selected treatment is a raised surface and nothing else — no accent
 * fill, no left bar. At the density these rows sit at, a brand-coloured
 * selection on one of twelve rows reads as a badge on that result rather than as
 * where the keyboard is.
 */
export function SearchRowView({
  row,
  query,
  selected,
  onHover,
  onActivate,
}: SearchRowViewProps) {
  return (
    <li role="none">
      <button
        type="button"
        id={row.key}
        role="option"
        aria-selected={selected}
        onMouseEnter={onHover}
        onClick={onActivate}
        /*
         * `-1`: the input keeps focus for the whole life of the dialog, so
         * these must not be in the tab order — Tab is the filter-completion
         * key, and a panel of twelve tabbable buttons would make it useless.
         * They are reachable by arrow key, which is what a listbox promises.
         */
        tabIndex={-1}
        className={cn(
          "flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors duration-press ease-soft",
          selected ? "bg-surface-raised" : "hover:bg-surface-hover",
        )}
      >
        <Body row={row} query={query} />
        {/*
          WHAT ENTER WILL DO, on the row it will do it to.
          <p>From the reference, and it earns its place: the selected row is a
          shade of grey away from the others, and this says that shade means
          "press Return". Hidden from assistive technology — `aria-selected` is
          the same fact, stated in the way a screen reader already reads.
        */}
        {selected && (
          <kbd
            aria-hidden
            className="mt-0.5 flex h-4 min-w-4 shrink-0 items-center justify-center rounded border border-line px-1 font-sans text-[0.625rem] leading-none text-ink-4"
          >
            ↵
          </kbd>
        )}
      </button>
    </li>
  );
}

function Glyph({ icon: Icon }: { icon: React.ComponentType<{ className?: string }> }) {
  return <Icon className="mt-[0.15rem] h-3.5 w-3.5 shrink-0 text-ink-4" aria-hidden />;
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <span className="block truncate text-callout font-headline text-ink">{children}</span>
  );
}

function Body({ row, query }: { row: SearchRow; query: string }) {
  switch (row.kind) {
    /*
     * THE ONE ROW WITH THE MARK, and the one that leaves this panel for the
     * other half of the product.
     *
     * <p>28px of orb where every other row has a 14px glyph, which is the whole
     * of its visual distinction — no fill, no border, no accent background. It
     * is first in the list and it is the only thing on screen wearing the
     * identity; that is enough.
     */
    case "ask":
      return (
        <>
          <ReverieAiMark size={20} className="mt-[0.1rem]" />
          <span className="min-w-0 flex-1">
            <Title>Ask Reverie about “{row.query}”</Title>
            {/* What Ask actually does, in its own terms. Not a count of what it
                will read: the retrieval happens server-side after the question
                is sent, so any number here would be a guess. */}
            <span className="mt-0.5 block truncate text-foot text-ink-4">
              Reads your conversations and answers with citations
            </span>
          </span>
        </>
      );

    /*
     * A SENTENCE SOMEBODY SAID — the most informative result there is, and the
     * only row whose first line is the match rather than a name.
     *
     * <p>Two lines of it, clamped, windowed around the term by `snippet` so the
     * reason it is in the results is visible without opening anything. Quoted,
     * because it is speech.
     */
    case "mention":
      return (
        <>
          <Glyph icon={Quote} />
          <span className="min-w-0 flex-1">
            <span className="block text-callout leading-[1.5] text-ink-2 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
              “<Marked text={snippet(row.hit.text, query, 110)} query={query} />”
            </span>
            <Meta
              parts={[
                row.hit.speaker ?? null,
                row.hit.meetingTitle,
                formatDate(row.hit.meetingCreatedAt),
                row.hit.start != null ? timecode(row.hit.start) : null,
              ]}
            />
          </span>
        </>
      );

    /*
     * A DECISION, from `meeting_insights`.
     *
     * <p>No status and no badge. The table stores `kind` and `text` and nothing
     * about whether a decision was later reversed, so the reference's
     * `Reversed` marker cannot be drawn from anything — and a decision wrongly
     * presented as current is the most expensive thing this panel could get
     * wrong.
     *
     * <p>No timecode either: insights are extracted per meeting rather than per
     * segment, so the link opens the meeting at the top. Promising a second and
     * landing at 0:00 is worse than not promising one.
     */
    case "decision":
      return (
        <>
          <Glyph icon={Gavel} />
          <span className="min-w-0 flex-1">
            <span className="block text-callout leading-[1.5] text-ink [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
              <Marked text={row.hit.text} query={query} />
            </span>
            <Meta parts={[row.hit.meetingTitle, formatDate(row.hit.meetingCreatedAt)]} />
          </span>
        </>
      );

    /*
     * A MEETING. `mentions` is why a meeting whose title contains none of the
     * words is in the list, which is the question a result like that provokes.
     */
    case "meeting":
      return (
        <>
          <Glyph icon={FileAudio} />
          <span className="min-w-0 flex-1">
            <Title>
              <Marked text={row.hit.title} query={query} />
            </Title>
            <Meta
              parts={[
                formatDate(row.hit.createdAt),
                formatDuration(row.hit.durationSeconds),
                row.hit.mentions > 0
                  ? `${row.hit.mentions} mention${row.hit.mentions === 1 ? "" : "s"}`
                  : null,
                row.hit.tags.length > 0 ? row.hit.tags.slice(0, 2).join(", ") : null,
              ]}
            />
          </span>
        </>
      );

    /*
     * SOMEBODY IN THE ARCHIVE, counted three ways the API distinguishes: what
     * they said, how often anybody said their name, and what they owe.
     *
     * <p>The names come from diarization labels and action-item owners, so
     * `Speaker 2` is a legitimate row here. That is the truth of the data — a
     * voice that has not been named yet — and hiding those rows would make the
     * counts not add up.
     */
    case "person":
      return (
        <>
          <Glyph icon={User} />
          <span className="min-w-0 flex-1">
            <Title>
              <Marked text={row.hit.name} query={query} />
            </Title>
            <Meta
              parts={[
                row.hit.meetings > 0
                  ? `${row.hit.meetings} meeting${row.hit.meetings === 1 ? "" : "s"}`
                  : null,
                row.hit.segments > 0 ? `${row.hit.segments} said` : null,
                row.hit.mentions > 0 ? `${row.hit.mentions} named` : null,
                row.hit.commitments > 0
                  ? `${row.hit.commitments} action item${row.hit.commitments === 1 ? "" : "s"}`
                  : null,
              ]}
            />
          </span>
        </>
      );

    /*
     * A FOLDER. No count of what is in it — see `matchFolders` — and no trailing
     * arrow either: it was drawn with one, and on screen it read as the only
     * row that goes somewhere when every row goes somewhere.
     */
    case "folder":
      return (
        <>
          <Glyph icon={Folder} />
          <span className="min-w-0 flex-1">
            <Title>
              <Marked text={row.project.name} query={query} />
            </Title>
          </span>
        </>
      );

    /* A TAG, which narrows rather than navigates. */
    case "tag":
      return (
        <>
          <Glyph icon={Tag} />
          <span className="min-w-0 flex-1">
            <Title>
              <Marked text={row.tag} query={query} />
            </Title>
            <span className="mt-0.5 block truncate text-foot text-ink-4">
              Narrow this search to the tag
            </span>
          </span>
        </>
      );

    case "recent":
      return (
        <>
          <Glyph icon={Search} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-callout text-ink-2">{row.search}</span>
          </span>
        </>
      );

    case "action":
      return (
        <>
          <Glyph icon={ACTION_ICON[row.act]} />
          <span className="min-w-0 flex-1">
            <Title>{row.label}</Title>
            <span className="mt-0.5 block truncate text-foot text-ink-4">{row.hint}</span>
          </span>
        </>
      );
  }
}

const ACTION_ICON: Record<SearchAction, React.ComponentType<{ className?: string }>> = {
  record: Mic,
  import: Upload,
  settings: Settings,
};

/**
 * A heading, and the true count of what is behind it.
 *
 * <p>`aria-hidden`, because the group it labels is announced through the
 * option's own name and a listbox with headings in its accessible tree gives a
 * reader "Transcripts, 14" as though it were a result to open. The visual
 * grouping is for eyes; the arrow keys walk the rows.
 */
export function SearchGroupHeading({
  label,
  count,
  onClear,
}: {
  label: string;
  count?: number;
  /** Forget this group. Only `Recent searches` has anything to forget. */
  onClear?: () => void;
}) {
  return (
    <div className="flex items-baseline justify-between px-3 pb-1 pt-3">
      <p className="v2-label" aria-hidden>
        {label}
      </p>
      {count != null && count > 0 && (
        <p className="tabular font-mono text-foot text-ink-5" aria-hidden>
          {count}
        </p>
      )}
      {/*
        Not `aria-hidden`, unlike the label beside it: this is a control, and
        the only way to take a remembered search back out of the browser. It is
        outside the listbox's option list on purpose — a button the arrow keys
        can land on would be a row that clears the list it is in.
      */}
      {onClear && (
        <button
          type="button"
          tabIndex={-1}
          onClick={onClear}
          className="rounded-sm text-foot text-ink-4 transition-colors hover:text-ink"
        >
          Clear
        </button>
      )}
    </div>
  );
}
