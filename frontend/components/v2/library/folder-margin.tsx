"use client";

/**
 * THE FILING SYSTEM, IN THE MARGIN OF THE ARCHIVE.
 *
 * <h2>What this replaced</h2>
 *
 * <p>A full-width section at the top of Library: an `h2`, a New folder button, a
 * two-column sort header — "Name / Last Updated ▼" — and either the folders or
 * a centred empty state with an icon, a paragraph and a button in it. An
 * account with no folders spent about three hundred vertical pixels saying so,
 * above the archive that is the actual reason anybody opens this page.
 *
 * <p>`design-demo/final/14-library.html` puts them in the margin instead:
 * `K.group("Folders", …, { aside: "Manage" })`, one line per folder, no
 * surfaces. A folder list is the smaller, slower-moving thing you glance at;
 * the archive is what you scroll. Giving it half the page above the archive is
 * the shape the V2 study set out to remove.
 *
 * <p>The full list, with its rename, delete, star and sort, is a page of its own
 * again at `/folders` — reached from "Manage" here. This is a glance and a door,
 * not a management surface: the only thing a row does is open the folder.
 *
 * <h2>What is deliberately not here</h2>
 *
 * <p>The reference's second margin section, "Kinds" — Recorded here / Uploaded /
 * From a link / Typed-up notes — is not drawn. `GET /meetings` takes `search`,
 * `tag`, `status`, `from`, `to` and `unfiled`, and nothing that filters by
 * source, so those four rows would be links that cannot narrow anything. Two of
 * the four are not concepts this product has at all.
 *
 * <p>Nor is the reference's "Not in a folder · 23" row. That is `unfiled=true`,
 * which is the predicate this app deliberately removed from both meeting lists.
 *
 * <p>So the margin stops after the folders, and the space under it is left
 * empty rather than filled for symmetry.
 *
 * <h2>A failure is not an empty account</h2>
 *
 * <p>Same rule as everywhere else, and it matters more in a margin because the
 * failure has less room to explain itself: an unresolved request, a dropped
 * connection and a 500 must not all arrive as "No folders yet." — a confident
 * sentence about somebody's account produced by a failure to reach the server.
 * {@link resourceState} decides first and only then is anything drawn.
 */

import * as React from "react";
import Link from "next/link";
import { Folder, Plus, Star } from "lucide-react";
import { useGetProjectsQuery } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderDialog } from "@/components/folder-dialog";
import { Group } from "@/components/v2/group";
import { sortFolders } from "@/lib/folders";
import { presenceOfList, resourceState } from "@/lib/resource-state";
import { FOLDERS, folderHref } from "@/lib/routes";
import type { Project } from "@/lib/types";

export function FolderMargin() {
  const projects = useGetProjectsQuery();
  const [creating, setCreating] = React.useState(false);

  const state = resourceState({
    isUninitialized: projects.isUninitialized,
    isLoading: projects.isLoading,
    isFetching: projects.isFetching,
    isError: projects.isError,
    isSuccess: projects.isSuccess,
    /* `presenceOfList`, not `data?.length ?? 0`. An undefined body is
       "unknown", which is a skeleton; only an array that arrived with nothing
       in it is "none", which is the empty state. */
    content: presenceOfList(projects.data),
  });

  /*
   * Starred first, then most recently updated. The same order as the page at
   * /folders, and not a choice offered here — a margin with a sort control in
   * it is a management surface, which is what "Manage" is for.
   */
  const rows = React.useMemo(
    () => sortFolders(projects.data ?? [], "updated"),
    [projects.data],
  );

  return (
    <>
      <Group
        heading="Folders"
        aside={
          <Link
            href={FOLDERS}
            /* Iris, the same as `Add` in Home's margin.
               <p>They are the same kind of thing in the same place: the one
               affordance in a column that is otherwise a list of facts. It was
               `text-ink-3`, which is the colour of the facts around it, so the
               one link in the margin read as another label. `--brand-text` is
               what the palette keeps for a word that can be pressed. */
            className="text-foot text-brand-text transition-opacity duration-press ease-soft hover:opacity-80"
          >
            Manage
          </Link>
        }
      >
        {state === "loading" ? (
          <div className="space-y-1.5" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : state === "error" ? (
          /* Quiet, because this is a margin and the archive beside it is fine.
             Said out loud all the same — the alternative reads as an account
             with no folders. */
          <p role="alert" className="text-foot leading-[1.5] text-ink-4">
            Couldn&apos;t load your folders.{" "}
            <button
              type="button"
              onClick={() => void projects.refetch()}
              className="underline underline-offset-2 transition-colors hover:text-ink-2"
            >
              Try again
            </button>
          </p>
        ) : state === "empty" ? (
          <div>
            <p className="text-callout leading-[1.5] text-ink-4">No folders yet.</p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-2.5 -ml-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-callout text-ink-2 transition-colors duration-press ease-soft hover:bg-white/[0.035] hover:text-ink"
            >
              <Plus className="h-[13px] w-[13px]" aria-hidden />
              New folder
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-px">
            {rows.map((folder) => (
              <MarginRow key={folder.id} folder={folder} />
            ))}
          </div>
        )}
      </Group>

      <FolderDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

/**
 * One folder: a mark, a name, and how much is in it.
 *
 * <p>No card and no border. The hover fill is the only surface, and it is there
 * because the row is a link and a link should say so under the pointer.
 */
function MarginRow({ folder }: { folder: Project }) {
  const Icon = folder.favorite ? Star : Folder;
  return (
    <Link
      href={folderHref(folder.id)}
      className="-mx-2.5 flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-callout text-ink-2 transition-colors duration-press ease-soft hover:bg-white/[0.035] hover:text-ink"
    >
      <Icon
        className={folder.favorite ? "h-3.5 w-3.5 shrink-0 text-ink-2" : "h-3.5 w-3.5 shrink-0 text-ink-5"}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">{folder.name}</span>
      {/* Tabular, so a column of counts lines up without a column. */}
      <span className="tabular shrink-0 font-mono text-cap text-ink-4">{folder.meetingCount}</span>
    </Link>
  );
}
