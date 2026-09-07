"use client";

/**
 * Correcting a whole transcript in one pass.
 *
 * <p>Reverie could already fix a line: hover, click the pencil, retype, save.
 * That is the right shape for spotting one wrong name while listening, and the
 * wrong shape for the thing people actually do after a bad recording, which is
 * read the transcript from the top and fix everything that is wrong. Doing that
 * a line at a time is a click to open and a click to save on every sentence,
 * one request each, and a summary marked stale forty separate times.
 *
 * <p>So this is a mode rather than a control. Everything becomes editable at
 * once, Tab moves between lines, and Done sends every change as a single batch
 * — which is also the only point at which the transcript is in a state anybody
 * meant it to be in. A half-applied correction pass is not a draft, it is a
 * transcript that disagrees with itself.
 *
 * <p>What is deliberately *not* editable here is who spoke and when. Those are
 * repairs to different things: a name is wrong across the whole meeting at
 * once, a mis-attributed turn moves to another speaker without its words
 * changing, and timings come from the audio rather than from anybody's opinion.
 * They keep the tools they have on the reading view, which act at the scale
 * they actually apply at.
 */

import * as React from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { useEditSegmentsMutation } from "@/lib/api";
import type { SegmentEdit, TranscriptSegment } from "@/lib/types";
import { timecode } from "@/lib/format";
import { groupIntoTurns } from "@/lib/turns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** What the toolbar outside this component needs to know to draw itself. */
export interface TranscriptEditorStatus {
  /** Lines whose text differs from what is stored. */
  dirty: number;
  saving: boolean;
}

/**
 * What the toolbar outside this component needs to be able to *do*.
 *
 * The Edit / Done control lives on the tab row, beside Summary and Transcript,
 * because that is where a mode switch belongs — it governs the whole document
 * under it. The drafts live here, because that is where the textareas are.
 * Publishing two functions upward is a smaller seam than lifting a thousand
 * lines of per-line state into the page to put a button next to a tab.
 */
export interface TranscriptEditorHandle {
  save: () => Promise<void>;
  /**
   * Discards the drafts and leaves the mode. Returns false when the user was
   * asked to confirm and said no, so a caller that was cancelling on the way
   * somewhere else — switching to the Summary tab, say — can stay put rather
   * than navigating away from the work it just failed to discard.
   */
  cancel: () => boolean;
}

/**
 * A textarea that is exactly as tall as its text.
 *
 * Scrollbars inside individual lines of a transcript would be unusable: a
 * correction pass is a scan down the page, and a line that hides half of itself
 * behind its own scrollbar is a line nobody proofreads. Measured rather than
 * estimated from character count, because wrapping depends on the words and on
 * how wide the window is.
 */
function AutoTextarea({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Collapse first: without this the box only ever grows, so deleting a
    // sentence leaves a hole where it used to be. Guarded on a real
    // measurement because jsdom reports zero for everything, and setting a
    // height of 0 there would hide the field from its own tests.
    el.style.height = "auto";
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={1}
      /*
        THE SAME WORDS, IN THE SAME PLACE.
        <p>`v2-read`, because `21-transcript-editing.png` corrects the
        transcript in the transcript's own type: the serif at reading size, so
        a line under correction is the line you were reading rather than a form
        field that replaced it. `text-sm` sans re-set every paragraph the
        moment the mode opened.
        <p>`-ml-2` cancels the box's own `px-2`, which is what keeps the text
        on the reading column's left edge. The padding still exists -- the box
        just hangs into the 12px grid gap for it, so focusing a line draws a
        box around the words instead of shifting them 7px right.
      */
      className="v2-read -ml-2 w-full resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-2 py-1 outline-none transition-colors hover:border-border focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/30"
      {...rest}
    />
  );
}

export const TranscriptEditor = React.forwardRef<
  TranscriptEditorHandle,
  {
    meetingId: string;
    segments: TranscriptSegment[];
    onStatus: (s: TranscriptEditorStatus) => void;
    /** Leaves the mode. Called after a successful save, and on cancel. */
    onClose: () => void;
  }
>(function TranscriptEditor({ meetingId, segments, onStatus, onClose }, ref) {
  const [editSegments, { isLoading: saving }] = useEditSegmentsMutation();

  /**
   * Only the lines that have been touched.
   *
   * Keyed by segment id and holding just the changes, rather than a copy of
   * every line: an hour of speech is thousands of segments, and seeding a draft
   * for all of them would mean diffing thousands of strings on every keystroke
   * to answer "is anything unsaved". A missing key means "as stored", which is
   * also what makes Reset a delete rather than a lookup.
   */
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  const stored = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const s of segments) if (s.id) map.set(s.id, s.text);
    return map;
  }, [segments]);

  const dirtyIds = React.useMemo(
    () => Object.keys(drafts).filter((id) => drafts[id] !== stored.get(id)),
    [drafts, stored],
  );
  const dirty = dirtyIds.length;

  // Published upward rather than lifted: see TranscriptEditorHandle. Depends on
  // the count and not on the drafts, so typing inside one line does not
  // re-render the page around it.
  React.useEffect(() => {
    onStatus({ dirty, saving });
  }, [dirty, saving, onStatus]);

  const cancel = React.useCallback(() => {
    if (
      dirty > 0 &&
      !window.confirm(
        `Discard ${dirty} unsaved ${dirty === 1 ? "correction" : "corrections"}?`,
      )
    ) {
      return false;
    }
    setDrafts({});
    onClose();
    return true;
  }, [dirty, onClose]);

  const save = React.useCallback(async () => {
    if (dirty === 0) {
      onClose();
      return;
    }
    const edits: SegmentEdit[] = dirtyIds.map((id) => ({ id, text: drafts[id] }));
    try {
      await editSegments({ id: meetingId, edits }).unwrap();
      toast.success(`${dirty} ${dirty === 1 ? "line" : "lines"} corrected.`);
      setDrafts({});
      onClose();
    } catch {
      // Left open, with the drafts intact. The batch is refused whole — an
      // unknown segment id means the client is working from a stale transcript
      // — so closing the editor here would throw away work that never landed.
      toast.error("Could not save those corrections. Nothing was changed.");
    }
  }, [dirty, dirtyIds, drafts, editSegments, meetingId, onClose]);

  React.useImperativeHandle(ref, () => ({ save, cancel }), [save, cancel]);

  /**
   * The browser's own guard, for the exits this component cannot see: closing
   * the tab, reloading, following a link out. Every in-app exit runs through
   * cancel(), which asks.
   */
  React.useEffect(() => {
    if (dirty === 0) return;
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Assigning returnValue is what actually triggers the prompt in the
      // browsers that predate preventDefault() being enough. The string is
      // never shown; every browser substitutes its own wording.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const turns = React.useMemo(() => groupIntoTurns(segments), [segments]);

  function textOf(s: TranscriptSegment): string {
    return s.id && s.id in drafts ? drafts[s.id] : s.text;
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      // Plain Enter is a paragraph break inside a line, which is what a
      // textarea is for. Only the modifier means "I am finished".
      e.preventDefault();
      void save();
    }
  }

  return (
    /*
     * ON THE CANVAS, not in a card.
     *
     * <p>This was `<Card><CardContent>` — a rounded border round the whole
     * transcript, with a dashed filled strip inside it. Two surfaces stacked
     * around a document, on the one screen where the words are the point, and
     * the V2 rule is that only the thing being operated becomes a surface.
     * That is the paragraph under the cursor, which has its own focus ring.
     *
     * <p>Nothing about the editing changed: same turns from the same
     * `groupIntoTurns`, same drafts, same per-line undo, same dirty count, same
     * Save and Cancel, same keyboard handler. See the tests.
     */
    <div onKeyDown={onKeyDown} className="space-y-4">
        {/* One quiet line. It used to be a dashed panel repeating a mode the
            tab row now names out loud; what is left is the part that says what
            to do and the count of what is unsaved. */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
          <p className="text-callout text-ink-3">
            Fix as many lines as you like, then press Done.
          </p>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {dirty === 0
              ? "No changes yet"
              : `${dirty} ${dirty === 1 ? "line" : "lines"} changed`}
          </p>
        </div>

        {turns.map((turn, i) => (
          /*
            THE SAME GRID THE READING MODE USES, and that is the point.
            <p>`3.25rem` gutter, `gap-x-3`, text column — identical to the
            transcript panel's, so switching into correction mode does not move
            a single paragraph horizontally. `21-transcript-editing.png` differs
            from `19-meeting-transcript.png` in exactly one thing: which
            paragraph has a border round it.
            <p>No avatar, for the same reason the reading mode dropped it: it
            carried a colour and nothing else, and the name is the heading.
          */
          <div key={i} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3">
            {/* Read-only on purpose, and shown rather than hidden: a correction
                is easier to make when you can see who the words are attributed
                to, and easier to get wrong when you cannot. */}
            <span aria-hidden />
            <span className="block pb-1 text-callout font-headline text-ink">
              {turn.speaker}
            </span>
            {turn.segments.map((s, j) => {
              const changed = Boolean(s.id) && dirtyIds.includes(s.id!);
              return (
                <React.Fragment key={s.id ?? j}>
                  {/* One per utterance, in the gutter, and brighter on a line
                      that has been changed — which is where the reference puts
                      the only difference between the two modes. */}
                  <span
                    className={cn(
                      "tabular h-fit pt-[0.3rem] text-right font-mono text-cap",
                      changed ? "text-brand-text" : "text-ink-4",
                    )}
                  >
                    {timecode(s.start)}
                  </span>
                    <div
                      className={cn(
                        "flex items-start gap-1 rounded-md pb-2",
                        changed && "bg-brand/5",
                      )}
                    >
                      {s.id ? (
                        <>
                          <AutoTextarea
                            value={textOf(s)}
                            onChange={(v) => setDrafts((d) => ({ ...d, [s.id!]: v }))}
                            aria-label={`${turn.speaker} at ${timecode(s.start)}`}
                          />
                          {/* Per-line undo. Cancel is all-or-nothing, and after
                              twenty good corrections one bad one should not
                              cost the other nineteen. */}
                          <button
                            type="button"
                            onClick={() =>
                              setDrafts((d) => {
                                const next = { ...d };
                                delete next[s.id!];
                                return next;
                              })
                            }
                            title="Undo this line"
                            aria-label={`Undo changes to the line at ${timecode(s.start)}`}
                            className={cn(
                              "mt-1.5 rounded p-1 text-muted-foreground transition-opacity hover:text-foreground",
                              changed ? "opacity-100" : "pointer-events-none opacity-0",
                            )}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        /* No id, so the server cannot be told which line to
                           replace. Shown as text rather than as a disabled box
                           that silently drops what gets typed into it. */
                        <p className="px-2 py-1 text-sm leading-relaxed text-muted-foreground">
                          {s.text}
                        </p>
                      )}
                    </div>
                </React.Fragment>
              );
            })}
          </div>
        ))}

        {/* The two consequences, said before they happen rather than discovered
            afterwards. Both are real: the server drops per-word timings for a
            line it did not transcribe, and it marks the summary stale because
            the summary asserted the old words. */}
        <ul className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
          <li>
            A corrected line loses its per-word timings, so playback highlights
            the whole line instead of following each word.
          </li>
          <li>
            The summary was written from the original wording. Correcting the
            transcript marks it out of date — regenerate it if the change
            matters.
          </li>
        </ul>

        {/* Repeated at the foot of a long transcript. The pair on the tab row
            is the primary one; scrolling to the end of an hour of speech to
            find that saving means scrolling back up is not a mode anybody
            wants to be in. */}
        <div className="flex items-center justify-end gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" onClick={cancel} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Done{dirty > 0 ? ` (${dirty})` : ""}
          </Button>
        </div>
    </div>
  );
});
