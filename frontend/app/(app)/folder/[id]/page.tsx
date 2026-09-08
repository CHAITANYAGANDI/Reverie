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
 * <p><b>Rename, delete and search-in-folder.</b> Those are in the masthead, at
 * the right edge of the measure, beside the star — see
 * components/folder-actions.tsx. They were rendered by the shell in a
 * full-width row, which put them about 340px clear of a centred 680px document
 * and reading as chrome rather than as the folder's. Still one set of actions,
 * and now beside the thing they act on. Nothing folder-specific is in the
 * global band.
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
import {
  Star,
  MoreHorizontal,
  FolderMinus,
  FileAudio,
  Clock,
  Mic,
  Plus,
} from "lucide-react";
import { FolderActions } from "@/components/folder-actions";
import {
  useGetProjectQuery,
  useGetProjectMeetingsQuery,
  useUpdateProjectMutation,
  useAssignProjectMutation,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AmbientCanvas } from "@/components/v2/ambient-canvas";
import { EmptyPanel } from "@/components/v2/empty-panel";
import { Masthead } from "@/components/v2/masthead";
import { Group, Dot } from "@/components/v2/group";
import { NowConversationRow } from "@/components/v2/now/conversation-row";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { groupByDay, relativeDay, updatedPhrase } from "@/lib/days";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FOLDERS, LIBRARY, folderHref, recordHref } from "@/lib/routes";
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
    <div className="relative">
      <AmbientCanvas height="34rem" top="calc(var(--band) * -1)" />
      <div className="v2-page relative">
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
                size="page"
                back={{ href: FOLDERS, label: "Folders" }}
                label="Library · folder"
                title={folder.name}
                sub={folder.description?.trim() || undefined}
                meta={
                  <>
                    {/* "conversations", which is the word this product uses
                        wherever a person reads about them -- "meetings" is the
                        one in the DTO and it had leaked out of it. */}
                    <span>
                      {folder.meetingCount} conversation
                      {folder.meetingCount === 1 ? "" : "s"}
                    </span>
                    <Dot />
                    <span>Updated {updatedPhrase(folder.updatedAt)}</span>
                  </>
                }
                actions={
                  <>
                    {/* The star is the whole of "this is the folder I am in
                        this week": starred folders sort to the top of the
                        Library margin and of the folders page. An icon and not
                        a labelled button, because the name is what somebody
                        reads on this line. */}
                    <button
                      type="button"
                      aria-label={folder.favorite ? "Remove star" : "Star this folder"}
                      title={folder.favorite ? "Remove star" : "Star this folder"}
                      aria-pressed={folder.favorite}
                      onClick={() => void update({ id, body: { favorite: !folder.favorite } })}
                      className="rounded-md p-1.5 text-ink-4 transition-colors duration-press ease-soft hover:bg-white/[0.06] hover:text-ink"
                    >
                      <Star
                        className={cn(
                          "h-4 w-4",
                          folder.favorite && "fill-amber-400 text-amber-400",
                        )}
                        aria-hidden
                      />
                    </button>
                    {/* NO `⋯` HERE ANY MORE. Rename, search-in-folder and
                        delete are three rows under Manage in the margin, which
                        is what the approved design draws -- same component,
                        same dialogs, same confirmation, drawn as a list. Two
                        surfaces for one set of actions is how one of them ends
                        up out of date. */}
                  </>
                }
              />

              {rows.length === 0 ? (
                <EmptyFolder name={folder.name} folderId={id} />
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

        {/*
         * THE MARGIN: what the folder is, and what you can do to it.
         *
         * <p>Drawn only once the folder has resolved. Before that there is
         * nothing to describe, and a "Manage" list for a folder that may not
         * exist would offer to rename and delete it.
         */}
        <div data-page-margin>
          {folder && <FolderMargin folder={folder} folderId={id} />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- the margin ------------------------------ */

/**
 * WHAT THE FOLDER IS, AND WHAT YOU CAN DO TO IT.
 *
 * <p>Both readings come off the folder this page already fetched — the
 * conversation count and when it last changed. No request of its own.
 *
 * <p><b>No "Starred" row.</b> The approved design has one, reading "No", and it
 * is the one thing here that is not worth a row: the star beside the folder's
 * name already states it and is the control that changes it, so a second
 * statement of the same bit is a fact somebody has to reconcile with a toggle
 * six inches away. Asked for and removed.
 */
function FolderMargin({ folder, folderId }: { folder: Project; folderId: string }) {
  return (
    <aside aria-label="About this folder" className="space-y-7">
      <section>
        <h2 className="v2-page-sub mb-3 font-headline text-ink">Folder details</h2>
        <dl className="space-y-1">
          {/* The same glyph as the empty state above and as every
              conversation row. `FileText` was here, which in a row means a
              DOCUMENT-sourced meeting specifically -- so it was doing double
              duty as "conversations in general" four hundred pixels from a
              panel using a different glyph for the same word. */}
          <Detail icon={FileAudio} label="Conversations">
            <span className="tabular">{folder.meetingCount}</span>
          </Detail>
          <Detail icon={Clock} label="Last updated">
            {relativeDay(folder.updatedAt)}
          </Detail>
        </dl>
      </section>

      <section>
        <h2 className="v2-page-sub mb-2 font-headline text-ink">Manage</h2>
        {/* The same three actions the `⋯` beside the name used to hold; see
            components/folder-actions. */}
        <FolderActions folderId={folderId} variant="list" />
      </section>
    </aside>
  );
}

/** One reading: a glyph, what it measures, and the figure. */
function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock;
  label: string;
  children: React.ReactNode;
}) {
  return (
    /* `items-center`, so a 14px glyph sits on the row's centre line rather than
       on its text baseline -- an inline SVG's baseline is its bottom edge. */
    <div className="flex items-center gap-2.5 py-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-ink-5" aria-hidden />
      <dt className="v2-page-meta min-w-0 flex-1 text-ink-3">{label}</dt>
      <dd className="v2-page-meta shrink-0 font-headline text-ink">{children}</dd>
    </div>
  );
}

/* ------------------------------ nothing in it ---------------------------- */

/**
 * A FOLDER WITH NOTHING IN IT, WHICH IS A NORMAL FOLDER TO HAVE.
 *
 * <p>It was two left-aligned paragraphs where the list would be. The approved
 * design centres it in the column with a glyph over it and the two ways to put
 * something in a folder underneath, which is the right shape for the one screen
 * in this product that is entirely about what to do next.
 *
 * <p>The copy names the folder, because "conversations you add will appear
 * here" is true of every folder and says nothing about this one.
 *
 * <p><b>Neither button files into this folder, and the copy does not say they
 * do.</b> `recordHref` carries a return path and no folder, and /upload picks
 * one in its own form — so "record, import, or organize a conversation into
 * this folder" describes three steps, the last of which is the filing. A button
 * promising to record straight into a folder would be promising a parameter
 * that does not exist.
 */
function EmptyFolder({ name, folderId }: { name: string; folderId: string }) {
  return (
    <EmptyPanel
      /*
        THE THING THAT IS MISSING IS CONVERSATIONS, NOT FOLDERS.
        <p>It was the folder's own glyph, which is the right one on the folder
        LIST -- there, what there is none of is folders. Here the folder exists;
        it is what goes in it that does not, and the sentence under this says so.
        <p>`FileAudio`, which is what this product draws for a conversation
        everywhere else: the row icon on Home, Library and this page, the
        meeting chip in the chat composer, the import dialog. Not
        `MessageSquare` -- that already means a comment or a chat thread here,
        so it would read as "no messages" rather than "no conversations".
      */
      icon={FileAudio}
      heading="Nothing here yet"
      /* Labelled for anything that cannot see them: two glyphs on their own
         would be a pair of unnamed buttons at the end of an empty page. */
      actions={
        <>
          <Button variant="outline" size="icon" asChild title="Record a conversation">
            {/* Back to this folder afterwards, which is the only thing
                `recordHref` carries -- see the note above for why it cannot
                carry the folder itself. */}
            <Link href={recordHref(folderHref(folderId))} aria-label="Record a conversation">
              <Mic className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="icon" asChild title="Import a recording">
            <Link href="/upload" aria-label="Import a recording">
              <Plus className="h-4 w-4" />
            </Link>
          </Button>
        </>
      }
    >
      Conversations you add to {name} will appear here. Record, import, or
      organize a conversation into this folder.
    </EmptyPanel>
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
            {/* The same glyph as the row it belongs to, and as the word
                "conversation" beside it. */}
            <FileAudio className="mr-2 h-4 w-4" /> Open conversation
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
