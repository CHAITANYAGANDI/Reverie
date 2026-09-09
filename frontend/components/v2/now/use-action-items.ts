"use client";

/**
 * The standalone action items, fetched once and read by two components.
 *
 * <h2>Why this exists</h2>
 *
 * <p>Two components read this list. Home draws the column and the rule that
 * separate it from the conversation list; `NowActionItems`, one level down,
 * draws the heading, the two counts and the rows.
 *
 * <p>It used to decide the composition as well -- Home collapsed to a single
 * centred column when the list came back empty, so `occupied` was published
 * here for it to read. That is gone: the margin is drawn in every state, so
 * the flag had no readers and went with the branch. See
 * components/v2/now/action-items.
 *
 * <p>The mutations come with it, because the two things that write to this list
 * belong beside the thing that reads it: `add` and `toggle` are the whole of
 * what the margin can do.
 *
 * <h2>Why it is two requests</h2>
 *
 * <p><b>The bug:</b> ticking an item off struck it through and then lost it. It
 * did not move to Completed, it was not there on a reload, and the Completed
 * count never left zero.
 *
 * <p>This asked with `status: undefined`, meaning "both views, split them
 * here". `undefined` is an omitted query parameter, and the endpoint declares
 * that parameter `@RequestParam(defaultValue = "OPEN_ANY")` — so what arrived
 * at the server was a request for everything <em>unfinished</em>. A finished
 * item was never in the answer to be filed under Completed, and the item you
 * had just finished left the only list it was in.
 *
 * <p>There is no third value to ask for. The endpoint takes `OPEN`,
 * `IN_PROGRESS`, `DONE` and `OPEN_ANY`, and none of them means all four —
 * `status=` does not either, because Spring substitutes `defaultValue` for an
 * <em>empty</em> parameter as well as for a missing one (checked against the
 * running server, not reasoned about). So the two views are two requests, in
 * the two words the API actually has.
 *
 * <p>Which is a change of shape, and the reason the note that used to be here
 * about one call site is gone: that note was about two calls with
 * <em>identical</em> arguments, where the single request is real and RTK Query
 * merely happens to dedupe them. These two ask different questions.
 *
 * <p>Both carry `{ type: "ActionItems", id: "LIST" }`, so one patch, one
 * create and one delete each invalidate both — which is what makes an item
 * ticked off in one view appear in the other without anybody refetching by
 * hand.
 */

import * as React from "react";
import { toast } from "sonner";
import {
  useGetActionItemsQuery,
  usePatchActionItemMutation,
  useCreateStandaloneActionItemMutation,
} from "@/lib/api";
import type { ActionItemResponse } from "@/lib/types";
import {
  resourceState,
  presenceOfList,
  type Presence,
  type ResourceState,
} from "@/lib/resource-state";

export interface ActionItems {
  state: ResourceState;
  /** Everything not yet ticked off. */
  open: ActionItemResponse[];
  /** Everything ticked off, which is a view rather than a footnote now. */
  done: ActionItemResponse[];
  add: (title: string) => Promise<void>;
  /**
   * Tick an item off, or put it back.
   *
   * <p>Resolves with the item the server returned and **rejects** when the
   * write failed, so the row can show the press immediately and take it back
   * if it did not land. It used to swallow the failure into a toast and
   * resolve either way, which left the caller unable to tell the two apart --
   * fine while nothing was drawn optimistically, and not fine now.
   */
  toggle: (item: ActionItemResponse) => Promise<ActionItemResponse>;
  creating: boolean;
  retrying: boolean;
  refetch: () => void;
}

/** The same page bound for both halves, so neither view truncates first. */
const PAGE = { standalone: true, size: 100 } as const;

/**
 * What the pair of responses proves, taken together.
 *
 * <p>The conservative direction on purpose. `unknown` from either half wins,
 * so the region reports a failure rather than drawing one view over the other
 * view's missing answer — "Nothing finished yet." produced by a request that
 * never came back is precisely the class of lie lib/resource-state exists to
 * stop, and splitting the list across two requests is what made it reachable
 * again. Once both halves have answered, either one carrying rows is enough
 * for the region to be `ready`.
 */
export function combinedPresence(a: Presence, b: Presence): Presence {
  if (a === "unknown" || b === "unknown") return "unknown";
  return a === "some" || b === "some" ? "some" : "none";
}

export function useActionItems(): ActionItems {
  // `OPEN_ANY` rather than `OPEN`: OPEN and IN_PROGRESS are both outstanding,
  // and a view that made you choose between them would hide half the list.
  const openQuery = useGetActionItemsQuery({ ...PAGE, status: "OPEN_ANY" });
  const doneQuery = useGetActionItemsQuery({ ...PAGE, status: "DONE" });

  /*
   * The same rule as everywhere else — see lib/resource-state. `data?.content
   * ?? []` is what made this say "Nothing on your list" whenever the request
   * failed: a sentence about what somebody has committed to, produced by a
   * dropped connection.
   */
  const state = resourceState({
    isUninitialized: openQuery.isUninitialized || doneQuery.isUninitialized,
    isLoading: openQuery.isLoading || doneQuery.isLoading,
    isFetching: openQuery.isFetching || doneQuery.isFetching,
    isError: openQuery.isError || doneQuery.isError,
    // Settled successfully means both did. One of two is not an answer.
    isSuccess: openQuery.isSuccess && doneQuery.isSuccess,
    content: combinedPresence(
      presenceOfList(openQuery.data?.content),
      presenceOfList(doneQuery.data?.content),
    ),
  });

  const [patch] = usePatchActionItemMutation();
  const [create, { isLoading: creating }] = useCreateStandaloneActionItemMutation();

  /*
   * Memoised against the response, not rebuilt per render.
   *
   * <p>`data?.content ?? []` is a fresh array every render, and both of these
   * are handed to a child as props -- where a new identity each render is a
   * re-render each render. The fallback is memoised too, which is what makes
   * the identity stable while a request is in flight.
   *
   * <p>No `filter` any more. Each array is the answer to its own question, so
   * the split is the server's and the counts drawn from these cannot disagree
   * with the rows under them.
   */
  const open = React.useMemo(
    () => openQuery.data?.content ?? [],
    [openQuery.data?.content],
  );
  const done = React.useMemo(
    () => doneQuery.data?.content ?? [],
    [doneQuery.data?.content],
  );

  const add = React.useCallback(
    async (title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      try {
        await create({ title: trimmed }).unwrap();
      } catch {
        toast.error("Couldn't add that.");
      }
    },
    [create],
  );

  const toggle = React.useCallback(
    async (item: ActionItemResponse) => {
      try {
        return await patch({
          id: item.id,
          body: { status: item.status === "DONE" ? "OPEN" : "DONE" },
        }).unwrap();
      } catch (err) {
        // Said once, here, and rethrown so the row can roll its tick back.
        toast.error("Couldn't update that.");
        throw err;
      }
    },
    [patch],
  );

  return {
    state,
    open,
    done,
    add,
    toggle,
    creating,
    retrying: openQuery.isFetching || doneQuery.isFetching,
    // Both, because the retry button is offered for the region and the region
    // is only whole when both halves have answered.
    refetch: () => {
      void openQuery.refetch();
      void doneQuery.refetch();
    },
  };
}
