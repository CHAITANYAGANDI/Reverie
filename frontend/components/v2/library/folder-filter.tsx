"use client";

/**
 * WHICH FOLDER, BESIDE WHICH DATES.
 *
 * <h2>Why this can exist now, when the note on Library said it could not</h2>
 *
 * <p>Library's own comment said a folder chip would be "the very predicate this
 * app removed", and for `GET /meetings` that is still true: it takes `search`,
 * `tag`, `status`, `from`, `to` and `unfiled`, and no folder. `unfiled=true` is
 * the flag that made Home's name a lie, and nothing here sends it.
 *
 * <p>But a folder's meetings are a real endpoint, and always were —
 * `GET /projects/{id}/meetings`, which is what a folder's own page reads. So
 * narrowing to a folder is not a filter on the archive query at all; it is a
 * different, equally real question, answered by the endpoint built for it.
 * Three scopes, three requests, no invented parameters. See `useLibraryList`.
 *
 * <p>"Not in a folder" is `GET /projects/unfiled`, which the folders tree has
 * always shown. It is a *chosen* scope here rather than a hidden default, which
 * is the whole difference from `unfiled=true`: the lie was a list called Recent
 * silently excluding filed meetings, not the idea that somebody might ask to
 * see what they have never filed.
 *
 * <h2>The control</h2>
 *
 * <p>A menu, not a row of chips. One folder can be in effect at a time and the
 * list of them is as long as somebody's filing system, so the closed state has
 * to state the current scope in a fixed width — which is what "Every folder"
 * does. Same trigger treatment as the date filter beside it, because they are
 * two of the same kind of thing.
 */

import * as React from "react";
import { ChevronDown, Folder, FolderOpen, Inbox } from "lucide-react";
import { useGetProjectsQuery } from "@/lib/api";
import { cn } from "@/lib/utils";
import { sortFolders } from "@/lib/folders";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Which meetings Library is showing.
 *
 * <p>A tagged union rather than a nullable id, because "every folder" and "not
 * in a folder" are not the absence of a choice — they are two different
 * questions, and one of them has an endpoint of its own.
 */
export type FolderScope =
  | { kind: "all" }
  | { kind: "unfiled" }
  | { kind: "folder"; id: string; name: string };

export const EVERY_FOLDER: FolderScope = { kind: "all" };

/** What the closed control says. */
export function scopeLabel(scope: FolderScope): string {
  if (scope.kind === "all") return "Every folder";
  if (scope.kind === "unfiled") return "Not in a folder";
  return scope.name;
}

export function FolderFilter({
  value,
  onChange,
  className,
}: {
  value: FolderScope;
  onChange: (next: FolderScope) => void;
  className?: string;
}) {
  const projects = useGetProjectsQuery();

  /*
   * Starred first, then most recently updated -- the same order as the margin
   * beside this and the page at /folders. A menu that orders folders
   * differently from the list of folders next to it reads as a different set.
   */
  const folders = React.useMemo(
    () => sortFolders(projects.data ?? [], "updated"),
    [projects.data],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn("v2-filter-pill", className)}>
        {value.kind === "unfiled" ? (
          <Inbox className="h-3.5 w-3.5 shrink-0 text-ink-4" aria-hidden />
        ) : value.kind === "folder" ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-ink-4" aria-hidden />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-ink-4" aria-hidden />
        )}
        <span className="truncate">{scopeLabel(value)}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-4" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-[13rem]">
        <DropdownMenuItem onSelect={() => onChange(EVERY_FOLDER)}>
          <Folder className="mr-2 h-3.5 w-3.5 text-ink-4" aria-hidden />
          Every folder
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChange({ kind: "unfiled" })}>
          <Inbox className="mr-2 h-3.5 w-3.5 text-ink-4" aria-hidden />
          Not in a folder
        </DropdownMenuItem>

        {/* Drawn only when there is something to separate. A rule over nothing
            is a menu claiming a section it does not have -- which is what an
            account with no folders would get. */}
        {folders.length > 0 && <DropdownMenuSeparator />}

        {folders.map((folder) => (
          <DropdownMenuItem
            key={folder.id}
            onSelect={() => onChange({ kind: "folder", id: folder.id, name: folder.name })}
          >
            <FolderOpen className="mr-2 h-3.5 w-3.5 shrink-0 text-ink-4" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
            {/* The server's count for the folder, which is the same number the
                margin shows. Not a count of what this page would then draw:
                that also depends on the date window, and a number that
                disagrees with the list under it is worse than none. */}
            <span className="tabular ml-3 shrink-0 font-mono text-cap text-ink-4">
              {folder.meetingCount}
            </span>
          </DropdownMenuItem>
        ))}

        {/* Said quietly, and only once the request has settled with nothing.
            `projects.data` is undefined while it is in flight, and a menu that
            says "No folders yet" because a request has not come back is a
            claim about somebody's account made from silence. */}
        {projects.data !== undefined && folders.length === 0 && (
          <p className="px-2 py-1.5 text-foot text-ink-4">No folders yet.</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
