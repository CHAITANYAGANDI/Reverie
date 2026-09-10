"use client";

/**
 * The box you type a question into, and the two decisions that go with it.
 *
 * **What to look at.** By default the chat reads everything you own, which is
 * usually right and is occasionally the problem: "what did we decide about
 * pricing" across two years of calls answers from whichever passages sit closest
 * in embedding space. Naming three meetings, or a folder, turns a vague question
 * into an answerable one. That is what "Add context" is — not an attachment
 * mechanism, a narrowing.
 *
 * **How hard to look.** Quick is the width the chat has always used. Thorough
 * retrieves more and asks the model to enumerate rather than summarise, which
 * costs proportionally more and is worth it for "list everything outstanding"
 * and wasted on "what did Priya say". The wording of both comes from the server
 * so it cannot drift from what they actually do.
 *
 * The textarea grows to a limit and submits on Enter, because a chat box that
 * needs a mouse to send is a chat box people stop using. Shift-Enter is the
 * newline, which is the convention everywhere this pattern appears.
 *
 * <p><b>One row.</b> Both decisions above used to be spread over three stacked
 * strips — context, then text, then mode and Send — which was 110px of box for
 * one line of typing. Everything is on the text's own line now and the box is
 * 48px until something wraps. The reasoning is on the render itself.
 */

import * as React from "react";
import { AtSign, ArrowUp, ChevronDown, Loader2, X, Folder, FileAudio, Search } from "lucide-react";
import type { ChatMode, ChatModeOption, MeetingResponse, Project } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAllowance, aiRefusal } from "@/lib/allowance";

/** How tall the box is allowed to grow before it scrolls instead. */
const MAX_ROWS = 8;

/**
 * The typed line height in pixels, and the box's own vertical padding.
 *
 * Both are stated here because the ceiling is computed from them, and both must
 * match the classes on the textarea — `leading-6` and `py-1.5`. The old code
 * hardcoded 24 against a `text-sm` box whose line box is 20, so "eight rows"
 * was nearer ten.
 */
const LINE_HEIGHT = 24;
const PADDING_Y = 12;

/**
 * The tallest the box may get, after which it scrolls.
 *
 * Expressed as a real `max-height` rather than only as a number the resize
 * effect clamps to. The effect is one `useEffect` away from not running — a
 * ref that has not attached, text arriving from somewhere other than a
 * keystroke — and when it does not run there is nothing at all stopping the
 * box from growing until it has eaten the conversation above it. A CSS ceiling
 * holds whether or not any JavaScript does, and `overflow-y: auto` under it is
 * what puts a scrollbar there.
 */
const MAX_HEIGHT = MAX_ROWS * LINE_HEIGHT + PADDING_Y;

/**
 * The shortest it may ever be: one row.
 *
 * A floor, for the same reason there is a ceiling. The box is measured by
 * JavaScript, and a measurement taken while the panel is hidden — inside a
 * collapsed pane, or behind the Action Items tab — comes back as zero. Writing
 * zero back gave a box with no height, a placeholder nobody could read and a
 * caret nobody could see. CSS holds the floor whatever the measurement says.
 */
const MIN_HEIGHT = LINE_HEIGHT + PADDING_Y;

export interface ChatContext {
  /** Meetings the question is narrowed to. Empty means the whole workspace. */
  meetingIds: string[];
  /** Folders the question is narrowed to; expanded to their meetings on send. */
  projectIds: string[];
}

export const NO_CONTEXT: ChatContext = { meetingIds: [], projectIds: [] };

export interface ChatComposerProps {
  /*
   * NO `placeholder`.
   *
   * <p>It defaulted to "Ask anything about your conversations" and the meeting
   * chat passed "Ask about this meeting". Both are withdrawn: the box is the
   * only text field on the panel, it sits directly under the panel's own
   * heading, and a sentence inside it telling you it is a place to ask a
   * question is a sentence that is read once and then occupies the line
   * somebody is typing on.
   *
   * <p>The accessible name stays — `aria-label="Ask a question"` on the
   * textarea — so nothing is lost for a screen reader, which is the reader a
   * placeholder was never serving anyway.
   *
   * <p>One placeholder survives and it is not decoration: when the account is
   * out of minutes the box says "AI Chat is closed", which is the difference
   * between a control that is shut and one that is broken.
   */
  busy?: boolean;
  /** Null hides the picker entirely — the project chat has no mode choice. */
  modes?: ChatModeOption[];
  mode?: ChatMode;
  onModeChange?: (mode: ChatMode) => void;

  context?: ChatContext;
  onContextChange?: (context: ChatContext) => void;
  meetings?: MeetingResponse[];
  projects?: Project[];

  /**
   * What this chat reads, when that is fixed and cannot be widened — meeting
   * chat reads one meeting and has no endpoint for anything else.
   *
   * Pass the thing's own name rather than a description of it. "This meeting"
   * is only meaningful while the meeting is on screen next to it, and the panel
   * can now be maximised over the page.
   *
   * Shown as a plain chip rather than the picker. An "Add context" button on a
   * chat that cannot take any would be a control that does nothing, which is
   * worse than not offering it: it invites somebody to try, twice.
   */
  scope?: string;

  /**
   * Text to drop into the box, from somewhere else on the page.
   *
   * Keyed on the nonce alone. The same passage can be asked about twice, and
   * depending on the text would silently swallow the second attempt.
   */
  compose?: { text: string; nonce: number } | null;

  onSend: (question: string) => void | Promise<void>;
}

export function ChatComposer({
  busy = false,
  modes,
  mode = "express",
  onModeChange,
  context = NO_CONTEXT,
  onContextChange,
  meetings = [],
  projects = [],
  scope,
  compose,
  onSend,
}: ChatComposerProps) {
  const [text, setText] = React.useState("");
  const [picking, setPicking] = React.useState(false);
  const areaRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    if (!compose) return;
    setText(compose.text);
    const el = areaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(compose.text.length, compose.text.length);
    // Deliberately only the nonce -- see the prop's own note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compose?.nonce]);

  /*
   * Grow with the content.
   *
   * Reset to auto first or the box can only ever get taller — `scrollHeight`
   * includes the height already set. No clamping here: `max-height` and
   * `min-height` do that in CSS, and doing it in both places is two ceilings to
   * keep in step.
   */
  const resize = React.useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // An element that is not being displayed measures as zero, and writing
    // that back is how the box ended up invisible: the panel is portaled into
    // the shell's pane, which is `hidden` until a page claims it, so the very
    // first measurement happened while there was nothing to measure — and
    // nothing re-ran it afterwards, because the text had not changed.
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`;
  }, []);

  React.useEffect(resize, [text, resize]);

  /*
   * Measure again when the box changes width.
   *
   * Two cases, one observer. Coming back on screen is a width of zero becoming
   * a real one, and it is not a render of this component — the class that hid
   * it belongs to an ancestor — so nothing else would ever re-measure. And the
   * side panel can now be dragged, which rewraps every line in here; without
   * this the box keeps the height it needed at the old width and clips.
   *
   * The wrapper is observed rather than the textarea, and only its width is
   * acted on. Observing the box's own height would mean reacting to the height
   * this very callback sets, which is a loop.
   */
  React.useEffect(() => {
    const box = areaRef.current?.parentElement;
    if (!box) return;
    let width = box.clientWidth;
    const observer = new ResizeObserver(() => {
      if (box.clientWidth === width) return;
      width = box.clientWidth;
      resize();
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [resize]);

  function submit() {
    const question = text.trim();
    if (!question || busy || shut) return;
    setText("");
    void onSend(question);
  }

  const allowance = useAllowance();
  // Read here rather than passed in by each of the four surfaces that mount a
  // composer. "Disable every AI chat" has to mean every one, and a prop is a
  // thing the fifth caller forgets.
  const refusal = aiRefusal(allowance, "chat");
  const shut = refusal !== null;

  const chosen = modes?.find((m) => m.mode === mode);
  const selectedCount = context.meetingIds.length + context.projectIds.length;

  /* Whether the chips row has anything in it. The row is not drawn otherwise:
     an empty strip above the text is what made the box three rows tall. */
  const chips = Boolean(scope) || selectedCount > 0;

  return (
    /*
     * ONE ROW, LIKE A CHAT BOX SHOULD BE.
     *
     * <h2>What this replaces</h2>
     *
     * <p>Three stacked rows: a strip holding `Add context`, then the textarea,
     * then a strip holding the mode picker and Send. Empty, that was about
     * 110px of box for one line of typing — a panel of chrome with a text field
     * somewhere in it. It is 48px now, and it grows only when the text wraps.
     *
     * <p>The controls did not go anywhere. They are on the same line as the
     * text: the context button at the left, the mode picker and Send at the
     * right, `items-end` so they stay on the baseline as the box grows to its
     * eight-row ceiling. Every behaviour is the one it had — Enter sends,
     * Shift-Enter breaks, the picker narrows the question, the mode picker
     * chooses how hard to look, and the box still measures itself.
     *
     * <h2>Why the chips are still a row of their own</h2>
     *
     * <p>Because context is a list and a list does not fit on a line with the
     * thing it qualifies. Three named meetings and a folder would push the
     * textarea to nothing. So it is drawn above, inside the same box, and only
     * when there is something in it — which is the arrangement every chat with
     * attachments uses, and it keeps the collapsed state at one row.
     *
     * <p>`rounded-[1.5rem]` rather than `rounded-xl`: at 48px tall a 24px
     * radius is a pill, which is what says "type here" without a placeholder
     * having to say it.
     *
     * <p>The ring is not decoration. The textarea sets `outline-none`, and
     * `data-composer` is on the box so a test can find the ring without
     * knowing how deep the textarea sits.
     */
    <div
      data-composer
      className="relative rounded-[1.5rem] border border-edge bg-surface-raised shadow-e2 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30"
    >
      {picking && !scope && (
        <ContextPicker
          meetings={meetings}
          projects={projects}
          context={context}
          onContextChange={onContextChange ?? (() => undefined)}
          onClose={() => setPicking(false)}
        />
      )}

      {/*
        THE TOP ROW: what the question is about.

        <p>The context control and the chips together, above the text, which is
        the reference layout and is also the truer grouping — `Add context` and
        the chips it produces are one subject, and they were in two places.

        <p>Always drawn. Either there is a context control (the workspace chat)
        or there is a scope chip (a meeting's), and there is no chat with
        neither. `min-h-[2.25rem]` so the row is the same height whether it
        holds a 36px button or a 26px chip, and the text below it never shifts
        as chips come and go.
      */}
      <div className="flex min-h-[2.25rem] flex-wrap items-center gap-1.5 px-2.5 pt-2.5">
        {/*
          THE CONTEXT CONTROL, WITH ITS WORDS BACK.

          <p>It read `@ Add context`, was cut to a bare `@` glyph because on a
          383px rail the words were a third of the control row, and has its
          label again now that it is not on that row: a button alone at the top
          of the box has the width for two words, and `@` alone was a symbol
          somebody had to press to find out what it did.

          <p>Absent entirely where the scope is fixed. A meeting chat reads one
          meeting through one endpoint and has no way to widen, so a control
          that opens onto nothing would be worse than no control: it invites
          somebody to try, twice.
        */}
        {!scope && (
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            aria-expanded={picking}
            aria-label="Add context"
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors duration-press ease-soft",
              // Brand, not ink: what is in the context chips is what Reverie
              // will read, which is the one meaning the accent carries here.
              selectedCount > 0
                ? "border-brand/40 bg-brand/10 text-brand-text"
                : "border-line text-ink-2 hover:border-edge hover:bg-surface-hover hover:text-ink",
            )}
          >
            <AtSign className="h-3.5 w-3.5" />
            Add context
          </button>
        )}

        {chips && (
          <>
            {scope ? (
            // Bounded and truncated, with the full name on hover: a meeting
            // title is whatever somebody called it, and an untruncated one
            // wraps the chip onto three lines and pushes the box off the panel.
              <span
                title={scope}
                className="flex max-w-[240px] items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand-text"
              >
                <AtSign className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{scope}</span>
              </span>
            ) : null}

            {context.projectIds.map((id) => (
              <Chip
                key={id}
                icon={<Folder className="h-3 w-3" />}
                label={projects.find((p) => p.id === id)?.name ?? "Folder"}
                onRemove={() =>
                  onContextChange?.({
                    ...context,
                    projectIds: context.projectIds.filter((p) => p !== id),
                  })
                }
              />
            ))}
            {context.meetingIds.map((id) => (
              <Chip
                key={id}
                icon={<FileAudio className="h-3 w-3" />}
                label={meetings.find((m) => m.id === id)?.title ?? "Conversation"}
                onRemove={() =>
                  onContextChange?.({
                    ...context,
                    meetingIds: context.meetingIds.filter((m) => m !== id),
                  })
                }
              />
            ))}
          </>
        )}
      </div>

      {/*
        THE TEXT, ACROSS THE WHOLE BOX.

        <p>`block w-full`, where it was `flex-1` in a row with three controls.
        That row was the reported problem: the text shared its line with the
        context glyph, the mode trigger and Send, so a paragraph wrapped inside
        about two thirds of the box and left the rest of every line empty. On
        `/ask` at 1440 that is a 680px box typing in 520 of it.

        <p>Nothing else on this line, so a long question uses the measure it is
        going to be read at.
      */}
      <textarea
          ref={areaRef}
          rows={1}
          value={text}
          disabled={busy || shut}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          /* The one placeholder left, and it is a state rather than a label —
             see the note on the withdrawn `placeholder` prop. */
          placeholder={shut ? "AI Chat is closed" : undefined}
          aria-label="Ask a question"
          // `leading-6` and `py-1.5` are the two numbers MAX_HEIGHT is built
          // from; changing either without the other moves the ceiling off a
          // whole number of lines and leaves a clipped half-line at the bottom.
          style={{ maxHeight: MAX_HEIGHT, minHeight: MIN_HEIGHT }}
          // `scrollbar-none` scrolls without drawing the bar — see globals.css.
          // On a box this small the bar is more furniture than the two lines it
          // is measuring, and the caret already says where you are.
        className="scrollbar-none block w-full resize-none overflow-y-auto bg-transparent px-3 py-1.5 text-sm leading-6 outline-none placeholder:text-muted-foreground focus-visible:shadow-none disabled:opacity-60"
      />

      {/*
        THE BOTTOM ROW: how hard to think, and go.

        <p>`justify-between` puts the effort level at the left edge and Send at
        the right, which is the reference layout and is why there is no longer a
        gap to the right of the text: nothing on this row is competing with the
        question for horizontal space.
      */}
      <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
        {modes && modes.length > 0 ? (
          <ModePicker
            modes={modes}
            value={mode}
            label={chosen?.label ?? "Quick"}
            onChange={(next) => onModeChange?.(next)}
          />
        ) : (
          /* A spacer, so Send stays at the right edge when the modes query has
             not answered. `justify-between` with one child centres it, which
             reads as a button that has slipped. */
          <span aria-hidden />
        )}

        <Button
          type="button"
          size="icon"
          /* 36px, up from 32. It was sharing a line with the text and had to
             sit inside it; alone on its own row it is the one thing to press
             and takes the touch target it should have had. */
          className="h-9 w-9 shrink-0 rounded-full"
          disabled={busy || shut || !text.trim()}
          onClick={submit}
          aria-label="Send"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </Button>
      </div>

      {/* Under the row rather than in it: it is a sentence, and a sentence on
          the line somebody is typing on is a sentence in the way. */}
      {refusal && (
        <p className="px-4 pb-2.5 -mt-0.5 text-xs text-muted-foreground">{refusal}</p>
      )}
    </div>
  );
}

function Chip({
  icon,
  label,
  onRemove,
}: {
  icon: React.ReactNode;
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="flex max-w-[180px] items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
      {icon}
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function ModePicker({
  modes,
  value,
  label,
  onChange,
}: {
  modes: ChatModeOption[];
  value: ChatMode;
  label: string;
  onChange: (mode: ChatMode) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        /* `h-9`, matching Send at the other end of its row. It was `h-8` to
           match two 32px round buttons on the text's own line; that line is
           gone, and 36 is the height the rest of the box's controls settled at
           once none of them had to fit beside a paragraph. */
        className="flex h-9 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-ink-3 transition-colors duration-press ease-soft hover:bg-surface-hover hover:text-ink"
      >
        {label}
        {/* Turns over when the list is showing. The menu opens *upwards* here
            -- there is no room under a composer sitting on the bottom of the
            window -- so pointing up while open points at it. Without this the
            arrow says "there is more below" over a list that is above. */}
        <ChevronDown
          className={cn("h-3 w-3 transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {open && (
        /*
         * LEFT-ANCHORED, AND IT FOLLOWS THE TRIGGER.
         *
         * <p>This has been both, and each was right for where the picker was
         * standing at the time — which is the whole point, and why the anchor
         * is worth a note rather than a guess.
         *
         * <p>It was `left-0` when the picker sat at the right-hand end of a
         * one-row composer, beside Send. A 256px menu growing rightward from
         * there ran off the panel: in the 383px side pane both hints were cut
         * mid-word ("Answers from the str…"). So it became `right-0`, growing
         * leftward, which fitted at both widths.
         *
         * <p>The picker is now at the *left* edge of its own row, so `right-0`
         * would grow the menu leftward off the other side of the box. `left-0`
         * again, and this time there is 256px of composer to its right at every
         * width the panel has — the box is never narrower than the rail's
         * 383px, and the menu is two thirds of that.
         *
         * <p>`mb-3` rather than `mb-2`. The menu's bottom corner was almost
         * touching the row; twelve pixels reads as a menu above it rather than
         * one growing out of the button.
         *
         * <p>`rounded-xl`, `border-line` and `shadow-e2` — the popover shape
         * the rest of V2 uses. It was `rounded-lg`, a default `border` and
         * `shadow-lg`, none of which is this product's.
         */
        <div
          role="menu"
          className="absolute bottom-full left-0 z-30 mb-3 w-64 overflow-hidden rounded-xl border border-line bg-popover p-1 shadow-e2"
        >
          {modes.map((m) => (
            <button
              key={m.mode}
              type="button"
              role="menuitemradio"
              aria-checked={m.mode === value}
              onClick={() => {
                onChange(m.mode);
                setOpen(false);
              }}
              /* The one in effect takes the accent, which in this product
                 means "this is what is happening" rather than "this is the
                 primary action" — the same reading the retention dials and a
                 citation have. It was `bg-accent/60`, a grey fill that read as
                 a hover that had stuck. */
              className={cn(
                "block w-full rounded-lg px-3 py-2.5 text-left transition-colors duration-press ease-soft",
                m.mode === value
                  ? "bg-brand/12 text-brand-text"
                  : "text-ink-2 hover:bg-surface-hover hover:text-ink",
              )}
            >
              <span className="block text-sm font-headline">{m.label}</span>
              <span className="block text-xs text-ink-3">{m.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * What to narrow the question to.
 *
 * Conversations and folders, because those are the two units a person thinks in
 * — "the last three standups" and "everything in Q4 planning". Picking a folder
 * is not shorthand for picking its meetings one by one: a folder that gains a
 * meeting tomorrow should still be the right answer, and the ids are expanded
 * when the question is asked rather than when the chip is added.
 */
function ContextPicker({
  meetings,
  projects,
  context,
  onContextChange,
  onClose,
}: {
  meetings: MeetingResponse[];
  projects: Project[];
  context: ChatContext;
  onContextChange: (context: ChatContext) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = React.useState("");
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const needle = filter.trim().toLowerCase();
  const shownMeetings = meetings
    .filter((m) => !needle || m.title.toLowerCase().includes(needle))
    .slice(0, 20);
  const shownProjects = projects.filter(
    (p) => !needle || p.name.toLowerCase().includes(needle),
  );

  function toggle(kind: "meeting" | "project", id: string) {
    if (kind === "meeting") {
      const has = context.meetingIds.includes(id);
      onContextChange({
        ...context,
        meetingIds: has
          ? context.meetingIds.filter((m) => m !== id)
          : [...context.meetingIds, id],
      });
    } else {
      // One folder at a time, and choosing another replaces it. The limit comes
      // from how the folder's meetings are fetched — see useWorkspaceChat — and
      // is enforced here rather than silently ignored there. "These two folders
      // and nothing else" is answered by picking the meetings.
      const has = context.projectIds.includes(id);
      onContextChange({ ...context, projectIds: has ? [] : [id] });
    }
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Add context"
      className="absolute bottom-full left-2 z-30 mb-2 w-80 overflow-hidden rounded-xl border border-line bg-popover shadow-e2"
    >
      {/*
        A FIELD, RATHER THAN A LINE OF TEXT WITH A RING AROUND IT.

        <p>This was a bare input filling a row with a bottom rule, and it is
        `autoFocus` -- which Chrome treats as focus-visible, so the global 4px
        brand ring was drawn the instant the popover opened. Around a
        borderless full-width row inside a 320px popover that reads as a stray
        rectangle floating in the menu, which is exactly how it was reported.

        <p>It is the app's own field now: the same recipe as `BOX` in
        components/auth/auth-form -- an inset hairline, a barely-there fill, and
        `focus-within` moving the edge to brand. The ring the input carried is
        turned off because the field around it shows focus instead; the
        indicator moves, it does not go.

        <p>Inset by 8px rather than flush, so the field reads as a control
        inside the popover instead of a header band welded to its top edge. The
        rule underneath stays: it separates the search from the results, which
        is a different job.
      */}
      <div className="border-b border-line p-2">
        <div className="flex h-9 items-center gap-2 rounded-md bg-white/[0.04] px-2.5 shadow-[inset_0_0_0_1px_rgb(var(--line-strong))] transition-[background-color,box-shadow] duration-press ease-soft focus-within:bg-white/[0.06] focus-within:shadow-[inset_0_0_0_1px_hsl(var(--brand)),0_0_0_3px_hsl(var(--brand)/0.18)]">
          <Search className="h-3.5 w-3.5 shrink-0 text-ink-4" aria-hidden />
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a conversation or folder"
            aria-label="Find a conversation or folder"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-4 focus-visible:shadow-none"
          />
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto py-1">
        {shownMeetings.length === 0 && shownProjects.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing matches that.
          </p>
        )}

        {shownMeetings.length > 0 && (
          <>
            <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
              Conversations
            </p>
            {shownMeetings.map((m) => (
              <PickerRow
                key={m.id}
                icon={<FileAudio className="h-3.5 w-3.5" />}
                label={m.title}
                selected={context.meetingIds.includes(m.id)}
                onClick={() => toggle("meeting", m.id)}
              />
            ))}
          </>
        )}

        {shownProjects.length > 0 && (
          <>
            <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">Folders</p>
            {shownProjects.map((p) => (
              <PickerRow
                key={p.id}
                icon={<Folder className="h-3.5 w-3.5" />}
                label={p.name}
                selected={context.projectIds.includes(p.id)}
                onClick={() => toggle("project", p.id)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function PickerRow({
  icon,
  label,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
        selected && "bg-primary/10 text-primary",
      )}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected && <span className="shrink-0 text-xs">✓</span>}
    </button>
  );
}
