"use client";

/**
 * THE ARCHIVE, NARROWED TWO WAYS.
 *
 * <h2>Three scopes, three endpoints, no invented parameters</h2>
 *
 * <p>`GET /meetings` takes `search`, `tag`, `status`, `from`, `to` and
 * `unfiled`. It has never taken a folder, and this does not pretend otherwise:
 * a folder is a different question with an endpoint of its own.
 *
 * <ul>
 *   <li><b>Every folder</b> — `GET /meetings?from&to`, paged at fifty, with the
 *       date window on the wire where the server can honour it.</li>
 *   <li><b>One folder</b> — `GET /projects/{id}/meetings`, which is what a
 *       folder's own page reads.</li>
 *   <li><b>Not in a folder</b> — `GET /projects/unfiled`, which the folders
 *       tree has always shown.</li>
 * </ul>
 *
 * <p>All three are called on every render and two of them are always skipped.
 * That is how RTK Query works — a hook cannot be called conditionally — and
 * `skip` means no request rather than a discarded one.
 *
 * <h2>Why the date window is applied in the browser for two of them, and why
 * that is not the usual mistake</h2>
 *
 * <p>Filtering rows the client happens to have is normally a bug: with a page
 * of fifty out of two hundred, a local predicate narrows the page rather than
 * the archive, and the result is a list that is missing rows and a count that
 * is wrong. That is exactly why the "every folder" scope sends `from` and `to`
 * to the server.
 *
 * <p>The two folder endpoints return a bare `MeetingResponse[]` — the WHOLE
 * folder, unpaged. So a date predicate over it is evaluated against the
 * complete set, and the answer is the same one the server would give. The count
 * underneath is `filtered.length`, which is likewise the true total rather than
 * a count of what happened to be fetched.
 *
 * <p>If either endpoint is ever paged, this stops being sound and the window
 * has to move onto the wire with it. That is the one thing to notice here.
 *
 * <h2>What is deliberately not sent</h2>
 *
 * <p>`unfiled=true`, ever. It is the flag that made Home's name a lie — filing
 * a conversation took it off a list called Recent — and the "Not in a folder"
 * scope is a different thing: a question somebody asked for, answered by the
 * endpoint named after it, on a page that never claims to be showing
 * everything while it is narrowed.
 */

import * as React from "react";
import {
  useGetMeetingsQuery,
  useGetProjectMeetingsQuery,
  useGetUnfiledMeetingsQuery,
} from "@/lib/api";
import { homeListState, type HomeListState } from "@/lib/home-list-state";
import { groupByDay, type DayGroup } from "@/lib/days";
import type { MeetingResponse } from "@/lib/types";
import type { DateWindow } from "@/components/date-filter";
import type { FolderScope } from "@/components/v2/library/folder-filter";

/** How many rows the archive scope asks for. Library's bound, not Home's. */
export const LIBRARY_SIZE = 50;

export interface LibraryList {
  state: HomeListState;
  /** The rows, grouped by local calendar day. */
  groups: DayGroup<MeetingResponse>[];
  /**
   * How many exist for this exact question, or null when nobody can say.
   *
   * <p>`totalElements` from the server for the archive scope; the length of
   * the complete folder list for the other two. Null before an answer.
   */
  total: number | null;
  /** How many are on screen. Below `total` only when the archive is capped. */
  shown: number;
  /** Whether the fifty-row bound is hiding some of the answer. */
  capped: boolean;
  refetch: () => void;
}

/** Whether an instant falls inside the window. `from` inclusive, `to` exclusive. */
function inWindow(iso: string, when: DateWindow): boolean {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return true;
  if (when.from && at < new Date(when.from).getTime()) return false;
  if (when.to && at >= new Date(when.to).getTime()) return false;
  return true;
}

export function useLibraryList({
  when,
  scope,
  ready,
}: {
  when: DateWindow;
  scope: FolderScope;
  /**
   * Whether the remembered date window has been read yet.
   *
   * <p>Nothing may be fetched before it is: the first render always holds
   * `ANY_TIME`, so asking then would fetch the archive and immediately fetch it
   * again narrowed.
   */
  ready: boolean;
}): LibraryList {
  const isAll = scope.kind === "all";
  const isFolder = scope.kind === "folder";
  const isUnfiled = scope.kind === "unfiled";

  const archive = useGetMeetingsQuery(
    {
      page: 0,
      size: LIBRARY_SIZE,
      from: when.from ?? undefined,
      to: when.to ?? undefined,
      // No `unfiled`. That parameter is what would make this list "everything
      // outside your folders"; this scope is everything.
    },
    {
      skip: !ready || !isAll,
      // A meeting's status changes without anybody touching the list, and the
      // cached copy is whatever was true when it was last fetched.
      refetchOnMountOrArgChange: true,
    },
  );

  const folder = useGetProjectMeetingsQuery(isFolder ? scope.id : "", {
    skip: !ready || !isFolder,
    refetchOnMountOrArgChange: true,
  });

  const unfiled = useGetUnfiledMeetingsQuery(undefined, {
    skip: !ready || !isUnfiled,
    refetchOnMountOrArgChange: true,
  });

  const active = isAll ? archive : isFolder ? folder : unfiled;

  /*
   * The rows for this scope, and the window applied where the server could not
   * apply it. Memoised on the identities RTK hands back rather than on the
   * arrays: `data ?? []` is a fresh array every render, and `groupByDay` below
   * would then regroup the archive on every keystroke anywhere on the page.
   */
  const rows = React.useMemo<MeetingResponse[] | undefined>(() => {
    if (isAll) return archive.data?.content;
    const list = isFolder ? folder.data : unfiled.data;
    if (list === undefined) return undefined;
    return list.filter((m) => inWindow(m.createdAt, when));
  }, [isAll, isFolder, archive.data, folder.data, unfiled.data, when]);

  const state = homeListState({
    restored: ready,
    isUninitialized: active.isUninitialized,
    isLoading: active.isLoading,
    isFetching: active.isFetching,
    isError: active.isError,
    isSuccess: active.isSuccess,
    /* `null` when nothing is cached, NOT 0. `?? []` reads "no answer yet" as
       "the answer is none", which tells somebody with a hundred meetings that
       they have none. */
    count: rows ? rows.length : null,
  });

  const groups = React.useMemo(() => groupByDay(rows ?? []), [rows]);

  const total = isAll ? (archive.data ? archive.data.totalElements : null) : (rows ? rows.length : null);
  const shown = rows ? rows.length : 0;

  return {
    state,
    groups,
    total,
    shown,
    // Only the paged scope can be capped. The folder endpoints return the whole
    // folder, so what is on screen is the whole answer.
    capped: isAll && total !== null && total > shown,
    refetch: () => void active.refetch(),
  };
}
