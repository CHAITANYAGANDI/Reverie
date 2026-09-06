"use client";

/**
 * EVERY FOLDER — the page at /folders.
 *
 * <h2>Where this came from, twice</h2>
 *
 * <p>It was `/folders`, its own page, reached from a section in the navigation
 * rail. The rail went, so it moved to the top of Library as a table. That put a
 * filing system most people touch twice a week in front of the archive
 * everybody opens Library for, which is the shape
 * `design-demo/final/14-library.html` rejects: folders belong in the margin,
 * one click from the archive.
 *
 * <p>So it is a page again — `16-folders.html` — but not a navigation
 * destination. The band still has three places in it and Library is the one
 * that stays lit here; the way in is "Manage" in the Library margin, which is
 * also what makes the old bookmarks work again.
 *
 * <h2>Rows, not a table</h2>
 *
 * <p>The table header was "Name" and "Last Updated ▼", two buttons doubling as
 * the sort control over what was really one column. A column header implies
 * columns to align and scan, and a folder has a name, a count and a date — a
 * sentence, not a record. So: a mark, the name, "9 meetings · Tuesday"
 * underneath, the description if somebody wrote one, and a hairline. The sort
 * moved to a chip in the masthead, where the reference puts it.
 *
 * <p>Starred folders were already sorted to the top by {@link sortFolders};
 * here they get the heading the reference gives them, which turns an ordering
 * nobody could see into two groups. The heading is not drawn when nothing is
 * starred — an empty "Starred" over no rows is a section that exists to
 * describe the layout rather than the data.
 *
 * <h2>Every capability the table had</h2>
 *
 * <p>Open, star, unstar, rename, delete with its confirmation and its count of
 * the meetings that survive, the toast that follows, the sort, and the four-way
 * loading/error/empty/ready distinction. None of it is dropped for the sake of
 * flatter rows: the actions moved into the row menu, which is where they
 * already were.
 *
 * <p><b>No `absent` case.</b> `GET /projects` answers an account with no folders
 * with `[]`, so a 404 from it means the route is missing from the deployed
 * build — a fault to report, not zero folders.
 */

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Star,
  Folder,
  ChevronDown,
} from "lucide-react";
import {
  useGetProjectsQuery,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderDialog } from "@/components/folder-dialog";
import { Masthead } from "@/components/v2/masthead";
import { Group, Dot } from "@/components/v2/group";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { sortFolders, SORTS, type FolderSort } from "@/lib/folders";
import { relativeDay } from "@/lib/days";
import { presenceOfList, resourceState } from "@/lib/resource-state";
import { cn } from "@/lib/utils";
import { LIBRARY, folderHref } from "@/lib/routes";
import type { Project } from "@/lib/types";

/** "No folders yet" / "1 folder" / "6 folders" — never a hard-coded count. */
export function folderCountTitle(n: number): string {
  if (n === 0) return "No folders yet";
  if (n === 1) return "1 folder";
  return `${n} folders`;
}

export function FolderList() {
  const projects = useGetProjectsQuery();
  const [sort, setSort] = React.useState<FolderSort>("updated");
  const [creating, setCreating] = React.useState(false);
  const [renaming, setRenaming] = React.useState<Project | null>(null);

  const state = resourceState({
    isUninitialized: projects.isUninitialized,
    isLoading: projects.isLoading,
    isFetching: projects.isFetching,
    isError: projects.isError,
    isSuccess: projects.isSuccess,
    /*
     * `presenceOfList`, not `data?.length ?? 0`. An undefined body is
     * "unknown", which is a skeleton; only an array that arrived with nothing
     * in it is "none", which is the empty state. Collapsing those two is how a
     * dropped connection came to read as an account with no folders.
     */
    content: presenceOfList(projects.data),
  });

  const rows = React.useMemo(
    () => sortFolders(projects.data ?? [], sort),
    [projects.data, sort],
  );
  const starred = rows.filter((f) => f.favorite);
  const rest = rows.filter((f) => !f.favorite);

  /*
   * The count in the title, once there is one to state. While the request is
   * unresolved or failed there is no number that is true, and "No folders yet"
   * is the wrong headline for both — so the page is headed by what it is until
   * the answer arrives.
   */
  const title =
    state === "loading" || state === "error" ? "Folders" : folderCountTitle(rows.length);

  return (
    <div className="px-4 pb-16 lg:px-6">
      <div className="v2-spread" data-margin="empty">
        <div className="min-w-0">
          <Masthead
            back={{ href: LIBRARY, label: "Library" }}
            label="Library · folders"
            title={title}
            sub="A folder is a filter with a name. Nothing has to be in one."
            bar={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setCreating(true)}
                >
                  <Plus className="h-4 w-4" />
                  New folder
                </Button>
                {/* Only where there is something to order. */}
                {state === "ready" && rows.length > 1 && (
                  <div className="ml-auto">
                    <SortChip sort={sort} onSort={setSort} />
                  </div>
                )}
              </>
            }
          />

          {state === "loading" ? (
            <div className="space-y-4" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : state === "error" ? (
            <div role="alert">
              <p className="text-body font-headline text-ink">Couldn&apos;t load your folders</p>
              <p className="mt-1.5 max-w-[58ch] text-callout leading-[1.5] text-ink-3">
                Your folders are still here. Something went wrong fetching them.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                disabled={projects.isFetching}
                onClick={() => void projects.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : state === "empty" ? (
            <div>
              <p className="max-w-[58ch] text-callout leading-[1.5] text-ink-3">
                Folders help group conversations around the work they belong to.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 gap-1.5"
                onClick={() => setCreating(true)}
              >
                <Plus className="h-4 w-4" /> New folder
              </Button>
            </div>
          ) : (
            <>
              {/* Not drawn when nothing is starred. A heading over no rows
                  describes the layout rather than the data. */}
              {starred.length > 0 && (
                <Group heading="Starred">
                  <FolderRows folders={starred} onRename={setRenaming} />
                </Group>
              )}
              <Group heading={starred.length > 0 ? "Everything else" : "All folders"}>
                <FolderRows folders={rest} onRename={setRenaming} />
              </Group>
            </>
          )}
        </div>
      </div>

      <FolderDialog open={creating} onOpenChange={setCreating} />
      <FolderDialog
        open={renaming !== null}
        onOpenChange={(open) => !open && setRenaming(null)}
        folder={renaming}
      />
    </div>
  );
}

function FolderRows({
  folders,
  onRename,
}: {
  folders: Project[];
  onRename: (folder: Project) => void;
}) {
  return (
    <ul className="[&>li+li]:shadow-[inset_0_1px_0_rgb(var(--line))]">
      {folders.map((folder) => (
        <FolderRow key={folder.id} folder={folder} onRename={() => onRename(folder)} />
      ))}
    </ul>
  );
}

/** The order, as a chip rather than as two column headers. */
function SortChip({
  sort,
  onSort,
}: {
  sort: FolderSort;
  onSort: (s: FolderSort) => void;
}) {
  const current = SORTS.find((s) => s.value === sort) ?? SORTS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Order the folders"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium transition-colors hover:bg-accent"
        >
          {current.label}
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {SORTS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            aria-checked={option.value === sort}
            onSelect={() => onSort(option.value)}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * One folder, as a row rather than a table record.
 *
 * <p>The star is the mark rather than a badge beside the name: a starred folder
 * has a filled star where an ordinary one has an outlined folder, which is one
 * glyph doing the work of two.
 */
function FolderRow({ folder, onRename }: { folder: Project; onRename: () => void }) {
  const [update] = useUpdateProjectMutation();
  const [remove, { isLoading: removing }] = useDeleteProjectMutation();
  const Icon = folder.favorite ? Star : Folder;

  async function onDelete() {
    // The meetings survive — `ON DELETE SET NULL`, and the service unfiles them
    // explicitly so it can say how many. Worth saying before, not only after:
    // the word "delete" over a folder full of recordings reads as worse than it
    // is, and somebody who believes it will keep folders they do not want.
    if (
      !window.confirm(
        `Delete “${folder.name}”? Its ${folder.meetingCount} meeting${
          folder.meetingCount === 1 ? "" : "s"
        } are kept — they move out of the folder.`,
      )
    ) {
      return;
    }
    try {
      const { unfiledMeetings } = await remove(folder.id).unwrap();
      toast.success(
        unfiledMeetings > 0
          ? `Folder deleted. ${unfiledMeetings} meeting${unfiledMeetings === 1 ? "" : "s"} moved out of it.`
          : "Folder deleted.",
      );
    } catch {
      toast.error("Couldn't delete that folder.");
    }
  }

  return (
    <li className="relative">
      <Link
        href={folderHref(folder.id)}
        className="block rounded-md py-3 pr-9 transition-colors duration-press ease-soft hover:bg-white/[0.035] sm:-mx-2.5 sm:pl-2.5"
      >
        <span className="flex items-baseline gap-2.5">
          <Icon
            className={cn(
              "h-[13px] w-[13px] shrink-0 translate-y-px",
              folder.favorite ? "text-ink-2" : "text-ink-5",
            )}
            aria-label={folder.favorite ? "Starred" : undefined}
            aria-hidden={folder.favorite ? undefined : true}
          />
          <span className="min-w-0 truncate text-title-3 font-headline text-ink">
            {folder.name}
          </span>
        </span>
        <span className="mt-[5px] flex flex-wrap items-center text-foot text-ink-3">
          <span>
            {folder.meetingCount} meeting{folder.meetingCount === 1 ? "" : "s"}
          </span>
          {/* `updatedAt` is always present; the label is the same relative
              vocabulary the rest of the product uses. */}
          <Dot />
          <span>{relativeDay(folder.updatedAt)}</span>
        </span>
        {/* Only if somebody wrote one. `description` is a real column on
            Project; the reference's prose about what Reverie is "tracking" in
            the folder is not. */}
        {folder.description?.trim() && (
          <span className="mt-1.5 block max-w-[62ch] truncate text-callout leading-[1.5] text-ink-4">
            {folder.description}
          </span>
        )}
      </Link>

      {/* Outside the link, because a menu inside an anchor is neither valid nor
          clickable. Absolutely positioned so a row with a menu is exactly as
          tall as one without. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${folder.name}`}
            className="absolute right-0 top-3 rounded p-1.5 text-ink-4 transition-colors duration-press ease-soft hover:bg-white/[0.06] hover:text-ink"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onSelect={() =>
              void update({ id: folder.id, body: { favorite: !folder.favorite } })
            }
          >
            <Star
              className={cn("mr-2 h-4 w-4", folder.favorite && "fill-amber-400 text-amber-400")}
            />
            {folder.favorite ? "Remove star" : "Star folder"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onRename}>
            <Pencil className="mr-2 h-4 w-4" /> Rename Folder
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={removing}
            onSelect={(e) => {
              e.preventDefault();
              void onDelete();
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete Folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
