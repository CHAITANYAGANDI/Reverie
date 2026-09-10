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
 * sentence, not a record. So: a mark, the name, "9 conversations · Updated
 * Tuesday"
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
  FileAudio,
  Clock,
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
import { AmbientCanvas } from "@/components/v2/ambient-canvas";
import { EmptyPanel } from "@/components/v2/empty-panel";
import { Group, Dot } from "@/components/v2/group";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { sortFolders, SORTS, type FolderSort } from "@/lib/folders";
import { relativeDay, updatedPhrase } from "@/lib/days";
import { presenceOfList, resourceState } from "@/lib/resource-state";
import { cn } from "@/lib/utils";
import { LIBRARY, folderHref } from "@/lib/routes";
import type { Project } from "@/lib/types";

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
   * WHAT THE MARGIN'S OVERVIEW STATES, AND WHERE IT COMES FROM.
   *
   * <p>All three are read off the list this page already fetched: the folder
   * count is its length, the conversation count is the sum of the
   * `meetingCount` each row carries, and "last updated" is the newest
   * `updatedAt` among them. Not one request between them, and no number that
   * disagrees with the rows underneath -- which is the whole reason to derive
   * an overview rather than ask for one.
   *
   * <p>`null` rather than 0 when nothing has arrived. A settled empty account
   * genuinely has zero folders and zero conversations; an unresolved or failed
   * request has no answer, and the panel says so instead of reporting zeroes
   * that look like facts.
   */
  const overview = React.useMemo(() => {
    if (state !== "ready" && state !== "empty") return null;
    const list = projects.data ?? [];
    const newest = list.reduce<string | null>(
      (latest, f) =>
        latest === null || new Date(f.updatedAt) > new Date(latest) ? f.updatedAt : latest,
      null,
    );
    return {
      folders: list.length,
      conversations: list.reduce((n, f) => n + (f.meetingCount ?? 0), 0),
      updated: newest,
    };
  }, [state, projects.data]);

  return (
    <div className="relative">
      <AmbientCanvas height="34rem" top="calc(var(--band) * -1)" />
      <div className="v2-page relative">
        <div className="min-w-0">
          {/*
            NO `bar` ON THIS MASTHEAD ANY MORE, and that is the gap somebody
            noticed. It held the New folder button and, above one folder, the
            sort chip -- so between the sentence explaining the page and the
            first heading of the list there were 26px, a 32px control and 22px
            of padding, about eighty pixels of controls nobody had asked for
            yet. New folder is in the margin under Manage, where the approved
            design puts it; ordering is the list's own business and sits on the
            list's heading. What is left is the masthead's own 24px.
          */}
          <Masthead
            size="page"
            back={{ href: LIBRARY, label: "Library" }}
            label="Library · folders"
            title="Folders"
            sub="Organize conversations by project, team, or topic."
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
            /*
             * CENTRED, AND WITH NO BUTTON IN IT.
             *
             * <p>It was two left-aligned paragraphs and a New folder button,
             * which put a second control with that exact label about a hundred
             * pixels from the one in the margin -- two buttons for one action
             * on one screen, which is what the note on `creating` in this
             * component's suite has argued against from the beginning. The
             * margin's is permanent and is the one.
             *
             * <p>And the headline moved here from the page's `h1`:
             * `folderCountTitle` headed the page "1 folder", "3 folders" or
             * "No folders yet", so the name of the page changed every time
             * somebody made or deleted one. The approved design heads it
             * "Folders"; which kind of empty this is belongs in the empty
             * state.
             *
             * <p>Same panel as a folder with nothing filed in it -- see
             * components/v2/empty-panel.
             */
            <EmptyPanel icon={Folder} heading="No folders yet">
              Folders help group conversations around the work they belong to.
            </EmptyPanel>
          ) : (
            <>
              {/* Not drawn when nothing is starred. A heading over no rows
                  describes the layout rather than the data. */}
              {starred.length > 0 && (
                <Group heading="Starred">
                  <FolderRows folders={starred} onRename={setRenaming} />
                </Group>
              )}
              <Group
                heading={starred.length > 0 ? "Everything else" : "All folders"}
                /*
                  THE COUNT, AND THE ORDERING, ON THE HEADING THEY DESCRIBE.
                  <p>The count was the page title -- "1 folder" as an `h1` --
                  which made the name of the page change every time somebody
                  made or deleted one. The approved design heads the page
                  "Folders" and states the count over the list, which is what
                  the number is about. The sort chip is here for the same
                  reason, and only where there is more than one row to order.
                */
                aside={
                  <div className="flex items-center gap-3">
                    {rows.length > 1 && <SortChip sort={sort} onSort={setSort} />}
                    <span data-folder-count className="text-foot text-ink-4">
                      <span className="tabular font-mono">{rows.length}</span>{" "}
                      {rows.length === 1 ? "folder" : "folders"}
                    </span>
                  </div>
                }
              >
                <FolderRows folders={rest} onRename={setRenaming} />
              </Group>
            </>
          )}
        </div>

        {/*
         * THE MARGIN: what the filing system amounts to, and the one thing you
         * do to it.
         *
         * <p>Drawn in every state, including a failed one, so the page does not
         * change shape as answers arrive -- the same rule Home and Library
         * follow. What changes is whether the overview has numbers in it.
         */}
        <div data-page-margin>
          <FolderOverview overview={overview} onNew={() => setCreating(true)} />
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

/* --------------------------- the margin's overview ------------------------ */

/**
 * WHAT THE FILING SYSTEM AMOUNTS TO, AND THE ONE THING YOU DO TO IT.
 *
 * <h2>Three numbers, none of them asked for</h2>
 *
 * <p>Every value is derived from the folder list the page already fetched —
 * see `overview` in {@link FolderList}. The alternative would be an endpoint
 * returning a summary, which is a second source of truth for numbers sitting
 * six inches from the rows they count.
 *
 * <p>Nothing is stated before the request settles. `null` is not "zero
 * folders": a settled empty account really has none, and a dropped connection
 * has no answer at all, and reporting the second as the first is the confusion
 * `resourceState` exists to prevent everywhere else in this product.
 *
 * <h2>The one bordered surface in the V2 pages</h2>
 *
 * <p>Deliberate, and the approved design's. The rule elsewhere is that content
 * is part of the page rather than an object on it — which is why no list here
 * has a card around it. Three related measurements are the exception the rule
 * allows for: `--r-md` is documented as "a grouped surface that genuinely is
 * one object", and this is one. It is a 1px hairline and a radius, not a fill.
 */
function FolderOverview({
  overview,
  onNew,
}: {
  overview: { folders: number; conversations: number; updated: string | null } | null;
  onNew: () => void;
}) {
  return (
    <aside aria-label="About your folders" className="space-y-7">
      <section>
        <h2 className="v2-page-sub mb-3 font-headline text-ink">Folder overview</h2>
        <dl className="rounded-md border border-line px-4 py-3">
          <Stat icon={Folder} label="Total folders">
            {overview ? <span className="tabular">{overview.folders}</span> : Unknown}
          </Stat>
          {/* `FileAudio`, which is what a conversation is drawn as
              everywhere else in the product -- see the note on the folder
              page's own Conversations row. */}
          <Stat icon={FileAudio} label="Conversations">
            {overview ? <span className="tabular">{overview.conversations}</span> : Unknown}
          </Stat>
          <Stat icon={Clock} label="Last updated">
            {/* Absent rather than "never" on an account with no folders: there
                is no last update, and "never" reads as a fact about neglect. */}
            {overview?.updated ? relativeDay(overview.updated) : Unknown}
          </Stat>
        </dl>
      </section>

      <section>
        <h2 className="v2-page-sub mb-3 font-headline text-ink">Manage</h2>
        {/*
          A BUTTON, NOT A ROW WITH A CHEVRON.
          <p>The approved margin drew this as a full-width row inside a panel
          with a `>` at the far end, which is the shape of a link to somewhere
          else. This opens a dialog on this page: there is nowhere to go, so
          there is no arrow, and what is left is an ordinary outlined control
          sized to its own label.
        */}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onNew}>
          <Plus className="h-3.5 w-3.5" />
          New folder
        </Button>
      </section>
    </aside>
  );
}

/** Said instead of a number, where there is no number that is true. */
const Unknown = <span className="text-ink-4">&mdash;</span>;

/** One measurement: a glyph, what it measures, and the figure. */
function Stat({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Folder;
  label: string;
  children: React.ReactNode;
}) {
  return (
    /* `items-center`, so a 14px glyph sits on the row's centre line rather than
       on its text baseline -- an inline SVG's baseline is its bottom edge, and
       aligning to it sits the glyph a few pixels high. */
    <div className="flex items-center gap-2.5 py-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-ink-5" aria-hidden />
      <dt className="v2-page-meta min-w-0 flex-1 text-ink-3">{label}</dt>
      <dd className="v2-page-meta shrink-0 font-headline text-ink">{children}</dd>
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
          {/* "conversations", which is what this product calls them
              everywhere a person reads about them -- Home says "your newest
              conversations", Library's subtitle says the same. "meetings" is
              the word in the DTO (`meetingCount`) and it had leaked out of it
              onto the one row where somebody counts them. */}
          <span>
            {folder.meetingCount} conversation{folder.meetingCount === 1 ? "" : "s"}
          </span>
          {/* `updatedAt` is always present; the label is the same relative
              vocabulary the rest of the product uses. "Updated" in front of
              it, because a bare "Yesterday" in a row that also carries a count
              reads as when the folder was made. */}
          <Dot />
          <span>Updated {updatedPhrase(folder.updatedAt)}</span>
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
