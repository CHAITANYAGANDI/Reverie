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
 * <p>So the query moves up here and both of them read the same call. Not two
 * `useGetActionItemsQuery` calls with identical arguments — RTK Query would
 * dedupe those into one request, but "it happens to dedupe" is a weaker
 * guarantee than one call site, and a later change to either component's
 * arguments would quietly become a second request.
 *
 * <p>The mutations come with it, because the two things that write to this list
 * belong beside the thing that reads it: `add` and `toggle` are the whole of
 * what the margin can do.
 */

import * as React from "react";
import { toast } from "sonner";
import {
  useGetActionItemsQuery,
  usePatchActionItemMutation,
  useCreateStandaloneActionItemMutation,
} from "@/lib/api";
import type { ActionItemResponse } from "@/lib/types";
import { resourceState, presenceOfList, type ResourceState } from "@/lib/resource-state";

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

export function useActionItems(): ActionItems {
  const query = useGetActionItemsQuery({ status: undefined, standalone: true, size: 100 });
  const { data } = query;

  /*
   * The same rule as everywhere else — see lib/resource-state. `data?.content
   * ?? []` is what made this say "Nothing on your list" whenever the request
   * failed: a sentence about what somebody has committed to, produced by a
   * dropped connection.
   */
  const state = resourceState({
    isUninitialized: query.isUninitialized,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    isSuccess: query.isSuccess,
    content: presenceOfList(data?.content),
  });

  const [patch] = usePatchActionItemMutation();
  const [create, { isLoading: creating }] = useCreateStandaloneActionItemMutation();

  /*
   * Split once per response, not once per render.
   *
   * <p>`data?.content ?? []` is a fresh array every render, so memoising the
   * two filters against it memoised nothing -- and both arrays are handed to a
   * child as props, where a new identity each render is a re-render each
   * render. The fallback is memoised too, which is what makes the identity
   * stable while the request is in flight.
   */
  const items = React.useMemo(() => data?.content ?? [], [data?.content]);
  const open = React.useMemo(() => items.filter((i) => i.status !== "DONE"), [items]);
  const done = React.useMemo(() => items.filter((i) => i.status === "DONE"), [items]);

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
    retrying: query.isFetching,
    refetch: () => void query.refetch(),
  };
}
