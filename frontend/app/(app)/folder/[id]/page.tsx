"use client";

/**
 * ONE FOLDER: what is filed in it.
 *
 * <h2>The composition</h2>
 *
 * <p>`design-demo/final/17-folder.html`: a breadcrumb up to the folders, the
 * eyebrow, the folder's name at title scale, the facts about it in a dotted
 * row, then the meetings in date groups as flat rows with hairlines between
 * them.
 *
 * <p>What it replaced was a table: an `h1` in `text-2xl font-bold`, a star
 * button floated opposite it, and a column header reading the single word
 * "Conversation" over rows carrying a calendar glyph and a clock glyph. The
 * reference reads like a document; that read like a database.
 *
 * <h2>The margin is empty, and stays empty</h2>
 *
 * <p>The reference puts "Tracked in this folder" beside the meetings — a topic
 * in four instalments, a risk open thirteen days, a promise due tomorrow. None
 * of it exists. The migrations dropped `meeting_decisions`, `decision_links`,
 * `commitments` and `commitment_evidence`, and nothing replaced them; there is
 * no cross-meeting state in this product to put in a margin.
 *
 * <p>So this page uses the measure alone. `.v2-spread[data-margin="empty"]`
 * centres it rather than parking it left of a 400px hole — reserving the column
 * for something that does not exist would be building the frame of a feature
 * and calling the redesign done.
 *
 * <h2>Two things that were removed and are not coming back here</h2>
 *
 * <p><b>The folder chat.</b> The reference's masthead offers "Ask this folder".
 * It was removed from this page on request, and a visual migration is not
 * permission to restore a product decision. The server side is untouched — POST
 * /projects/:id/chat, its conversations and the whole PRJ- scope still exist
 * and still work — so a folder's existing history is unreachable rather than
 * deleted. The workspace chat at /ask is where asking lives.
 *
 * <p><b>Rename, delete and search-in-folder.</b> Those are in the band beside
 * Record — see components/folder-header-actions.tsx. They are what you do to
 * the folder you are standing in, and having them here as well meant one set of
 * actions living in two places.
 *
 * <h2>What the facts row may say</h2>
 *
 * <p>The count, and when it was last updated. Not the reference's "6h 12m":
 * `GET /projects/:id` returns no duration and `GET /projects/:id/meetings`
 * returns an unpaged array, so a total would have to be summed from whatever
 * came back and presented as the folder's — a measurement of the response
 * rather than of the folder. Not "4 tracked" either, for the reason above.
 */

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Star, MoreHorizontal, FileText, FolderMinus } from "lucide-react";
import {
  useGetProjectQuery,
  useGetProjectMeetingsQuery,
  useUpdateProjectMutation,
  useAssignProjectMutation,
} from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Masthead } from "@/components/v2/masthead";
import { Group, Dot } from "@/components/v2/group";
import { NowConversationRow } from "@/components/v2/now/conversation-row";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { groupByDay, relativeDay } from "@/lib/days";
import { cn } from "@/lib/utils";
import { FOLDERS, LIBRARY } from "@/lib/routes";
import type { MeetingResponse } from "@/lib/types";

export default function FolderPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: folder, isLoading } = useGetProjectQuery(id);
  const { data: meetings } = useGetProjectMeetingsQuery(id);

  const [update] = useUpdateProjectMutation();

  const rows = meetings ?? [];
  // Keyed on the query result rather than on `rows`, which is a fresh array
  // every render whenever the request has not answered yet.
  const groups = React.useMemo(() => groupByDay(meetings ?? []), [meetings]);

  return (
    <div className="px-4 pb-16 lg:px-6">
      <div className="v2-spread" data-margin="empty">
        <div className="min-w-0">
          {isLoading ? (
            <div className="pt-10" aria-busy="true">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-9 w-64" />
              <Skeleton className="mt-10 h-10 w-full" />
              <Skeleton className="mt-4 h-10 w-full" />
            </div>
          ) : !folder ? (
            <div className="pt-10" role="alert">
              <Masthead
                back={{ href: FOLDERS, label: "Folders" }}
                label="Library · folder"
                title="That folder no longer exists"
              />
              <p className="max-w-[58ch] text-callout leading-[1.5] text-ink-3">
                It may have been deleted. Its meetings are kept —{" "}
                <Link
                  href={LIBRARY}
                  className="underline underline-offset-2 hover:text-ink-2"
                >
                  they are all in Library
                </Link>
                .
              </p>
            </div>
          ) : (
            <>
              <Masthead
                back={{ href: FOLDERS, label: "Folders" }}
                label="Library · folder"
                title={folder.name}
                sub={folder.description?.trim() || undefined}
                meta={
                  <>
                    <span>
                      {folder.meetingCount} meeting{folder.meetingCount === 1 ? "" : "s"}
                    </span>
                    <Dot />
                    <span>last updated {relativeDay(folder.updatedAt)}</span>
                  </>
                }
                bar={
                  /* The star is the whole of "this is the folder I am in this
                     week": starred folders sort to the top of the margin and of
                     the folders page. Rename, delete and search are in the band
                     — see components/folder-header-actions.tsx. */
                  <button
                    type="button"
                    aria-label={folder.favorite ? "Remove star" : "Star this folder"}
                    aria-pressed={folder.favorite}
                    onClick={() => void update({ id, body: { favorite: !folder.favorite } })}
                    className="-ml-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-callout text-ink-3 transition-colors duration-press ease-soft hover:bg-white/[0.035] hover:text-ink"
                  >
                    <Star
                      className={cn(
                        "h-[13px] w-[13px]",
                        folder.favorite && "fill-amber-400 text-amber-400",
                      )}
                      aria-hidden
                    />
                    {folder.favorite ? "Starred" : "Star this folder"}
                  </button>
                }
              />

              {rows.length === 0 ? (
                <div>
                  <p className="text-body font-headline text-ink">Nothing filed here yet</p>
                  <p className="mt-1.5 max-w-[58ch] text-callout leading-[1.5] text-ink-3">
                    Open a meeting and choose this folder, or pick it when you
                    import. A folder is a filter with a name — nothing has to be
                    in one.
                  </p>
                </div>
              ) : (
                /* Named, so it is a landmark a screen reader can jump to. */
                <section aria-label={`Conversations in ${folder.name}`}>
                  {groups.map((group) => (
                    <Group
                      key={group.key}
                      heading={group.label}
                      aside={
                        <span className="tabular font-mono text-foot text-ink-4">
                          {group.items.length}
                        </span>
                      }
                    >
                      <ul className="[&>li+li>a]:shadow-[inset_0_1px_0_rgb(var(--line))]">
                        {group.items.map((meeting) => (
                          <NowConversationRow
                            key={meeting.id}
                            meeting={meeting}
                            action={
                              <RowActions meeting={meeting} folderName={folder.name} />
                            }
                          />
                        ))}
                      </ul>
                    </Group>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * What you can do to a meeting from inside the folder it is filed in.
 *
 * <p>Two items, and the second is the reason this menu exists: taking a meeting
 * out of a folder is a folder operation and this is the only screen it makes
 * sense on. Deleting a recording is not here — that lives on the meeting page,
 * behind the erase menu, where what is about to go can be named one grain at a
 * time.
 */
function RowActions({
  meeting,
  folderName,
}: {
  meeting: MeetingResponse;
  folderName: string;
}) {
  const [assign, { isLoading }] = useAssignProjectMutation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${meeting.title}`}
          className="rounded p-1.5 text-ink-4 transition-colors duration-press ease-soft hover:bg-white/[0.06] hover:text-ink"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link href={`/meetings/${meeting.id}`}>
            <FileText className="mr-2 h-4 w-4" /> Open conversation
          </Link>
        </DropdownMenuItem>
        {/* Removing it from the folder, not deleting it. Said in the toast as
            well, because "remove" over a recording reads as worse than it is. */}
        <DropdownMenuItem
          disabled={isLoading}
          onSelect={async () => {
            try {
              await assign({ meetingId: meeting.id, projectId: null }).unwrap();
              toast.success(`Removed from ${folderName}. The meeting is kept.`);
            } catch {
              toast.error("Couldn't remove that from the folder.");
            }
          }}
        >
          <FolderMinus className="mr-2 h-4 w-4" /> Remove from folder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
