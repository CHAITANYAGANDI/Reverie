/**
 * Ordering the folder list.
 *
 * Pure and separate from the page for one reason: starred folders come first
 * whichever column is sorted, and that rule is the sort — not a decoration on
 * top of it. Written inline it would be the first thing to go the next time
 * somebody adds a column.
 */

import type { Project } from "@/lib/types";

export type FolderSort = "name" | "updated";

/**
 * The two orders, named for what they actually sort by.
 *
 * <p>The V2 reference labels this chip "Recently used", which `updatedAt` does
 * not mean: the column moves when the folder is renamed, starred, or has a
 * meeting filed into it, and not when somebody opens it. Nothing records being
 * used. "Recently updated" is the same sort under a name that will not send
 * anybody looking for a history they do not have.
 */
export const SORTS: { value: FolderSort; label: string }[] = [
  { value: "updated", label: "Recently updated" },
  { value: "name", label: "Name" },
];

/**
 * Starred first, then by the chosen column.
 *
 * `updated` is newest-first and `name` is A–Z, because those are the only
 * directions anybody wants either of them in: a list of folders sorted
 * oldest-first is a list of what you have stopped working on.
 */
export function sortFolders(folders: Project[], sort: FolderSort): Project[] {
  return [...folders].sort((a, b) => {
    // A star is what somebody said matters. It outranks whichever column header
    // they last clicked.
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    if (sort === "name") {
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}
