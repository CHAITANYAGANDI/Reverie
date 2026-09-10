"use client";

/**
 * YOUR OWN LIST, IN THE MARGIN.
 *
 * <h2>What this is, and what it is not</h2>
 *
 * <p>The V2 reference puts "What Reverie noticed" here — decisions reversed,
 * promises slipped twice, promises kept. None of that exists: the migrations
 * dropped `meeting_decisions`, `decision_links`, `commitments` and
 * `commitment_evidence`, and nothing replaced them. So the margin carries the
 * real thing that belongs in a margin, which is the list you keep for yourself.
 *
 * <p>It is <b>the same query and the same mutations</b> as the panel it
 * replaced — they live one level up now, in `useActionItems`. See
 * components/v2/now/use-action-items.
 *
 * <p><b>Only what somebody typed.</b> A commitment made in a meeting is read on
 * that meeting, beside the sentence it came from, and ticked off there. That
 * rule is unchanged and it is why this list carries no meeting link: the query
 * asks for standalone items only, so a branch for a meeting title here would
 * describe a state this list cannot be in.
 *
 * <h2>The column does not collapse</h2>
 *
 * <p>It used to. An account with no standalone items drew no margin at all, and
 * Home re-centred itself on the conversation list — so the page had two
 * different compositions depending on a list most people's is empty, and adding
 * the first item moved every row on the screen. The heading, both counts and
 * the rule are drawn from the first render now, including at zero, and the
 * geometry is the same in every state this can be in: loading, failed, empty
 * and full. What changes is the sentence under the rule.
 *
 * <p>There is still no "view all", because there is no page to view them all
 * on — `app/(app)` has no action-items route, and a link to nowhere for the
 * sake of matching a screenshot is worse than the gap. And no promotional card
 * under the list: when the list ends, the margin ends.
 *
 * <h2>Scale</h2>
 *
 * <p>A 13px title over an 11.5px owner, a 16px checkbox, a 15px heading and a
 * 28px pill — Home's scale, which is the interface's with a greeting of its
 * own. It was 18/16/24/22/40, measured off an approved reference that turned
 * out to be a ~1.2x capture, and came down in two steps. See `.v2-page-*` in
 * app/globals.css.
 */

import * as React from "react";
import { Loader2, MoreHorizontal, Plus } from "lucide-react";
import type { ActionItemResponse } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteActionItemMutation } from "@/lib/api";
import { toast } from "sonner";
import { dueColumn, dueTone } from "@/lib/due";
import { cn } from "@/lib/utils";
import { ResourceLoadError } from "@/components/resource-load-error";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActionItems } from "@/components/v2/now/use-action-items";

/** Which of the two lists is on screen. Local, and nothing else's business. */
type View = "open" | "done";

export function NowActionItems({ items }: { items: ActionItems }) {
  const { state, open, done } = items;

  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [view, setView] = React.useState<View>("open");

  const showing = view === "open" ? open : done;
  /* Nothing has arrived yet, or the request failed. Both hide the counts --
     "Open (0)" while a request is in flight is a claim about somebody's list
     made from the absence of an answer -- and neither hides the heading. */
  const unsettled = state === "loading" || state === "error";

  async function commit() {
    const title = draft;
    setAdding(false);
    setDraft("");
    // Back to Open, or the thing just added is filed behind a tab.
    setView("open");
    await items.add(title);
  }

  return (
    <section aria-labelledby="now-actions">
      {/* THE HEADING, at the size of the thing it names.
          <p>It was `.v2-label` — 11.5px at 560, the same treatment as "Today,
          Sep 7" over a group of rows. That label is for a group inside a
          region. It was `--t-title-1` at 22px off the magnified reference,
          then `--t-title-2` at 17, and it is `.v2-page-title` at 15 now --
          the same size as a conversation title, which inside this column is
          still the largest thing in it, over 13px task titles. Weight and
          `--ink` carry the rest. */}
      <div className="flex items-baseline gap-3">
        <h2 id="now-actions" className="v2-page-title font-headline text-ink">
          Action items
        </h2>
        {!adding && !unsettled && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(
              "v2-page-meta ml-auto flex shrink-0 items-center gap-1",
              // Iris as a word, which is what `--brand-text` is for. The one
              // affordance in this column and the only coloured thing in it.
              "text-brand-text transition-opacity duration-press ease-soft hover:opacity-80",
            )}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add
          </button>
        )}
      </div>

      {/*
        OPEN AND COMPLETED, AS TWO VIEWS.
        <p>This was a "Completed (N)" link under the list that expanded a
        second list below the first, so a margin with four open items and nine
        finished ones was thirteen rows of which four mattered. Two views of
        one array, switched locally: no request, no route, no state anybody
        else can see.
        <p>Drawn at zero as well as at four. The switch is part of this
        region's shape rather than a thing that appears once there is enough to
        justify it, and `Open (0) / Completed (0)` is a true and useful pair of
        facts about an empty list.
      */}
      {!unsettled && (
        /*
          Two pressed-state buttons, not a `role="tablist"`. A tablist owes the
          reader arrow-key navigation between its tabs and an `aria-controls`
          link to a panel; without those it announces a widget that does not
          behave like one. `aria-pressed` is the whole truth about two buttons
          where one is currently in effect, and it needs no keyboard contract
          beyond the one a button already has.
        */
        <div className="mt-3 flex items-center gap-1">
          <Tab on={view === "open"} onSelect={() => setView("open")} label="Open" count={open.length} />
          <Tab on={view === "done"} onSelect={() => setView("done")} label="Completed" count={done.length} />
        </div>
      )}

      {/* The one rule in this column, and it is the same hairline the
          conversation list uses between rows. `mt-6` when the switch is not
          drawn, so the rule does not ride up under the heading while the
          request is still out. */}
      <div
        data-actions-rule
        className={cn("border-t border-line pt-3.5", unsettled ? "mt-3.5" : "mt-2.5")}
      >
        {adding && (
          <div className="mb-5 flex items-start gap-3.5">
            <span
              className="mt-px h-4 w-4 shrink-0 rounded-[4px] shadow-[inset_0_0_0_1px_rgb(var(--edge))]"
              aria-hidden
            />
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commit();
                } else if (e.key === "Escape") {
                  setDraft("");
                  setAdding(false);
                }
              }}
              onBlur={() => void commit()}
              placeholder="What needs doing?"
              aria-label="New action item"
              className="v2-page-sub h-5 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-4"
            />
            {items.creating && (
              <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-ink-4" aria-hidden />
            )}
          </div>
        )}

        {state === "loading" ? (
          <div className="space-y-2.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : state === "error" ? (
          <ResourceLoadError
            title="Couldn't load your action items"
            detail="They are still on your list. Something went wrong loading them."
            onRetry={items.refetch}
            retrying={items.retrying}
          />
        ) : showing.length === 0 ? (
          /* Quiet and truthful, and one of three rather than one of two.
             "Nothing on your list" is wrong under Completed, where the truth
             is that nothing has been finished yet -- and it is also wrong
             under Open when everything on the list happens to be done, which
             is the case the always-drawn switch made reachable. Every branch
             is reached only from a settled response, so all three are
             statements about the list rather than about the network. */
          <p className="v2-page-meta text-ink-3">
            {view === "done"
              ? "Nothing finished yet."
              : done.length > 0
                ? "No open action items."
                : "Nothing on your list. What a meeting committed you to stays on that meeting."}
          </p>
        ) : (
          /* 16px between rows, for a ~52px pitch. It was 32 and 82, off the
             magnified reference. */
          <ul className="flex flex-col gap-4">
            {showing.map((item) => (
              <Row key={item.id} item={item} onToggle={() => items.toggle(item)} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * One of the two views.
 *
 * <p>The count is `array.length` and nothing else — it cannot disagree with
 * the rows underneath because it is the same array.
 *
 * <p>The reference draws the one in effect as a filled pill about 110 by 40 and
 * the other as bare text on the same line. Only the active one gets a fill: two
 * filled pills side by side is a segmented control, which says both are
 * settings rather than that one is the current view.
 */
function Tab({
  on,
  onSelect,
  label,
  count,
}: {
  on: boolean;
  onSelect: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onSelect}
      className={cn(
        "v2-page-meta flex h-7 items-center rounded-full px-3 transition-colors duration-press ease-soft",
        on ? "bg-white/[0.06] font-headline text-ink" : "text-ink-3 hover:text-ink-2",
      )}
    >
      {/* One plain space between them. `&nbsp;` here put U+00A0 into the
          accessible name, which reads identically on screen and does not match
          `/Open \(4\)/` -- the name three tests in this component's suite and
          one in Home's are written against. */}
      {label} <span className="tabular">({count})</span>
    </button>
  );
}

/**
 * One item.
 *
 * <p>A real checkbox, because it is one — a styled `<span>` with a click
 * handler is the commonest way a list like this stops working for a keyboard.
 * 16px, beside a 14px title. It was 24, off the magnified reference, where it
 * was the widest glyph in the column.
 *
 * <p>Four columns, and two of them are drawn only when there is something in
 * them: the owner line where somebody set an owner, and the due date where
 * there is a deadline. Nothing is invented to fill the shape — a standalone
 * item carries a title, a status, and an owner and a date where they were
 * given.
 */
function Row({ item, onToggle }: { item: ActionItemResponse; onToggle: () => Promise<unknown> }) {
  /*
   * The tick, shown before the server has agreed to it. Same reasoning as
   * `components/action-item-row` -- a controlled checkbox over a network round
   * trip is a control that appears to ignore the press. `null` means the prop
   * is the truth.
   */
  const [pending, setPending] = React.useState<boolean | null>(null);
  const done = pending ?? item.status === "DONE";
  const due = dueColumn(item);

  // The prop caught up, or the item moved between Open and Completed and this
  // row was rebuilt: either way the override is spent.
  React.useEffect(() => {
    setPending(null);
  }, [item.status]);

  async function toggle() {
    setPending(!done);
    try {
      await onToggle();
    } catch {
      // `useActiveItems.toggle` has already said why; this only undoes the tick.
      setPending(null);
    }
  }

  return (
    <li className="flex items-start gap-3.5">
      <input
        type="checkbox"
        checked={done}
        onChange={() => void toggle()}
        aria-label={done ? `Reopen ${item.title}` : `Complete ${item.title}`}
        className="mt-px h-4 w-4 shrink-0 accent-[hsl(var(--brand))]"
      />
      <span className="min-w-0 flex-1">
        <span
          data-task-title
          className={cn("v2-page-sub block text-ink-2", done && "text-ink-4 line-through")}
        >
          {item.title}
        </span>
        {item.ownerName && (
          /* `--ink-4` is documented for >=16px and this is 11.5, so the owner
             takes the tier that clears 4.5:1 at any size. */
          <span data-task-owner className="mt-0.5 block truncate text-foot text-ink-3">
            {item.ownerName}
          </span>
        )}
      </span>
      {/* The trailing pair, right-aligned against the column's edge. The menu
          is a fixed width and the date is `shrink-0`, so the dates form a
          right-aligned column whatever they say and a row with no date leaves
          the menu where it was. */}
      <span className="flex shrink-0 items-start gap-2.5">
        {due && (
          <span
            data-task-due
            /* Concatenated, NOT `cn`. tailwind-merge cannot tell that `foot`
               is a font size and `muted-foreground` is a colour -- both look
               like `text-*` to it -- so it kept the last and dropped the size,
               and the date rendered at the inherited 13.5px. Nothing here
               conflicts, so nothing needs merging. */
            className={"whitespace-nowrap text-foot " + dueTone(item.dueStatus)}
          >
            {due}
          </span>
        )}
        <ItemMenu item={item} />
      </span>
    </li>
  );
}

/**
 * The overflow menu, with the one thing it can actually do.
 *
 * <p>The reference draws a `⋯` on every row. It is here because there is a real
 * action behind it — `DELETE /action-items/{id}`, which the meeting page's own
 * row has offered since standalone items existed — and it would not be here
 * otherwise. A decorative `⋯` that opens an empty menu is a control that lies
 * about what a row can do.
 *
 * <p>One item, and no confirmation dialog, which is the behaviour the meeting
 * page already has for the same call. Opening a menu and choosing Delete is two
 * deliberate actions, and what is lost is a line of text somebody typed.
 */
function ItemMenu({ item }: { item: ActionItemResponse }) {
  const [remove, { isLoading: deleting }] = useDeleteActionItemMutation();

  async function onDelete() {
    try {
      await remove(item.id).unwrap();
      toast.success("Deleted.");
    } catch {
      toast.error("Couldn't delete that.");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`More for ${item.title}`}
        disabled={deleting}
        className="flex h-5 w-6 shrink-0 items-center justify-center rounded-md text-ink-4 transition-colors duration-press ease-soft hover:bg-surface-hover hover:text-ink-2 disabled:opacity-50"
      >
        {deleting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="text-danger" onSelect={() => void onDelete()}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
