"use client";

/**
 * Rename, search and delete, for the folder currently open.
 *
 * <h2>Where this has been</h2>
 *
 * <p>On the page, then in the old per-page top bar, then in the shell's header
 * row once the band went global — and now in the folder's own masthead, which
 * is where it should have landed the first time.
 *
 * <p>The shell row is a full-width strip, so once the folder document became a
 * centred 680px measure these controls sat about 340px clear of it, hard right,
 * reading as chrome that belongs to the application rather than to the folder.
 * A control for one object belongs beside that object. The band stays global
 * and carries nothing from the page underneath; this is not in it and must not
 * go back into it.
 *
 * <p>It still reads the folder from the route rather than being handed one.
 * `useGetProjectQuery` is the call the page around it already made, so this is
 * a cache read, and the id is the one thing a caller always has.
 *
 * <p>Renders nothing until the folder resolves. A menu offering to delete
 * something unnamed is worse than a menu that arrives a moment late, and the
 * confirmation below is only meaningful once there is a name to put in it.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Trash2, Search as SearchIcon } from "lucide-react";
import { useGetProjectQuery, useDeleteProjectMutation } from "@/lib/api";
import { FolderDialog } from "@/components/folder-dialog";
import { LIBRARY } from "@/lib/routes";
import { openSearch } from "@/lib/search-overlay";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function FolderActions({
  folderId,
  variant = "menu",
}: {
  folderId: string;
  /**
   * How the three actions are drawn.
   *
   * <p>`"menu"` is the `⋯` beside a folder's name, which is where they were.
   * `"list"` draws the same three as rows under a "Manage" heading in the
   * page's margin, which is what the approved folder design does — and the
   * reason this is a variant rather than a second component is everything
   * below it: one rename dialog, one delete confirmation, one mutation, one
   * redirect. Two copies of that is how one of them stops matching the other.
   */
  variant?: "menu" | "list";
}) {
  const router = useRouter();
  const { data: folder } = useGetProjectQuery(folderId);
  const [remove, { isLoading: removing }] = useDeleteProjectMutation();
  const [renaming, setRenaming] = React.useState(false);

  if (!folder) return null;

  async function onDelete() {
    if (!folder) return;
    // The meetings survive — ON DELETE SET NULL, and the service unfiles them
    // explicitly so it can say how many. Worth saying before rather than after:
    // "delete" over a folder full of recordings reads as worse than it is, and
    // somebody who believes it keeps folders they do not want.
    if (
      !window.confirm(
        `Delete “${folder.name}”? Its meetings are kept — they move out of the folder.`,
      )
    ) {
      return;
    }
    try {
      const { unfiledMeetings } = await remove(folderId).unwrap();
      toast.success(
        unfiledMeetings > 0
          ? `Folder deleted. ${unfiledMeetings} meeting${unfiledMeetings === 1 ? "" : "s"} moved out of it.`
          : "Folder deleted.",
      );
      // The page behind this is now a folder that does not exist.
      router.push(LIBRARY);
    } catch {
      toast.error("Couldn't delete that folder.");
    }
  }

  if (variant === "list") {
    return (
      <>
        <div className="flex flex-col">
          <ManageRow icon={SearchIcon} onClick={() => openSearch(`in:"${folder.name}" `)}>
            Search folder
          </ManageRow>
          <ManageRow icon={Pencil} onClick={() => setRenaming(true)}>
            Rename folder
          </ManageRow>
          {/* Danger, and last. The confirmation behind it is the same one the
              menu asks, and it says the meetings survive before anything is
              deleted rather than after. */}
          <ManageRow icon={Trash2} danger disabled={removing} onClick={() => void onDelete()}>
            Delete folder
          </ManageRow>
        </div>

        <FolderDialog open={renaming} onOpenChange={setRenaming} folder={folder} />
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* `title` as well as `aria-label`: an unlabelled icon beside the
              folder's name, so hovering has to say what it is. It opens on
              click rather than on hover — a menu that opens by passing over it
              fires on the way past, and cannot be reached by a keyboard or a
              finger at all. */}
          <button
            type="button"
            aria-label="Folder actions"
            title="Folder actions"
            className="rounded-md p-1.5 text-ink-4 transition-colors duration-press ease-soft hover:bg-white/[0.06] hover:text-ink"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil className="mr-2 h-4 w-4" /> Rename folder
          </DropdownMenuItem>
          {/* The folder as a search filter, which is the only place it is
              offered. It used to be a link to /search?project=… — there is no
              /search now, so it opens the search box with the filter already
              typed. `in:"Name"` is the grammar the box parses (lib/search-query)
              and the trailing space puts the cursor past it, so the next
              keystroke is the term rather than more of the folder's name. */}
          <DropdownMenuItem onSelect={() => openSearch(`in:"${folder.name}" `)}>
            <SearchIcon className="mr-2 h-4 w-4" /> Search in folder
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={removing}
            onSelect={(e) => {
              e.preventDefault();
              void onDelete();
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <FolderDialog open={renaming} onOpenChange={setRenaming} folder={folder} />
    </>
  );
}

/**
 * One action in the margin: a glyph, a label, and nothing else.
 *
 * <p>A button rather than a link, because none of the three navigates: two open
 * a dialog and one opens the search box. `text-left` because a label in a
 * column of labels aligns with the ones above it rather than centring in its
 * own width.
 */
function ManageRow({
  icon: Icon,
  onClick,
  danger = false,
  disabled = false,
  children,
}: {
  icon: typeof Pencil;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "-mx-2 flex items-center gap-2.5 rounded-md px-2 py-2 text-left",
        "v2-page-meta transition-colors duration-press ease-soft",
        "disabled:pointer-events-none disabled:opacity-50",
        danger
          ? "text-danger hover:bg-danger/10"
          : "text-ink-2 hover:bg-white/[0.035] hover:text-ink",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {children}
    </button>
  );
}

