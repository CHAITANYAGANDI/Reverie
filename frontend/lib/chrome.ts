import { folderIdFrom, isRecordPath } from "@/lib/routes";

/**
 * What the band carries, and the one rule that changes it.
 *
 * <h2>This replaced a per-page header, and the replacement is the point</h2>
 *
 * <p>The old top bar was 64px shared between two unrelated things: global
 * actions (search, Import, Record) and the actions of the page underneath (a
 * folder's rename and delete, a meeting's Share and Export). They competed for
 * the same end of the same row, so `headerChrome` existed to referee — search
 * left on Account Settings, Import and Record left on the chat and on a
 * meeting, five buttons in a row on a folder page collapsed to three. Every one
 * of those rules was a fix for the crowding, not a statement about the action.
 *
 * <p>V2 removes the crowding instead of refereeing it. The band is 48px of
 * global chrome and nothing else; page actions live in the page, inside the
 * measure, next to what they act on. A band that is the same shape on every
 * screen is the whole reason it can be 48px and can be trusted — chrome that
 * drops two buttons when you open Settings reads as chrome that is broken, and
 * that is what the old rules produced once they were the only rules left.
 *
 * <p>So Find, Record and Import are on every page now. What is left here is the
 * single rule with a consequence rather than an opinion, plus the folder that
 * page actions need. The rules that were dropped, with the reasoning they were
 * dropped against, are written down in
 * docs/v2-implementation/feature-parity.md §8 — they were argued for at length
 * in the file this replaced and should not be re-litigated from silence.
 */
export interface BandChrome {
  /**
   * Whether the band offers to make a meeting — Import and Record.
   *
   * <p>False only while a recording is in hand, or on the page that exists to
   * record. Record there would be offering to start what is already running,
   * and Import would be a file picker over a live microphone: a second way to
   * make a meeting while the first one is unsaved and still losable.
   *
   * <p>This is the rule that must survive navigation. The recorder outlives
   * route changes, so wandering onto Home mid-meeting must not put both buttons
   * back — which is why it takes the recorder's state and not just the path.
   */
  create: boolean;
  /**
   * The folder the page is inside, or null.
   *
   * <p>One caller now, and it is the import dialog: a file dropped while you
   * are standing in a folder lands in that folder. Read from the path because
   * the shell does not know what page it is wrapping.
   *
   * <p>It had a second caller until the folder's own rename and delete moved
   * into the folder's masthead. They were rendered by the shell, at the right
   * of a full-width row, which put them about 340px clear of a centred 680px
   * document — see components/folder-actions.tsx. Nothing about the band
   * changed with that move, and nothing folder-specific belongs in it.
   */
  folderId: string | null;
}

/**
 * Decide the band for a pathname.
 *
 * @param recording whether the recorder is holding anything — mid-recording,
 *   paused, or stopped with audio not yet saved.
 */
export function bandChrome(pathname: string, recording = false): BandChrome {
  return {
    create: !(recording || isRecordPath(pathname)),
    folderId: folderIdFrom(pathname),
  };
}
