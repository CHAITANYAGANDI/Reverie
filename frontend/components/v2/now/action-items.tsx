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
 * <p>This is <b>the same query and the same mutations</b> as the panel it
 * replaces — `standalone: true`, `size: 100`, the same toggle and the same
 * create. What has changed is the geometry: no enclosing card, no tab bar, no
 * independent scroll, no full height. It is a heading, some rows and a
 * hairline, and it scrolls with the page because it is part of the page.
 *
 * <p><b>Only what somebody typed.</b> A commitment made in a meeting is read on
 * that meeting, beside the sentence it came from, and ticked off there. That
 * rule is unchanged and it is why this list carries no meeting link: the query
 * asks for standalone items only, so a branch for a meeting title here would
 * describe a state this list cannot be in.
 *
 * <p>Fields are shown only where they exist. A standalone item carries a title,
 * a status, and an owner and due date where somebody set them — so nothing here
 * is fabricated to match a screenshot that had more.
 */

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import {
  useGetActionItemsQuery,
  usePatchActionItemMutation,
  useCreateStandaloneActionItemMutation,
} from "@/lib/api";
import type { ActionItemResponse } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { dueLabel, dueTone } from "@/lib/due";
import { cn } from "@/lib/utils";
import { resourceState, presenceOfList } from "@/lib/resource-state";
import { ResourceLoadError } from "@/components/resource-load-error";

export function NowActionItems() {
  const query = useGetActionItemsQuery({ status: undefined, standalone: true, size: 100 });
  const { data } = query;

  /*
   * The same rule as everywhere else — see lib/resource-state. `data?.content
   * ?? []` is what made this say "Nothing on your list" whenever the request
   * failed: a sentence about what somebody has committed to, produced by a
   * dropped connection.
   */
  const listState = resourceState({
    isUninitialized: query.isUninitialized,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    isSuccess: query.isSuccess,
    content: presenceOfList(data?.content),
  });

  const [patch] = usePatchActionItemMutation();
  const [create, { isLoading: creating }] = useCreateStandaloneActionItemMutation();

  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [showDone, setShowDone] = React.useState(false);

  // Safe below this point: every branch that reads them is gated on
  // `listState`, which is `ready` or `empty` only for a settled response.
  const items = data?.content ?? [];
  const open = items.filter((i) => i.status !== "DONE");
  const done = items.filter((i) => i.status === "DONE");

  async function add() {
    const title = draft.trim();
    if (!title) {
      setAdding(false);
      return;
    }
    try {
      await create({ title }).unwrap();
      setDraft("");
      // Stays open: adding one thing you remembered usually means adding two.
    } catch {
      toast.error("Couldn't add that.");
    }
  }

  async function toggle(item: ActionItemResponse) {
    try {
      await patch({
        id: item.id,
        body: { status: item.status === "DONE" ? "OPEN" : "DONE" },
      }).unwrap();
    } catch {
      toast.error("Couldn't update that.");
    }
  }

  return (
    <section aria-labelledby="now-actions">
      <div className="mb-2.5 flex items-baseline gap-3">
        <h2 id="now-actions" className="v2-label">
          Action items
        </h2>
        {!adding && listState !== "loading" && listState !== "error" && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="ml-auto flex items-center gap-1 text-foot text-ink-4 transition-colors duration-press ease-soft hover:text-ink-2"
          >
            <Plus className="h-3 w-3" aria-hidden /> Add
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-2 flex items-center gap-2">
          <span className="h-3.5 w-3.5 shrink-0 rounded-[3.5px] shadow-[inset_0_0_0_1px_rgb(var(--edge))]" aria-hidden />
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              } else if (e.key === "Escape") {
                setDraft("");
                setAdding(false);
              }
            }}
            onBlur={() => void add()}
            placeholder="What needs doing?"
            aria-label="New action item"
            className="h-7 flex-1 bg-transparent text-callout text-ink outline-none placeholder:text-ink-4"
          />
          {creating && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-4" aria-hidden />}
        </div>
      )}

      {listState === "loading" ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : listState === "error" ? (
        <ResourceLoadError
          title="Couldn't load your action items"
          detail="They are still on your list. Something went wrong loading them."
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : open.length === 0 ? (
        /* Quiet and truthful. Reached only from a settled response, so it is a
           statement about the list rather than about the network. */
        <p className="text-callout leading-[1.45] text-ink-4">
          Nothing on your list. What a meeting committed you to stays on that
          meeting.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map((item) => (
            <Row key={item.id} item={item} onToggle={() => void toggle(item)} />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="text-foot text-ink-4 underline-offset-[3px] transition-colors duration-press ease-soft hover:text-ink-2 hover:underline"
          >
            Completed ({done.length})
          </button>
          {showDone && (
            <ul className="mt-3 flex flex-col gap-3">
              {done.map((item) => (
                <Row key={item.id} item={item} onToggle={() => void toggle(item)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
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
