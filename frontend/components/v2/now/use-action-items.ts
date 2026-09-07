"use client";

/**
 * The standalone action items, fetched once and read by two components.
 *
 * <h2>Why this exists</h2>
 *
 * <p>Home has to know whether the margin has anything in it <em>before</em> it
 * decides its own composition: with items it is a two-column spread, and
 * without them a 376px column of nothing beside the conversation list is the
 * dead space the redesign exists to remove. The list itself lives in
 * `NowActionItems`, one level down.
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
  /**
   * Whether the margin has something to say.
   *
   * <p>True while loading and true on an error, because both of those are
   * states the margin must be able to show — a failed request that silently
   * collapsed the column would be indistinguishable from an empty list, which
   * is the exact confusion `resourceState` exists to prevent. False only for a
   * settled, successful, genuinely empty response.
   */
  occupied: boolean;
  add: (title: string) => Promise<void>;
  toggle: (item: ActionItemResponse) => Promise<void>;
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
        await patch({
          id: item.id,
          body: { status: item.status === "DONE" ? "OPEN" : "DONE" },
        }).unwrap();
      } catch {
        toast.error("Couldn't update that.");
      }
    },
    [patch],
  );

  return {
    state,
    open,
    done,
    occupied: state !== "empty",
    add,
    toggle,
    creating,
    retrying: query.isFetching,
    refetch: () => void query.refetch(),
  };
}
