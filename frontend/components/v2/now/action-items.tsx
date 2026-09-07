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
 * replaced — they simply live one level up now, in `useActionItems`, because
 * Home has to know whether this margin has anything in it before it can decide
 * whether to draw a column for it. See components/v2/now/use-action-items.
 *
 * <p><b>Only what somebody typed.</b> A commitment made in a meeting is read on
 * that meeting, beside the sentence it came from, and ticked off there. That
 * rule is unchanged and it is why this list carries no meeting link: the query
 * asks for standalone items only, so a branch for a meeting title here would
 * describe a state this list cannot be in.
 *
 * <p>Fields are shown only where they exist. A standalone item carries a title,
 * a status, and an owner and due date where somebody set them — so nothing here
 * is fabricated to match a screenshot that had more. There is no "view all",
 * because there is no page to view them all on; and no promotional card under
 * the list, because when the list ends the margin ends.
 */

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
import type { ActionItemResponse } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { dueLabel, dueTone } from "@/lib/due";
import { cn } from "@/lib/utils";
import { ResourceLoadError } from "@/components/resource-load-error";
import type { ActionItems } from "@/components/v2/now/use-action-items";

/** Which of the two lists is on screen. Local, and nothing else's business. */
type View = "open" | "done";

export function NowActionItems({ items }: { items: ActionItems }) {
  const { state, open, done } = items;

  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [view, setView] = React.useState<View>("open");

  const showing = view === "open" ? open : done;

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
      <div className="flex items-baseline gap-3">
        <h2 id="now-actions" className="v2-label">
          Action items
        </h2>
        {!adding && state !== "loading" && state !== "error" && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="ml-auto flex items-center gap-1 text-foot text-ink-4 transition-colors duration-press ease-soft hover:text-ink-2"
          >
            <Plus className="h-3 w-3" aria-hidden /> Add
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
        <p>Drawn only once there is something to switch between. A tab bar over
        an empty account is chrome describing nothing.
      */}
      {state !== "loading" && state !== "error" && (open.length > 0 || done.length > 0) && (
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

      <div className="mt-3 border-t border-line pt-3">
        {adding && (
          <div className="mb-3 flex items-center gap-2.5">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-[3.5px] shadow-[inset_0_0_0_1px_rgb(var(--edge))]"
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
              className="h-7 flex-1 bg-transparent text-callout text-ink outline-none placeholder:text-ink-4"
            />
            {items.creating && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-4" aria-hidden />
            )}
          </div>
        )}

        {state === "loading" ? (
          <div className="space-y-2">
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
          /* Quiet and truthful, and different per view: "nothing on your list"
             is wrong under Completed, where the truth is that nothing has been
             finished yet. Reached only from a settled response, so both are
             statements about the list rather than about the network. */
          <p className="text-callout leading-[1.45] text-ink-4">
            {view === "open"
              ? "Nothing on your list. What a meeting committed you to stays on that meeting."
              : "Nothing finished yet."}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {showing.map((item) => (
              <Row key={item.id} item={item} onToggle={() => void items.toggle(item)} />
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
        "rounded-md px-2 py-1 text-foot transition-colors duration-press ease-soft",
        on ? "bg-white/[0.06] font-headline text-ink" : "text-ink-4 hover:text-ink-2",
      )}
    >
      {label} <span className="tabular">({count})</span>
    </button>
  );
}

/**
 * One item.
 *
 * <p>A real checkbox, because it is one — a styled `<span>` with a click
 * handler is the commonest way a list like this stops working for a keyboard.
 * It is sized and positioned like the reference's, which draws a 12px rounded
 * square on the row's first line.
 */
function Row({ item, onToggle }: { item: ActionItemResponse; onToggle: () => void }) {
  const done = item.status === "DONE";
  const due = dueLabel(item);

  return (
    <li className="flex items-start gap-2.5">
      <input
        type="checkbox"
        checked={done}
        onChange={onToggle}
        aria-label={done ? `Reopen ${item.title}` : `Complete ${item.title}`}
        className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-[hsl(var(--brand))]"
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-callout leading-[1.45] text-ink-2",
            done && "text-ink-4 line-through",
          )}
        >
          {item.title}
        </span>
        {(due || item.ownerName) && (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-foot text-ink-5">
            {due && <span className={dueTone(item.dueStatus)}>{due}</span>}
            {item.ownerName && <span>{item.ownerName}</span>}
          </span>
        )}
      </span>
    </li>
  );
}
