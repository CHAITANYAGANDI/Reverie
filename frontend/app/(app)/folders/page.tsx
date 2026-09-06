"use client";

/**
 * THE FOLDER LIST, A PAGE AGAIN.
 *
 * <p>It was this route, then a section at the top of Library, and now this
 * route once more — `design-demo/final/16-folders.html`. The middle version put
 * a filing system most people touch twice a week in front of the archive
 * everybody opens Library for; the fix is a quiet list in the Library margin
 * with a door to the full thing, which is this.
 *
 * <p><b>Not a navigation destination.</b> The band still has three places in it
 * — Now, Library, Ask Reverie — and Library is the one that stays lit here: see
 * `placeFor` in lib/places.ts, which already treated this URL as nested inside
 * Library while it was a redirect. Adding a fourth place to the band would be
 * giving permanent screen area to the thing that was just taken out of it.
 *
 * <p>Turning the redirect back into a page also makes the old bookmarks useful
 * rather than merely harmless: this URL is where a folder deletion sends you,
 * and where the meeting menu's folder link used to go.
 *
 * <p>The page body is `components/folder-list.tsx`, which owns the query — the
 * title is the folder count, so the component that fetches has to be the one
 * that heads the page.
 */

import { FolderList } from "@/components/folder-list";

export default function FoldersPage() {
  return <FolderList />;
}
