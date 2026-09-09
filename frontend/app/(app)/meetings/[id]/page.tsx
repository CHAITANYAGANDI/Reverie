"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  RefreshCw,
  Upload,
  Loader2,
  AlertTriangle,
  Clock,
  Languages,
  Users,
  Check,
  Quote,
  Youtube,
  Pencil,
  ScrollText,
  Search,
  X,
  Bookmark,
  Highlighter,
  Captions,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ClipboardCopy,
  ListChecks,
  MessageSquare,
  Square,
  FileSliders,
} from "lucide-react";
import {
  useGetMeetingQuery,
  useGetSummaryQuery,
  useGetTranscriptQuery,
  useGetMeetingActionItemsQuery,
  useDeleteMeetingMutation,
  useGetChatQuery,
  useGetProjectQuery,
  useAskChatMutation,
  useGetChatModesQuery,
  useTranslateMeetingMutation,
  useGetTranslationsQuery,
  useGetLanguagesQuery,
  useRenameSpeakersMutation,
  useMergeSpeakersMutation,
  useReprocessMeetingMutation,
  useEditSegmentsMutation,
  useSetSegmentSpeakerMutation,
  useGetSummaryTemplatesQuery,
  useResummarizeMutation,
  useGetMomentsQuery,
  useGetInsightsQuery,
  useCreateMomentMutation,
  useDeleteMomentMutation,
  useGetMeetingConversationsQuery,
  useCreateMeetingConversationMutation,
  useRenameConversationMutation,
  useDeleteConversationMutation,
  useDeleteChatExchangeMutation,
  isNotFoundError,
} from "@/lib/api";
import type {
  ChatMode,
  SpeakerStats,
  SpokenWord,
  MeetingTranslation,
  SummaryResponse,
  SummarySection,
} from "@/lib/types";
import { useActiveChat } from "@/lib/active-chat";
import {
  SidePane,
  closeSidePane,
  openSidePane,
  toggleSidePaneExpanded,
  useSidePane,
} from "@/components/side-pane";
import { Button } from "@/components/ui/button";
import { useRecordingJob } from "@/lib/recording-context";
import { ProcessingCard } from "@/components/processing-card";
import { JumpTo } from "@/components/jump-to";
import {
  ProcessingSummary,
  ProcessingTranscript,
  ProcessingActionItems,
  ProcessingChatRail,
} from "@/components/processing-placeholders";
import { revealPlan } from "@/lib/processing-stages";
import {
  meetingPanels,
  meetingHas,
  meetingState,
  type PanelState,
} from "@/lib/meeting-panels";
import { trackProcessing } from "@/lib/processing-jobs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { MeetingLoadError } from "@/components/meeting-load-error";
import { ResourceLoadError } from "@/components/resource-load-error";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActionItemRow } from "@/components/action-item-row";
import { NewActionItemDialog } from "@/components/new-action-item-dialog";
import { TranslationDialog, ReadingIn, ORIGINAL } from "@/components/translation-dialog";
import { TranslatedTranscript } from "@/components/translated-transcript";
import { AudioPlayer, useAudioController } from "@/components/audio-player";
import { MeetingTitle, MeetingTags } from "@/components/meeting-title";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { speakerColor } from "@/lib/speakers";
import { initialsOf } from "@/lib/avatar";
import {
  MeetingMargin,
  ACTION_ITEMS_ANCHOR,
  INSIGHTS_ANCHOR,
} from "@/components/v2/meeting/meeting-margin";
import { AmbientCanvas } from "@/components/v2/ambient-canvas";
import { MeetingMenu } from "@/components/meeting-menu";
import { InsightsPanel } from "@/components/insights-panel";
import { ExportDialog } from "@/components/export-dialog";
import { copySummary, copyTranscript } from "@/lib/minutes";
import { subscribeMeetingStatus } from "@/lib/ws";
import { HOME, LIBRARY, folderHref } from "@/lib/routes";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  statusLabel,
  statusProgress,
  isTerminal,
  timecode,
} from "@/lib/format";
import { useMeetingProgress } from "@/lib/progress";
import { useAllowance, aiRefusal, reprocessCost } from "@/lib/allowance";
import { languageName } from "@/lib/language";
// Shared with the transcript editor, so reading and correcting agree about
// where the paragraphs are and the page does not reflow when you switch modes.
import { groupIntoTurns, type Turn } from "@/lib/turns";
import { SpeakerEditor } from "@/components/speaker-editor";
import { TurnActions, TurnReactions } from "@/components/turn-actions";
import {
  TranscriptEditor,
  type TranscriptEditorHandle,
  type TranscriptEditorStatus,
} from "@/components/transcript-editor";
import { ChatHistory } from "@/components/chat-history";
import { ChatComposer } from "@/components/chat-composer";
import { ChatDock } from "@/components/chat/chat-shell";
import { AskPanel } from "@/components/chat/ask-panel";
import { AskHeader } from "@/components/chat/ask-header";
import { AskThread } from "@/components/chat/ask-thread";
import { AskEvidence } from "@/components/chat/ask-evidence";
import { BrandMark } from "@/components/v2/brand-mark";
import { usePendingTurn, announceAnswer } from "@/lib/pending-turn";
import { useThreadScroll } from "@/lib/use-thread-scroll";
import { MEETING_PROMPTS, toPrompts } from "@/lib/chat-prompts";
import { useRotatingPrompts } from "@/lib/use-rotating-prompts";
import {
  SelectionMenu,
  isInsideSelectionMenu,
  type SelectionAction,
} from "@/components/selection-menu";
import {
  ReassignSpeakerDialog,
  type ReassignTarget,
} from "@/components/reassign-speaker-dialog";
import { MomentsPanel } from "@/components/moments-panel";
import { ActionItemDialog, type Passage } from "@/components/moment-composer";
import {
  askPrefix,
  attributedQuote,
  highlightOver,
  isMarked,
  readSelection,
  segmentMarks,
  summarizePrompt,
  tokenize,
  wordRangeFor,
  type SegmentMark,
  type SelectionCapture,
} from "@/lib/moments";
import { cn } from "@/lib/utils";
import type {
  MeetingStatus,
  MomentKind,
  StatusEvent,
  TranscriptMoment,
  TranscriptSegment,
} from "@/lib/types";

export default function MeetingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [live, setLive] = React.useState<StatusEvent | null>(null);
  const meeting = useGetMeetingQuery(id);

  /**
   * The save that is still running, if it is this meeting's.
   *
   * <p>This page carries the wait for the meeting it is showing, including the
   * one control that ends it. Matched on the id: the save may still be
   * following a different meeting entirely, and offering to stop that one from
   * this page would delete something not on screen.
   */
  const recordingJob = useRecordingJob();
  const stoppable = recordingJob.phase === "processing" && recordingJob.job?.id === id;

  /**
   * Call the pipeline off, which means deleting what it is working on.
   *
   * <p>The worker is mid-flight and cannot be recalled. Once the meeting is
   * gone this page is about nothing, so it leaves for the list rather than
   * sitting on a 404 of the thing it just deleted.
   */
  async function stopProcessing() {
    if (
      !window.confirm(
        "Stop processing?\n\nThe meeting and its recording are deleted. The audio " +
          "only exists on the server now, so this cannot be undone.",
      )
    ) {
      return;
    }
    if (await recordingJob.stop()) router.push("/home");
  }

  /**
   * Controlled so the transcript can hand a selection to the chat.
   * "Ask Reverie" about a highlighted sentence has to leave the tab it was
   * invoked from, which an uncontrolled Tabs cannot do.
   */
  const [tab, setTab] = React.useState("summary");
  /*
   * The navigator, opened from the `⋯` menu or with `⌘.`.
   *
   * <p>Page state rather than the menu's, like every other dialog the menu
   * opens: a dialog inside a Radix menu is unmounted in the same frame the
   * menu closes. See the export and translation dialogs at the foot of this
   * component.
   */
  const [jumping, setJumping] = React.useState(false);

  /**
   * Correcting the whole transcript, as a mode.
   *
   * The state is here rather than in the panel because the control that leaves
   * the mode sits on the tab row, which is this component's markup. The drafts
   * stay down in the editor; it publishes what the button needs to draw itself
   * through `onStatus`, and what the button needs to *do* through the ref.
   */
  const [reprocessMeeting, { isLoading: reprocessing }] = useReprocessMeetingMutation();
  // Keyed so the three places that can rewrite this summary share one
  // in-flight flag: this page's menu item, the template picker on the tab row,
  // and the "transcript changed" banner. Without it each knows only about its
  // own call, and the menu would start a second rewrite on top of the picker's.
  const [resummarize, { isLoading: regenerating }] = useResummarizeMutation({
    fixedCacheKey: `resummarize:${id}`,
  });

  const [editingTranscript, setEditingTranscript] = React.useState(false);
  const transcriptEditor = React.useRef<TranscriptEditorHandle>(null);
  const [editStatus, setEditStatus] = React.useState<TranscriptEditorStatus>({
    dirty: 0,
    saving: false,
  });
  const onEditStatus = React.useCallback((next: TranscriptEditorStatus) => {
    setEditStatus(next);
  }, []);
  const leaveEditing = React.useCallback(() => setEditingTranscript(false), []);

  /**
   * Switching tabs out of an unsaved correction pass.
   *
   * The editor asks before discarding, and refuses to close if the answer is
   * no — so a tab change that would have thrown the work away is refused with
   * it, rather than happening anyway behind a dialog the user already declined.
   */
  function changeTab(next: string) {
    if (editingTranscript && next !== "transcript" && !transcriptEditor.current?.cancel()) {
      return;
    }
    setTab(next);
  }

  /**
   * A part of the summary the margin has asked to be shown.
   *
   * <p>Held rather than acted on immediately, because the answer takes two
   * steps: the summary has to be the mounted tab before there is anything to
   * scroll to. Cleared once it has been.
   */
  const [pendingIndex, setPendingIndex] = React.useState<string | null>(null);

  /**
   * Go to an indexed section, from wherever the reader is.
   *
   * <p>Through `changeTab`, not `setTab`, so a half-finished transcript
   * correction is still asked about rather than discarded by a click in the
   * margin -- and if that question is declined the tab does not change, which
   * is why the anchor is only remembered and not scrolled to here.
   */
  const goToIndex = React.useCallback((anchor: string) => {
    changeTab("summary");
    setPendingIndex(anchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * The scroll, once the summary is on screen.
   *
   * <h2>Why it waits for a frame instead of just doing it</h2>
   *
   * <p>The element does not exist when the click happens, and -- measured --
   * not in the commit after it either. `TabsContent` renders through Radix's
   * `Presence`, which promotes a newly selected panel in a layout effect, so
   * the children mount in a *second* commit. That commit is a re-render of the
   * tab panel's own subtree: this component is not part of it, so keying this
   * effect on anything, or leaving it with no dependency array at all, gives
   * it no second chance to look. Both were tried; both left the page sitting
   * still, which is the bug this is fixing.
   *
   * <p>So it watches the document rather than React. One `getElementById` per
   * frame until the anchor turns up, with a deadline so a mistyped id cannot
   * leave a loop running behind a page somebody is reading. In practice it
   * resolves on the first or second frame.
   *
   * <p>Both anchors render unconditionally inside that panel, so the only way
   * to reach the deadline is a bug here rather than a state of the meeting.
   */
  const INDEX_SCROLL_DEADLINE_MS = 1000;
  React.useEffect(() => {
    if (!pendingIndex || tab !== "summary") return;
    let frame = 0;
    const giveUpAt = Date.now() + INDEX_SCROLL_DEADLINE_MS;
    function look() {
      const target = document.getElementById(pendingIndex as string);
      if (target) {
        target.scrollIntoView({ behavior: "smooth" });
        setPendingIndex(null);
        return;
      }
      if (Date.now() >= giveUpAt) {
        setPendingIndex(null);
        return;
      }
      frame = requestAnimationFrame(look);
    }
    look();
    // Cancelled on the way out, so leaving the meeting mid-wait does not leave
    // a callback holding an id for a page that has gone.
    return () => cancelAnimationFrame(frame);
  }, [pendingIndex, tab]);

  /**
   * Text pushed into the chat from elsewhere on the page.
   *
   * Carries a nonce because the same passage can be asked about twice, and a
   * bare string would compare equal the second time and never re-fire. `send`
   * distinguishes a complete prompt ("summarize this") from an opening the user
   * still has to finish ("about this passage: …").
   */
  const [composed, setComposed] = React.useState<{
    text: string;
    send: boolean;
    nonce: number;
  } | null>(null);

  // No tab switch any more: the chat lives in the rail beside the transcript,
  // so asking about a passage no longer costs the passage. That was the whole
  // reason this had to move the reader somewhere else.
  /*
   * WHICH TRANSCRIPT TOOL IS OPEN, if any -- lifted here from the panel.
   *
   * <p>`19-meeting-transcript.png` has no utility row at all: the first spoken
   * line begins under the mode row. Find, the marks index and the speaker stats
   * are real and rare, so they live in the overflow menu and only the one that
   * was asked for takes any height. The menu is drawn in the masthead, so the
   * state it drives has to be here.
   */
  const [tool, setTool] = React.useState<"find" | "marks" | "speakers" | null>(null);
  /*
   * Whether the reader has asked to add a tag.
   *
   * <p>The masthead used to carry a dashed `+ Tag` pill on every meeting,
   * tagged or not, which is an empty affordance on the overwhelming majority of
   * them and part of what kept that area looking utility-heavy. Tags that exist
   * still show, because a tag is a fact about the document; adding one is in
   * the overflow menu with the rest of what you do *to* a meeting.
   */
  const [tagging, setTagging] = React.useState(false);

  const askAbout = React.useCallback((text: string, send: boolean) => {
    /*
     * ASKING OPENS THE CHAT, because the chat is no longer already open.
     *
     * <p>It used to be: the pane defaulted to visible, so a question typed
     * into it from a transcript selection landed somewhere already on screen.
     * The pane is a requested state now — see components/side-pane — so
     * anything that puts a question in it has to ask for it too, or "Ask about
     * this" would compose a question into a column nobody can see.
     *
     * <p>`openSidePane` and not a toggle: asking twice in a row must not shut
     * the answer to the first question.
     */
    openSidePane();
    setComposed({ text, send, nonce: Date.now() });
  }, []);

  const status: MeetingStatus = (live?.status ?? meeting.data?.status ?? "CREATED") as MeetingStatus;
  /**
   * Whether that status is a fact or the placeholder above it.
   *
   * <p>`"CREATED"` is what this reads before the query resolves, which is every
   * first render. It is a real status, so nothing downstream can tell it apart
   * from the server having said so — see where this is used below.
   */
  const statusKnown = Boolean(live?.status ?? meeting.data?.status);
  const ready = status === "READY";
  const failed = status === "FAILED";
  const terminal = isTerminal(status);

  /**
   * The percentage on the card, from the socket and the poll together.
   *
   * <p>Called here rather than beside the card because the card is conditional
   * and this is not: the number has to keep being computed while the meeting
   * runs, or every stage it spent hidden would be forgotten. See lib/progress.
   */
  const percent = useMeetingProgress(id, status, live?.progress ?? statusProgress(status));

  // Read here rather than inside `onReprocess`, which is not a component and
  // so cannot call a hook. Used only to say what a reprocess will cost.
  const allowance = useAllowance();

  const audio = useAudioController();

  React.useEffect(() => {
    if (terminal) return;
    const t = setInterval(() => meeting.refetch(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal, id]);

  /**
   * Opening a meeting that is still being made is enough to start following it.
   *
   * <p>Without this the watcher only knew about jobs started in this tab, so a
   * recording made on a phone — or one whose tab was reloaded — showed a
   * progress banner here and nothing anywhere else, and navigating away lost
   * sight of it entirely. Tracking is idempotent and the watcher drops the id
   * itself once the meeting settles, so this is safe to run on every render
   * where the meeting is unfinished.
   *
   * <p><b>Not until the status is actually known.</b> `status` falls back to
   * `CREATED` while the query is in flight, which is not terminal — so opening
   * a meeting that finished last week tracked it for the frame before the
   * server answered, and the watcher then announced "it is ready" about a
   * meeting nobody had been waiting for. The watcher no longer announces a
   * completion it did not see happen either; this is the other half, and it
   * stops the pointless poll as well as the pointless toast.
   */
  React.useEffect(() => {
    if (!statusKnown || terminal) return;
    trackProcessing(id);
  }, [statusKnown, terminal, id]);

  React.useEffect(() => {
    const sub = subscribeMeetingStatus(id, {
      onEvent: (e) => {
        setLive(e);
        if (isTerminal(e.status)) meeting.refetch();
      },
    });
    return () => sub.deactivate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /**
   * Play from a moment, wherever the ask came from.
   *
   * <p>The player only exists on the transcript now, so every other caller — a
   * quotation in the summary, an action item's source, a `?t=` deep link — is
   * asking to hear something while looking at a tab that has nothing to play
   * it. Each of those used to call `seekTo` straight, and would now silently
   * do nothing.
   *
   * <p>So the moment is parked and the tab is switched. The effect below runs
   * after the commit that mounts the player, which is the earliest point there
   * is a media element to seek. Landing on the transcript is the right answer
   * anyway: somebody who clicked a citation wants to see the words as well as
   * hear them.
   */
  const pendingSeek = React.useRef<number | null>(null);

  const seekWhenReady = React.useCallback(
    (seconds: number) => {
      const el = audio.ref.current;
      if (!el) return;
      const seek = () => audio.seekTo(seconds);
      // Seeking before metadata lands is dropped by the browser, which is what
      // made a deep link into a long recording start from zero.
      if (el.readyState >= 1) seek();
      else el.addEventListener("loadedmetadata", seek, { once: true });
    },
    [audio],
  );

  /**
   * Bring the line at `seconds` onto the screen.
   *
   * <p>Seeking moved the clock and lit the matching line up, but never scrolled
   * to it -- so a citation, a topic or a mark forty minutes into a recording
   * highlighted a paragraph the reader could not see. The transcript already
   * marks every utterance with `data-seg`, which is what the selection code
   * reads, so the line is findable without a second index of the document.
   *
   * <p>In here rather than in the navigator, because it is true of all five
   * ways of arriving: a chat citation, a clicked timecode, a moment, a deep
   * link, and now Jump to. One pipeline, one scroll.
   *
   * <p>`block: "center"` because the interesting thing about the destination
   * is usually the sentence after it.
   */
  const revealAt = React.useCallback((seconds: number) => {
    const segs = transcriptRef.current;
    // The last segment that has started by then: `find` on a reversed copy
    // rather than a search, because a transcript is small and already sorted.
    let id: string | undefined;
    for (const seg of segs) {
      if ((seg.start ?? 0) > seconds) break;
      if (seg.id) id = seg.id;
    }
    if (!id) return;
    // After the paint that the tab switch or the seek caused: the element may
    // not exist yet on the frame the tab changed.
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-seg="${id}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, []);

  function playFrom(seconds: number) {
    if (tab === "transcript") {
      seekWhenReady(seconds);
      revealAt(seconds);
      return;
    }
    pendingSeek.current = seconds;
    changeTab("transcript");
  }

  React.useEffect(() => {
    if (tab !== "transcript") return;
    const t = pendingSeek.current;
    if (t == null) return;
    pendingSeek.current = null;
    seekWhenReady(t);
    revealAt(t);
  }, [tab, seekWhenReady, revealAt]);

  // Deep link from a workspace-chat citation or a semantic search hit:
  // /meetings/{id}?t=132.5 opens the meeting and seeks to that moment.
  // Read from location rather than useSearchParams() so the page stays
  // prerenderable without a Suspense boundary.
  const seekedRef = React.useRef(false);
  React.useEffect(() => {
    if (seekedRef.current || !ready) return;
    const t = Number(new URLSearchParams(window.location.search).get("t"));
    if (!Number.isFinite(t) || t <= 0) return;
    seekedRef.current = true;
    pendingSeek.current = t;
    // Not playFrom(): this runs on the first ready render, when the tab is
    // still the default, so it has to go through the switch rather than around
    // it.
    changeTab("transcript");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  /*
   * Asked for while the meeting is still being made, not only once it is READY.
   *
   * These three used to be skipped until `ready`, which is what made the page a
   * progress card with nothing behind it: there was no data because nothing had
   * asked for any. Skipping now means only "this meeting failed, there will
   * never be anything" -- so whether a transcript exists is a question that gets
   * answered rather than assumed, and the stage strip below is reading a fact.
   *
   * On today's backend `CallbackService.applyResult` writes the transcript, the
   * summary, the action items and the READY status in one transaction, so in
   * practice all three arrive together. That is deliberately not baked in here:
   * the UI reveals whatever exists whenever it exists, so a backend that starts
   * persisting the transcript earlier needs no change on this page.
   */
  const summary = useGetSummaryQuery(id, { skip: failed });
  const transcript = useGetTranscriptQuery(id, { skip: failed });
  const actions = useGetMeetingActionItemsQuery(id, { skip: failed });
  /*
   * What actually exists -- as three states, not two.
   *
   * `hasSummary = Boolean(summary.data)` was the bug behind two of the
   * screenshots. `data` is undefined for four different reasons -- the request
   * failed, it is still in flight, it was never asked, or the server really
   * has nothing -- and only the last of them is "this meeting has no summary".
   * Collapsing them to a boolean meant a 500 or a 401 on a *finished* meeting
   * came out the far side as "No summary available.", which is a confident
   * statement about somebody's data made on the strength of a request that
   * never answered. The transcript beside it said "Transcript unavailable." for
   * exactly the same reason.
   *
   * There is deliberately no `??` and no `Boolean()` on these three anywhere in
   * this file. Both are how the distinction gets lost, and both are easy to
   * write back in without noticing; lib/meeting-panels holds the mapping, and
   * its tests hold the argument list.
   */
  const queries = { summary, transcript, actions };
  const { hasTranscript, hasSummary } = meetingHas(queries);
  /** Still being made. Distinct from `failed`, which has its own screen. */
  const processing = !terminal;
  /*
   * What each area shows, decided in one place from what actually exists.
   *
   * Pure and tested on its own (lib/processing-stages), because it is the part
   * that regresses quietly: one `&&` in the wrong place turns "generating your
   * summary" back into "No summary available", which is the message this whole
   * change exists to stop showing over a summary that is being written.
   */
  const view = revealPlan({
    status,
    reported: live?.progress,
    hasTranscript,
    hasSummary,
  });
  /*
   * The two questions, composed -- see lib/meeting-panels.
   *
   * `view` answers "is the meeting finished"; these answer "and did the request
   * succeed", which the page never used to ask. Both are needed: a summary that
   * has not been written yet is not a summary that failed to load, and a
   * summary that failed to load is not a summary that does not exist.
   */
  const {
    summary: summaryState,
    transcript: transcriptState,
    actionItems: actionsState,
  } = meetingPanels(queries, view);
  // The tab counts what is left, not what was found. "Action items 6" beside a
  // list where five are ticked off reads as six things to do.
  const openActions = (actions.data ?? []).filter((a) => a.status !== "DONE").length;

  // Also read inside the transcript panel; RTK Query dedupes to one request.
  // Fetched here because the player needs it for "play highlights only".
  const moments = useGetMomentsQuery(id, { skip: !ready });
  /*
   * The segments, for `revealAt`.
   *
   * <p>A ref so the callback is stable: it is called from an effect keyed on
   * the tab, and a dependency on the transcript array would re-run that effect
   * every time the query revalidated.
   */
  const transcriptRef = React.useRef<TranscriptSegment[]>([]);

  /*
   * Whatever the transcript query last returned, for `revealAt`.
   *
   * <p>Assigned in an effect rather than during render: writing a ref while
   * rendering is what React's strict mode double-invoke exists to catch.
   */
  const segmentsNow = transcript.data?.segments;
  React.useEffect(() => {
    transcriptRef.current = segmentsNow ?? [];
  }, [segmentsNow]);

  /*
   * `⌘.` / `Ctrl+.` opens the navigator.
   *
   * <p>The shortcut `24-meeting-menu.png` puts beside it, and free: the only
   * other window-level binding in the app is `⌘K` for global search, which
   * this must not take. Bound on the window rather than on a control so it
   * works while the focus is in the transcript, but stood down while a
   * correction pass is open -- the editor owns the keyboard then.
   *
   * <p>Only with a transcript. Every row in the navigator is a place in one.
   */
  const canJump = ready && (transcript.data?.segments?.length ?? 0) > 0;
  React.useEffect(() => {
    if (!canJump || editingTranscript) return;
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key !== ".") return;
      e.preventDefault();
      setJumping((v) => !v);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canJump, editingTranscript]);
  // And here because minutes open with the decisions. The InsightsPanel asks
  // for the same thing, and RTK Query serves both from one request.
  const insights = useGetInsightsQuery(id, { skip: !ready });
  /*
   * WHAT THE MARGIN SAYS, DERIVED FROM WHAT THE PAGE ALREADY HAS.
   *
   * <p>Not one request between them. The summary's sections carry the topics
   * and the outline; the insights carry the decisions and the risks; the action
   * items are counted from the list the document renders. A margin describing
   * what is on screen must not be the most expensive thing on it.
   *
   * <p>`insights.data === undefined` while the request is out, so this reads
   * nothing into silence: `insightsReady` gates the two sentences that would
   * otherwise be "No decisions" produced by a dropped connection.
   */
  const marginDecisions = React.useMemo(
    () => (insights.data ?? []).filter((i) => i.kind === "DECISION").length,
    [insights.data],
  );
  const marginRisks = React.useMemo(
    () => (insights.data ?? []).filter((i) => i.kind === "RISK").length,
    [insights.data],
  );

  /**
   * What language the meeting is being read in.
   *
   * Held here rather than in a panel because it applies to all three tabs: the
   * summary, the tasks and the transcript are one meeting, and translating the
   * summary while the transcript beside it stays in the source language is the
   * behaviour this replaced.
   *
   * The mutation is fired on every switch, including back to a language already
   * translated — the server returns what it has without spending a model call,
   * which is what lets this component avoid tracking what exists.
   */
  const [readingIn, setReadingIn] = React.useState<string>(ORIGINAL);
  const [translate, { data: translation, isLoading: translating, reset: clearTranslation }] =
    useTranslateMeetingMutation();
  const availableTranslations = useGetTranslationsQuery(id, { skip: !ready });
  // Also asked for by the translation bar; RTK Query serves both from one
  // request. Read here so an export can say what the recording is still in.
  const languages = useGetLanguagesQuery();
  const showing = readingIn === ORIGINAL ? undefined : translation;

  async function onReadIn(next: string, includeTranscript = false) {
    setReadingIn(next);
    if (next === ORIGINAL) {
      clearTranslation();
      return;
    }
    try {
      await translate({ id, targetLanguage: next, includeTranscript }).unwrap();
    } catch {
      toast.error("Could not translate this meeting.");
      setReadingIn(ORIGINAL);
    }
  }

  const [remove, removeState] = useDeleteMeetingMutation();

  /**
   * The download dialog, opened from the export menu.
   *
   * Held here rather than inside the menu because a Radix menu closes when an
   * item is chosen, and a dialog mounted inside it would be unmounted in the
   * same frame it was asked to open.
   */
  const [exporting, setExporting] = React.useState(false);

  /** The reading-language dialog, opened from the same menu. */
  const [pickingLanguage, setPickingLanguage] = React.useState(false);

  /**
   * What goes on the clipboard, in two shapes.
   *
   * The summary is prose you paste into a reply; the minutes are a document you
   * paste into a doc or an email. Speakers come from the transcript because
   * "Present:" is the line every set of minutes opens with, and Reverie knows
   * who spoke without anyone having typed an attendee list.
   */
  function minutesInput() {
    const speakers = Array.from(
      new Set((transcript.data?.segments ?? []).map((s) => s.speaker).filter(Boolean)),
    );
    return {
      meeting: meeting.data!,
      summary: summary.data,
      actionItems: actions.data,
      insights: insights.data,
      speakers,
    };
  }

  /**
   * The folder this meeting is filed in, for the back link, or undefined.
   *
   * <p>Skipped when it is filed nowhere, so an unfiled meeting costs no
   * request. Where it is filed, the folder page and the Library margin have
   * usually already fetched this, so RTK Query serves it from cache.
   */
  const folderQuery = useGetProjectQuery(meeting.data?.projectId ?? "", {
    skip: !meeting.data?.projectId,
  });
  const folder = folderQuery.data;

  /*
   * The people this meeting has, named — real diarization output, ordered by
   * who spoke most, and empty for a document or a transcript that does not
   * exist yet. Nothing is invented when it is empty; the masthead simply has
   * one fewer fact. See the note where it is rendered.
   */
  const voices = React.useMemo(
    () =>
      (transcript.data?.speakers ?? [])
        .map((s) => s.speaker)
        .filter((name): name is string => Boolean(name)),
    [transcript.data],
  );

  async function onCopySummary() {
    if (!meeting.data) return;
    const ok = await copySummary(minutesInput());
    if (ok) toast.success("Summary copied.");
    else toast.error("Nothing to copy yet.");
  }

  async function onCopyTranscript() {
    const ok = await copyTranscript(transcript.data?.segments ?? []);
    if (ok) toast.success("Transcript copied.");
    else toast.error("Nothing to copy yet.");
  }

  /**
   * Write the summary again, under the template it already uses.
   *
   * The same call the template picker makes, with the current slug rather than
   * a new one — which is what "regenerate" means. Worth having separately from
   * the picker because the commonest reason to want it has nothing to do with
   * templates: the transcript was corrected, and the summary still asserts what
   * it used to say.
   */
  async function onRegenerateSummary() {
    try {
      await resummarize({ id, template: summary.data?.templateSlug ?? "general" }).unwrap();
      toast.success("Summary rewritten from the current transcript.");
    } catch {
      toast.error("Could not rewrite the summary.");
    }
  }

  /**
   * Run the whole pipeline again over the same audio.
   *
   * <b>Destructive, and the confirm says exactly how.</b> Reprocessing rebuilds
   * the transcript from the recording, so every line anybody corrected by hand
   * and every speaker they named goes back to what the transcriber produces.
   * Nothing merges the old work into the new text — the segments are replaced
   * wholesale, and there is no version of "keep my edits" that would not mean
   * pasting corrections onto lines that may no longer exist.
   *
   * Not awaited to completion: the server answers 202 with a queued job, and
   * the page follows the meeting's status from there like any other processing
   * meeting.
   */
  async function onReprocess() {
    // What it costs, first.
    //
    // This dialog warned about the hand corrections and the speaker names,
    // and said nothing at all about the minutes, which are not replaceable.
    // Reprocessing sends the audio back to the provider and is charged again
    // in full, so a thirty-minute meeting reprocessed three times has spent
    // ninety of the hundred an account ever gets. Until now the button that
    // did that looked free. See reprocessCost.
    const cost = reprocessCost(allowance, m?.durationSeconds);
    const warning = m?.status === "FAILED"
      ? "Try processing this meeting again?\n\n" + cost
      : "Reprocess this meeting?\n\n" + cost
        + "\n\nThe transcript and summary will be rebuilt from the recording. "
        + "Any corrections you typed, and any speakers you named, will be replaced.";
    if (!window.confirm(warning)) return;
    try {
      await reprocessMeeting(id).unwrap();
      // The last event this page heard said READY, and `status` prefers the
      // socket over the refetched meeting — so leaving it there would keep the
      // whole page in its finished state, showing the summary about to be
      // replaced, until the worker's first event arrived minutes later. The
      // meeting is QUEUED as of this line; forget what it used to be.
      setLive(null);
      toast.success("Reprocessing started.", {
        description: "The transcript and summary are being rebuilt.",
      });
    } catch {
      toast.error("Could not start reprocessing.");
    }
  }

  async function onDelete() {
    if (!window.confirm("Delete this meeting and all its data?")) return;
    try {
      await remove(id).unwrap();
      toast.success("Meeting deleted.");
      router.push(HOME);
    } catch {
      toast.error("Could not delete.");
    }
  }

  /*
   * Four outcomes, decided in one place -- see `meetingState` in
   * lib/meeting-panels, where the matrix is asserted.
   *
   * This was `isLoading` -> skeleton, `isError` -> error screen, and the second
   * half is what made an open meeting vanish. RTK Query sets `isError` on a
   * *refetch* that fails while keeping the last good `data`, and this page
   * refetches constantly -- an invalidation after a rename, a socket event, a
   * tab regaining focus. So a blip during any of those replaced a meeting
   * somebody was reading with an error card about it, when the meeting was
   * still right there in the cache.
   *
   * Before that it was `isError || !data`, which said "Meeting not found" for
   * every failure -- the most alarming false thing this page could say.
   */
  const loadState = meetingState(
    {
      isUninitialized: meeting.isUninitialized,
      isLoading: meeting.isLoading,
      isFetching: meeting.isFetching,
      isError: meeting.isError,
      isSuccess: meeting.isSuccess,
      hasData: meeting.data !== undefined,
      error: meeting.error,
    },
    isNotFoundError,
  );
  if (loadState === "loading") return <Skeleton className="h-64 w-full" />;
  if (loadState !== "ready") {
    // "Meeting not found" only for a real 404; everything else gets the retry
    // screen. MeetingLoadError makes that split from the error itself.
    return <MeetingLoadError error={meeting.error} onRetry={() => void meeting.refetch()} />;
  }
  // `ready` means there is a body. Narrowed for TypeScript, which cannot see
  // that through the function above.
  if (!meeting.data) return <Skeleton className="h-64 w-full" />;

  const m = meeting.data;
  // A PDF was never spoken: no audio, no timeline, nothing to seek to.
  const isDocument = m.sourceType === "DOCUMENT";
  const isVideoUpload = !!m.contentType && m.contentType.startsWith("video/");
  /** Whether the last stretch of the page sits under a floating bar. */
  const docked = ready && !!m.audioUrl && !isDocument && !isVideoUpload && tab === "transcript";
  const player = (
    <AudioPlayer
      src={m.audioUrl ?? ""}
      controller={audio}
      contentType={m.contentType}
      // The only source of a duration for anything recorded in the browser:
      // WebM out of a MediaRecorder carries none, so the element reports
      // Infinity and the scrubber has nothing to divide by. See
      // `playbackDuration` in lib/playback.ts.
      durationSeconds={m.durationSeconds}
      // Skip-silence, the speaker jumps and the coloured timeline are all read
      // out of the transcript rather than the audio signal — see
      // lib/playback.ts. Both queries are already in flight for the tabs below,
      // so RTK Query serves these from the same request.
      segments={transcript.data?.segments ?? []}
      moments={moments.data ?? []}
      // `audioUrl` is presigned and lasts fifteen minutes. This page is often
      // open for longer — reading the transcript is the point — and nothing
      // refreshes it, so the link the player is holding eventually stops
      // working. Refetching the meeting mints a new one; the player remembers
      // where the listener was and puts them back.
      onSourceExpired={() => void meeting.refetch()}
    />
  );
  // Only offered when there is something to erase. A YouTube import holds no
  // recording of ours, and offering to delete one would imply we had it.

  /**
   * How many marks this transcript carries, and how many voices are in it.
   *
   * <p>Both are real counts off queries the page already made, and both gate
   * their own menu item: an entry called Highlights over a transcript nobody
   * has marked opens an empty index.
   */
  const markCount = moments.data?.length ?? 0;
  const lineCount = transcript.data?.segments?.length ?? 0;

  /*
   * WHAT THIS READING MODE BRINGS TO THE OVERFLOW MENU.
   *
   * <p>On Summary: the template. On Transcript: find, the marks index, the
   * speaker stats, and correcting the words. Every one of them was a permanent
   * control above the document — a picker on the mode row and a three-toggle
   * row above the first spoken line — and the references have neither. They
   * are real and they are rare, which is what a menu is for.
   *
   * <p>Null rather than an empty fragment when the mode has nothing, so the
   * menu does not draw a separator over nothing.
   */
  const summaryItems = tab === "summary" && hasSummary;
  const transcriptItems = tab === "transcript" && lineCount > 0;
  const modeItems =
    summaryItems || transcriptItems ? (
      <>
        {summaryItems && (
          <TemplateItems meetingId={id} current={summary.data?.templateSlug ?? "general"} />
        )}
        {transcriptItems && (
          /* NO GROUP LABEL. It read "This transcript" over these four items,
             which is a heading explaining a separator -- and the separator
             already says the group is a group. The approved menu has none. */
          <>
            <DropdownMenuItem onSelect={() => setTool("find")}>
              <Search /> Find in transcript
            </DropdownMenuItem>
            {markCount > 0 && (
              <DropdownMenuItem onSelect={() => setTool("marks")}>
                <Highlighter /> Highlights ({markCount})
              </DropdownMenuItem>
            )}
            {/* Gated on there being lines rather than on the server having
                sent `speakers[]`: the strip derives the voices from the
                segments and falls back to them, so a transcript cached before
                the stats existed still has speakers to show.

                <p>"Edit speakers", and no count. It read "Speakers (3)", which
                named the panel after the noun rather than after what opening it
                lets you do -- the panel renames a voice. The count belonged to
                a menu that was also an index; the margin states it now, beside
                the other facts, where it is read rather than counted twice. */}
            <DropdownMenuItem onSelect={() => setTool("speakers")}>
              <Users /> Edit speakers
            </DropdownMenuItem>
            {/* Only over the original. A translated transcript is derived text:
                correcting it would edit a copy nothing else reads, leave the
                words it was translated from untouched, and be overwritten the
                next time the translation was refreshed. */}
            {!showing && (
              /* "Edit transcript". It was "Correct transcript", which named the
                 reason rather than the action -- and sat one row under a
                 "Speakers" that named a noun. Both say what pressing them
                 does now. */
              <DropdownMenuItem
                disabled={editingTranscript}
                onSelect={() => setEditingTranscript(true)}
              >
                <Pencil /> Edit transcript
              </DropdownMenuItem>
            )}
          </>
        )}
      </>
    ) : undefined;

  /*
   * THE MEETING'S ONE ACTION MENU, and Export is in it now.
   *
   * <p>Built here rather than inline because the masthead renders it and
   * the dialogs it opens keep their state on this page. It used to be
   * drawn into the shell's `HeaderSlot`, which is a full-width row: over
   * a centred 680px measure that put it hard right of the window and
   * reading as application chrome. See where it is rendered.
   */
  const meetingMenu = (
    <MeetingMenu
      meetingId={id}
      projectId={m.projectId}
      hasTranscript={(transcript.data?.segments?.length ?? 0) > 0}
      /* Which of the two documents is on screen. Copy summary and Regenerate
         summary are the brief's, and the transcript's menu does not carry
         them. */
      mode={tab === "summary" ? "summary" : "transcript"}
      hasSummary={ready && Boolean(summary.data)}
      canTranslate={ready}
      // Change language and Regenerate grey while either is running.
      // Both end in the summary being rewritten, and starting a second
      // one on top of the first is the race this closes.
      working={regenerating || translating}
      busy={removeState.isLoading}
      onCopySummary={() => void onCopySummary()}
      onCopyTranscript={() => void onCopyTranscript()}
      onRegenerateSummary={() => void onRegenerateSummary()}
      onTranslate={() => setPickingLanguage(true)}
      onReprocess={() => void onReprocess()}
      reprocessing={reprocessing}
      onDelete={() => void onDelete()}
      /* Export, as a menu item rather than a button beside the menu. Same
         dialog, same capability, one action surface. */
      onExport={() => setExporting(true)}
      /* Tagging, which used to be a dashed pill in the masthead on every
         meeting whether or not it had any. */
      onAddTag={() => setTagging(true)}
      extra={modeItems}
    />
  );

  return (
    /* The docked player floats, so the page has to leave it room; without this
       the last lines of a transcript sit under the bar and can be neither read
       nor corrected. */
    /*
     * THE DOCUMENT, AND WHAT THE MEETING IS BESIDE IT.
     *
     * <p>The frame Home and Library are on -- see `.v2-page` in
     * app/globals.css. Before this it was `.v2-spread[data-margin="empty"]`: a
     * single centred 680px column, which was itself a correction of a page
     * whose masthead spanned the window while the document under it centred.
     *
     * <p>What the margin holds is everything that was in the way of the first
     * sentence: the facts about the meeting, the topics, how many action items
     * and decisions and risks there are, and the outline. Applied once, here,
     * so the title, the mode row, the summary and the transcript are all in the
     * same column and move together.
     *
     * <p>The chat is a third thing and still summons itself: `SidePane` takes
     * width from the shell when Ask is pressed, and this frame stacks the
     * margin under the document when what is left drops below its spread point.
     * A reader who wants the chat is not reading the outline.
     */
    <div className="relative">
      <AmbientCanvas height="34rem" top="calc(var(--band) * -1)" />
      <div className="v2-page relative">
        <div className={cn("min-w-0 space-y-6", docked && "pb-32")}>
      {/* Masthead. The metadata sits in a monospaced rule under the title
          rather than as a row of loose badges: these are facts about one
          document, and setting them as a spec line keeps the title the only
          thing competing for first read.

          The separators are ink-5 — decorative only, never a word anybody has
          to read — which is the one tier of the ink scale that may not carry
          meaning. See app/globals.css §3. */}
      {/* One child now that Export and the menu are not siblings of it, so no
          `justify-between` to referee. `w-full` because the block has to fill
          the column: sized to its content, the action menu landed at the width
          of whichever facts line happened to be longest. */}
      <div>
        <div className="min-w-0 w-full">
          {/* No "All meetings" link. The band always says where everything is;
              a second way back, drawn above the title, pushed the one thing
              this page is about down the screen. */}
          {/*
            THE WAY BACK UP, which this page did not have.
            <p>It was left out deliberately once — "the band always says where
            everything is" — and the references put it back for a reason the
            band cannot serve: the band says which *place* you are in, and this
            says which *folder* this meeting is filed in, which is a fact about
            the document. Library and both folder screens now open with the
            same chevron, so a meeting without one was the odd page out.
            <p>Named after the folder when it is in one. `useGetProjectQuery`
            is skipped otherwise, and while it resolves the link still works and
            reads "Library" — a back link that flickers its own destination is
            worse than one that names the general case for a moment.
          */}
          <Link
            href={folder ? folderHref(folder.id) : LIBRARY}
            className="mb-3.5 -ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-foot text-ink-3 transition-colors duration-press ease-soft hover:text-ink-2"
          >
            <ChevronLeft className="h-[13px] w-[13px]" aria-hidden />
            {folder?.name ?? "Library"}
          </Link>

          {/*
            THE TITLE, AND THE MEETING'S OWN ACTIONS BESIDE IT.
            <p>`Export` and the `⋯` menu were rendered into the shell's
            `HeaderSlot` — a full-width row above the document, so on a centred
            680px measure they floated hard right, reading as application chrome
            rather than as this meeting's. Same correction as the folder page:
            a control for one object belongs beside that object.
            <p>Export moved *into* the menu rather than beside it. It was
            promoted to a button once so that a control named Export did only
            what it says, which was an argument about its name and not about
            its place; one action surface per document is the V2 rule, and the
            reference has one `⋯`.
          */}
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <MeetingTitle id={id} title={m.title} />
            </div>
            {/* Rendered whatever the status: deleting a meeting that failed to
                process is the commonest thing to want to do with one. */}
            {terminal && (
              <div className="no-print flex shrink-0 items-center gap-0.5 pt-1">
                {meetingMenu}
              </div>
            )}
          </div>
          {/*
            THE FACTS, AND THEN THE CONTROLS — two lines rather than one.
            <p>`design-demo/final/18-meeting-brief.html` sets the masthead as
            `date · duration · the people named`, and its own comment says why:
            the shipped masthead carried the title, date, duration, folder,
            source, status, four speaker chips WITH talk-time percentages and up
            to five buttons, so the first sentence of the summary began about
            350px down the page.
            <p>This was one row mixing all of it — facts and buttons, in
            uppercase mono, separated by slashes. The facts are a sentence about
            one document now, in the product's own separator; the controls keep
            every behaviour they had and sit under them, where they cannot be
            read as another fact about the meeting.
          */}
          {/*
            THE FACTS ARE IN THE MARGIN NOW.
            <p>They were a dotted sentence here -- date, duration, who spoke,
            language, tags -- under the title and above the mode row, so the
            first line of the summary began a long way down a page somebody
            opened to read it. They are facts ABOUT the document rather than
            part of it, which is what a margin is for: see
            components/v2/meeting/meeting-margin.
            <p>What stayed is the one item on that line which was never a fact.
            `ReadingIn` is a state with controls in it -- it is the only thing
            telling a reader that the words in front of them are not the ones
            that were said, and it offers the way back to the original. It
            belongs beside what it describes.
            <p>Gated here as well as inside the component: `ReadingIn` returns
            null on the original, and an always-rendered wrapper would leave an
            empty row under every title.
          */}
          {readingIn !== ORIGINAL || translating ? (
            <div className="mt-2.5 flex flex-wrap items-center text-foot text-ink-3">
              <ReadingIn
                sourceLanguage={m.language}
                language={readingIn}
                translation={showing}
                busy={translating}
                onShowOriginal={() => void onReadIn(ORIGINAL)}
                onRetranslate={() => void onReadIn(readingIn, !!showing?.hasTranscript)}
              />
            </div>
          ) : null}

        </div>
        {/* Up in the top bar, on the same line as search — not beside the
            title. Two rows of controls within an inch of each other, the
            shell's above and the document's below, and neither row explaining
            why it was not the other one. The dialogs and every piece of state
            they need stay here; only the buttons are drawn elsewhere. See
            components/header-slot.tsx. */}
              <ExportDialog
                open={exporting}
                onOpenChange={setExporting}
                meetingId={id}
                /*
                  Four props, where there were nine.
                  <p>`actionItems`, `segments`, `audioContentType`,
                  `languageName` and `sourceLanguageName` all fed the preview
                  pane and the caveats around the format pickers. The documents
                  are server-built and complete, so the dialog only needs to
                  know what exists -- not what is in it.
                */
                summary={showing ? undefined : summary.data}
                transcriptLines={transcript.data?.segments?.length ?? 0}
                // The file is written in whatever the page is being read in, so
                // exporting a translation you are looking at needs no second
                // choice — and cannot silently give you the English instead.
                language={readingIn === ORIGINAL ? null : readingIn}
                hasAudio={!isDocument && !!m.audioUrl}
              />
      </div>

      {/* The player, over the transcript and nowhere else.
          A DOCUMENT's presigned URL points at the source PDF, not audio, so it
          stays away from those entirely.

          Only on the transcript because that is the tab it acts on: the
          scrubber is banded by who is speaking, the jumps are speaker jumps,
          and the highlighted line follows the clock. Over a summary it drove
          something not on screen while taking a band of the page on every
          visit, and most visits to a summary never play anything.

          Docked rather than in the flow so it stays put while the transcript
          scrolls under it, which is the whole reason to have it there: reading
          along and correcting are the same sitting. The left offset matches the
          rail, so "centred" means centred on the transcript rather than on the
          window. Below the recording bar's z-index — a live microphone is the
          more urgent of the two. */}
      {ready && m.audioUrl && !isDocument && tab === "transcript" && (
        isVideoUpload ? (
          /* A video is watched, not scrubbed past. The same component renders a
             frame up to 60vh tall, and floating that over the transcript would
             cover the thing it is meant to be read alongside. */
          <div className="no-print">{player}</div>
        ) : (
          <div
            className={cn(
              "no-print pointer-events-none fixed bottom-0 z-20 p-3 sm:p-4",
              /*
                THE TRANSPORT SITS UNDER THE COLUMN IT SCRUBS.
                <p>It was `inset-x-0` with `max-w-doc mx-auto` inside, which
                centred 1120px of transport on the WINDOW: measured at 1672 it
                ran from x=260 to x=1650, crossing under the margin and 570px
                past the rule at 1083. A ruler for the recording, laid over the
                facts about it.
                <p>So the box is the document column, computed from the frame's
                own tokens -- which is why they are on `:root` rather than on
                `.v2-page`; see app/globals.css. Left is the frame's gutter.
                Right is everything to the document's right: the margin and its
                rule, the gap before it, the outer gutter, and the chat when it
                is open. Below the spread point `--page-margin-track` and
                `--page-rule-gap` are both zero, so the same expression gives
                the full width with no breakpoint of its own.
              */
              "left-[var(--page-pad-l)]",
              "right-[calc(var(--page-pad-r)+var(--page-margin-track)+var(--page-rule-gap)+var(--side-pane-w,0px))]",
            )}
          >
            {/* Held to the measure, so the transport sits under the column it
                is scrubbing rather than under the window. `--rail-w` is gone
                from this line with the rail it named — the shell has no left
                column any more, so the bar starts at the left edge and stops
                where the side pane begins. */}
            {/* The document frame, not the paragraph measure.
                `19-meeting-transcript.png` runs the dock the full width of the
                meeting's column -- `--doc` -- rather than stopping at the 680px
                the words are set to: a timeline is a ruler over the whole
                recording and forty minutes squeezed into 680px is a coarser
                ruler for no reason. The `lg:right-[var(--side-pane-w)]` on the
                wrapper above is what stops it before the chat. */}
            {/* Centred in that column, with room either side -- the approved
                transcript puts the transport in the middle of the document
                rather than spanning it end to end. `mx-auto` against the
                column now rather than against the window, which is the whole
                difference.
                <p>The width is the transport's rather than a taste. At the
                680px reading measure the trailing group wrapped: the volume
                slider dropped onto a second row and the bar grew from 60px to
                80, because the scrubber is already at its `min-w-[8rem]` by
                then and there is nothing left to give. So the controls came
                down a step instead -- 28px buttons, a 32px play, tighter gaps
                -- and the bar came in with them, from 832 to 720. One row, and
                120px of column back on each side. See
                components/audio-player. */}
            <div className="pointer-events-auto mx-auto w-full max-w-[45rem]">{player}</div>
          </div>
        )
      )}

      {/* Said out loud rather than left as an absence. "No audio" is also true
          of a YouTube import and of an upload still in flight, and a page that
          cannot tell those apart has to give all three the least useful of the
          three answers. */}
      {(m.audioDeletedAt || m.transcriptDeletedAt) && (
        <p className="no-print flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {m.audioDeletedAt && (
              <>You deleted the recording on {formatDate(m.audioDeletedAt)}. </>
            )}
            {m.transcriptDeletedAt && (
              <>You deleted the transcript on {formatDate(m.transcriptDeletedAt)}. </>
            )}
            What is below is what was kept.
          </span>
        </p>
      )}

      {/* Processing / failed */}
      {!terminal && (
        <ProcessingCard
          status={status}
          progress={percent}
          // The *reported* progress, not the eased bar: the stage strip must
          // never tick a stage because a timer moved. See lib/processing-stages.
          reported={live?.progress}
          hasTranscript={hasTranscript}
          hasSummary={hasSummary}
          message={live?.message}
          onStop={stoppable ? () => void stopProcessing() : undefined}
          stopping={recordingJob.stopping}
        />
      )}
      {failed && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium">Processing failed</p>
              <p className="text-sm text-muted-foreground">{m.errorMessage || "Something went wrong while processing this recording."}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/*
        * Rendered while processing too, where this used to be `ready &&`.
        *
        * The layout, the tabs and the chat rail are the same components in the
        * same places; only what each *shows* differs while its data is missing.
        * A failed meeting still gets nothing -- it has its own card above, and
        * skeletons over a failure are the "spinning for ever" case.
        */}
      {view.content && (
        /*
         * Two columns and two tabs, where there were four tabs and one column.
         *
         * Ask and Action items are not places, and making them tabs meant the
         * two things you do *while* reading — question it, and see what you
         * agreed to — were both somewhere the reading was not. The chat is now
         * a rail that stays put, and the action items sit under the summary
         * they were extracted from.
         */
        <>
        <Tabs value={tab} onValueChange={changeTab} className="min-w-0">
          {/*
           * THE READING MODE, and the row of controls that belong to it.
           *
           * <p>Two modes rather than four tabs. Ask and Action items are not
           * places, and making them tabs meant the two things you do *while*
           * reading were both somewhere the reading was not.
           *
           * <p>The row is full width and the document under it is not. That is
           * deliberate: a switch and the controls that govern the whole
           * document are chrome, and chrome that is indented to the measure
           * reads as part of the text. The measure begins at the content.
           */}
          {/*
            THE MODE ROW, as `18-meeting-brief.png` draws it.
            <p>`[ Summary ] [ Transcript ] ......... Ask  ⋯` and nothing else.
            It was two underlined words with a template picker and an edit
            button trailing them, on a row with a rule under it — which is what
            kept it reading like the shipped app rather than the reference.
            <p>Segmented rather than underlined: there is no third place to go
            and no hierarchy between the two, so it is a two-position control
            and should look like one. The rule under the row is gone with it;
            the reference has none, and the document below supplies its own
            first line of contrast.
          */}
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <TabsList variant="segmented">
              <TabsTrigger value="summary">
                <ScrollText className="h-3.5 w-3.5" aria-hidden /> Summary
              </TabsTrigger>
              <TabsTrigger value="transcript">
                <Captions className="h-3.5 w-3.5" aria-hidden /> Transcript
              </TabsTrigger>
            </TabsList>

            {/* On the tab row rather than inside the summary card, because it
                governs the whole document below it rather than any one section
                of it. Only on Summary: it rewrites the summary, and offering it
                over a transcript it cannot change would be a control that does
                nothing to what is on screen. */}
            {/* Only once there is a summary to rewrite. Offering a template
                picker over a summary that does not exist yet is a control that
                cannot do anything. */}
            {/*
              ASK, AND NOTHING ELSE, on the right of the mode row.
              <p>`18-meeting-brief.png` and `19-meeting-transcript.png` put
              exactly two things there: Ask, and the overflow. Everything that
              used to trail the tabs -- the template picker, the edit button --
              is in the overflow now; the one exception is correction mode,
              which is a state the reader is *in* and has to be able to leave.
              <p>The pane Ask opens is the same meeting-scoped chat it always
              was: same conversation, same history, same suggestions, same
              context, same rail the Outline shares. What changed in 0a3aaa2 is
              that it is no longer already open.
              <p>Not a link to /ask. That is the workspace chat, which knows
              nothing about this transcript.
            */}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
              {/*
                THE ONE CONTROL THAT STAYS ON THE ROW.
                <p>Correction is a mode, not an action: `21-transcript-editing.png`
                names it and offers one way out, and a reader who cannot see how
                to stop typing is stuck. Cancel stays beside Done -- Done keeps
                what was typed, Cancel abandons it, and the protection behind
                both is the editor's and unchanged.
                <p>`role="status"` because it appears without anybody looking at
                this corner, and it is the answer to "why can I type in this".
              */}
              {editingTranscript && tab === "transcript" && (
                <div className="flex items-center gap-2.5">
                  <span role="status" className="text-foot text-ink-3">
                    Correcting the transcript
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={editStatus.saving}
                    onClick={() => transcriptEditor.current?.cancel()}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={editStatus.saving}
                    onClick={() => void transcriptEditor.current?.save()}
                  >
                    {editStatus.saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Done
                    {/* The count is the point: Done over three unsaved
                        paragraphs and Done over none are different presses. */}
                    {editStatus.dirty > 0 ? ` (${editStatus.dirty})` : ""}
                  </Button>
                </div>
              )}

              {/* An opener, not a toggle: no `aria-expanded`, because pressing
                  it on an open chat leaves it open and lets the question
                  through. The shell's own control is the one that reports and
                  reverses the state, and it carries `aria-pressed`. */}
              {ready && (
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={openSidePane}>
                  {/*
                    THE MARK, NOT A STAR. It was a `Sparkles`, which is the
                    glyph every product in the category spends on the same
                    claim and says nothing about whose assistant this is.

                    <p>`AI` rather than `Ask`, and the same label Home's
                    launcher carries -- one name for one panel. The hidden
                    continuation is because "AI" alone is a poor thing to hear
                    announced: the accessible name becomes "AI - ask about this
                    conversation", which contains the visible text, so what is
                    read and what is spoken cannot disagree.
                  */}
                  <BrandMark size={16} /> AI
                  <span className="sr-only"> — ask about this conversation</span>
                </Button>
              )}
            </div>

          </div>

          {/*
           * THE MEASURE, BACK ON THE PANELS — and this time deliberately.
           *
           * <p>680px, about 74 characters at the reading size, and the
           * measurement the whole V2 layout is built to protect. A summary is
           * prose set in a serif and a transcript is an hour of speech; both
           * are READ, which is the one thing the frame's ~1010px document
           * column is too wide for. Measured before this cap went on: the
           * lead paragraph ran a hundred characters.
           *
           * <p>It was on these two panels once and moved to the page, because
           * the masthead then spanned the window while the document centred
           * under it. That is fixed differently now: the frame gives the whole
           * left column its gutter, so the title, the mode row and the
           * document all start at the same x — and only the prose stops early.
           * `max-w-measure` and no auto margins, so it stops at the right
           * rather than centring away from the title.
           *
           * <p>The same token on both, which is the other half of that
           * correction: moving between the two reading modes is a change of
           * content, not of reading posture, and two panels each choosing
           * their own width is how that stops being true.
           */}
          <TabsContent value="summary" className="max-w-measure pt-6">
            {/* The measure is the page's now; this is only the rhythm between
                the summary, the action items and the insights. */}
            <div className="space-y-4">
            <SummaryPanel
              meetingId={id}
              // One value rather than `loading` + `pending`, because the two of
              // them together could not express "the request failed" -- so it
              // came out as the empty state, which is the screenshot.
              state={summaryState}
              onRetry={() => void summary.refetch()}
              retrying={summary.isFetching}
              summary={summary.data}
              translation={showing}
              onSeek={playFrom}
            />
            {/* Directly under the summary, and above Decisions and Risks.
                What a meeting asks of you is the part with consequences, and
                it was sitting third — below two cards that are commentary on
                what happened. Somebody scanning a summary for what they now
                have to do had to scroll past both to find out.

                Titled, because it is now one section of a document rather than
                the only card on the page without a name. */}
            {/* A section of the summary, not a card on top of it. What a
                meeting asks of you is part of the same document as what it
                said, and a bordered box around it is what made it read as a
                widget parked below the summary. */}
            {/* `scroll-mt-band`, because the band is fixed: without it the
                margin's index scrolls this heading to y=0, which is behind the
                chrome. */}
            <section id={ACTION_ITEMS_ANCHOR} className="scroll-mt-band space-y-3">
              <h3 className="flex items-center gap-2 text-title-3 font-headline text-ink">
                <ListChecks className="h-4 w-4 text-ink-3" /> Action items
              </h3>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* Only over a list that actually arrived. "Everything here is
                      done." is a claim about what the meeting asked of you, and
                      deriving it from `(actions.data ?? []).filter(...)` meant a
                      failed request congratulated the reader on finishing work
                      it had never seen. */}
                  {actionsState === "ready" ? (
                    <p className="text-callout text-ink-3">
                      {openActions === 0
                        ? "Everything here is done."
                        : `${openActions} of ${actions.data?.length ?? 0} still open.`}
                    </p>
                  ) : (
                    <span />
                  )}
                  {/* Nothing here needs a transcript selection: a commitment made
                      in the room and never said aloud is exactly the one the
                      extractor cannot find. */}
                  <NewActionItemDialog meetingId={id} />
                </div>

                {actionsState === "ready" ? (
                  <ul className="divide-y divide-line">
                    {(actions.data ?? []).map((a) => (
                      <ActionItemRow
                        key={a.id}
                        item={a}
                        showMeeting={false}
                        // The row reads in the chosen language; the edit form
                        // inside it stays in the original, because that is the
                        // text an edit would replace.
                        translation={showing?.actionItems.find((t) => t.id === a.id)}
                        rightToLeft={showing?.rightToLeft}
                        // There is a player on this page, so the sentence plays
                        // here rather than opening the meeting again.
                        onOpenSource={playFrom}
                      />
                    ))}
                  </ul>
                ) : actionsState === "extracting" || actionsState === "waiting" ? (
                  <ProcessingActionItems ready={actionsState === "extracting"} />
                ) : actionsState === "loading" ? (
                  <div className="space-y-2 py-2" aria-busy>
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-11/12" />
                  </div>
                ) : actionsState === "error" ? (
                  <ResourceLoadError
                    title="Couldn't load the action items"
                    detail="They are still on this meeting. Something went wrong loading them."
                    onRetry={() => void actions.refetch()}
                    retrying={actions.isFetching}
                  />
                ) : (
                  /* Reached only from a settled, successful, genuinely empty
                     list -- see lib/resource-state. */
                  <EmptyText>No action items were extracted.</EmptyText>
                )}
                {/* No "manage all" link any more, and no page behind it. This
                    is where a commitment out of this call is read and ticked
                    off; a second list of the same rows somewhere else was three
                    places to do one thing. */}
            </section>

            {/* Last, and still below the summary rather than above it: these
                rows are read out of the summary, and putting them first would
                suggest they were the source rather than the reading. */}
            <div id={INSIGHTS_ANCHOR} className="scroll-mt-band">
              <InsightsPanel meetingId={id} />
            </div>
            </div>
          </TabsContent>

          <TabsContent value="transcript" className="max-w-measure pt-6">
            <div>
            {showing ? (
              showing.hasTranscript ? (
                /* No card. A translated transcript is the same document in
                   another language, so it is set in the same column with the
                   same absence of furniture around it. */
                <TranslatedTranscript
                  segments={transcript.data?.segments ?? []}
                  translation={showing}
                  currentTime={audio.currentTime}
                  onSeek={audio.seekTo}
                  onShowOriginal={() => void onReadIn(ORIGINAL)}
                />
              ) : (
                /* Asked for rather than done automatically. An hour of speech
                   is thousands of words: doing it for everyone who switched
                   language to read the summary would spend their money and
                   half a minute of their time on a tab they never opened. */
                <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-line py-12 text-center">
                  <p className="text-callout font-headline text-ink">
                    The transcript is still in its original language.
                  </p>
                  <p className="max-w-md text-callout text-ink-3">
                    Translating every utterance takes longer than the summary
                    did, so it is done on request.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={translating}
                    onClick={() => void onReadIn(readingIn, true)}
                  >
                    {translating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Languages className="h-4 w-4" />
                    )}
                    Translate the transcript into {showing.languageName}
                  </Button>
                </div>
              )
            ) : transcriptState === "preparing" ? (
              /* Not an empty TranscriptPanel. An empty transcript looks like a
                 recording that captured nothing, which is the one conclusion
                 that must not be drawn from a meeting still being transcribed. */
              <ProcessingTranscript />
            ) : transcriptState === "error" ? (
              /* The other conclusion that must not be drawn from a request that
                 failed. This is the screenshot: "Transcript unavailable." over a
                 transcript that was in the database the whole time. */
              <ResourceLoadError
                title="Couldn't load the transcript"
                detail="Your transcript is still here. Something went wrong loading it."
                onRetry={() => void transcript.refetch()}
                retrying={transcript.isFetching}
              />
            ) : editingTranscript ? (
              <TranscriptEditor
                ref={transcriptEditor}
                meetingId={id}
                segments={transcript.data?.segments ?? []}
                onStatus={onEditStatus}
                onClose={leaveEditing}
              />
            ) : (
            <TranscriptPanel
              meetingId={id}
              loading={transcriptState === "loading"}
              // Whether "Transcript unavailable." is a true sentence, decided
              // above rather than from `fallbackText` being falsy -- which is
              // what it used to be, and which is any of four different things.
              empty={transcriptState === "empty"}
              segments={transcript.data?.segments ?? []}
              speakerStats={transcript.data?.speakers ?? []}
              fallbackText={transcript.data?.transcript}
              currentTime={audio.currentTime}
              // Passed straight through rather than wrapped in a closure:
              // `seekTo` is a stable useCallback, and a fresh arrow here would
              // change identity 60 times a second, defeating the memo that
              // keeps inactive utterances from re-rendering every frame.
              onSeek={audio.seekTo}
              onAskAbout={askAbout}
              // Which tool the overflow menu has opened, and how to shut it.
              // Owned by the page because the menu is drawn in the masthead.
              tool={tool}
              onTool={setTool}
            />
            )}
            </div>
          </TabsContent>
        </Tabs>

        {/* The rail, in the shell's pane rather than in this page's layout.
            Its whole purpose is to stay beside the thing being read — a chat
            that scrolls away with the transcript is the tab it replaced, and
            one that ends halfway down the page puts its composer wherever the
            summary happened to stop. As a column of the shell it runs the full
            height of the window and is dragged to whatever width the reader
            wants, instead of approximating both with a sticky offset and a
            clamp this page had to keep in step with the header's. */}
        <SidePane>
          {/* The chat answers questions *about this transcript*, and on today's
              backend the transcript does not exist until the meeting is READY --
              `applyResult` writes it with the summary and the status in one
              transaction. So there is nothing for it to ground an answer in
              before then, and offering a composer would invite a question it
              could only answer wrongly or not at all.

              Keyed off the transcript rather than off the status, so this
              unlocks the moment a transcript exists rather than the moment some
              enum says READY. If the backend starts persisting it earlier, the
              chat opens earlier with no change here. */}
          {view.chat === "locked" ? (
            <ProcessingChatRail />
          ) : (
          <ChatPanel
            meetingId={id}
            title={m.title}
            /*
             * NO OUTLINE IN HERE, and it took a screenshot to see why.
             *
             * <p>This pane had an `Outline` tab beside the chat, offered over
             * the transcript on the argument that a transcript has no headings
             * of its own and the summary's outline is the only thing that makes
             * an hour of speech navigable. True — and the margin has been
             * carrying exactly that since the meeting page went on the frame:
             * `MeetingMargin` renders a `Transcript outline` region, gated on
             * the same condition, from the same headings, with the same
             * timecodes and the same seek.
             *
             * <p>So the tab was the same list twice on one screen, about 250px
             * apart, and the copy behind a toggle was the worse of the two.
             * Measured in a browser at 1440 with both on screen. It went with
             * the tab row; nothing was lost, because the margin's copy is
             * permanent and does not have to be asked for.
             */
            suggestions={summary.data?.suggestions}
            composed={composed}
            // Through the switch, not straight to the player: this pane is
            // beside both tabs, so a chat citation can be clicked while the
            // summary is on screen and the player does not exist yet.
            onCite={playFrom}
          />
          )}
        </SidePane>
        </>
      )}

      {/*
        THE NAVIGATOR. Opened from the `⋯` menu or with `⌘.`.

        <p>Everything in it is this meeting's own: the summary's outline
        headings, the voices the transcript actually attributes lines to, and
        the real marks. `playFrom` is what it jumps with -- the same call a
        chat citation and a clicked timecode go through -- so it switches to
        the transcript when it has to and cannot land anywhere they would not.
      */}
      <JumpTo
        open={jumping}
        onOpenChange={setJumping}
        sections={summary.data?.sections ?? []}
        segments={transcript.data?.segments ?? []}
        moments={moments.data ?? []}
        onJump={playFrom}
      />

      {/* Opened from the ⋯ menu, mounted here. A dialog inside a Radix menu is
          unmounted in the same frame the menu closes, which is the same reason
          the export one lives on the page. */}
      <TranslationDialog
        open={pickingLanguage}
        onOpenChange={setPickingLanguage}
        sourceLanguage={m.language}
        value={readingIn}
        onChange={(v) => void onReadIn(v)}
        available={availableTranslations.data}
        busy={translating}
      />
        </div>

        {/*
         * THE MARGIN. What the meeting is, beside what it said.
         *
         * <p>One 1px rule down its left edge and no fill -- see
         * `[data-page-margin]` in app/globals.css. It holds what used to sit
         * between the title and the first sentence: the facts, the topics, and
         * an index of how many action items, decisions and risks there are.
         *
         * <p>Drawn on both tabs. The facts are equally true of either, the
         * outline is MORE useful over a transcript than over a summary that
         * already contains it, and a second column that appears when somebody
         * changes tab is a page that changes shape under them.
         *
         * <p>Only once the meeting has loaded. Before that there is nothing to
         * describe, and every value here would be a placeholder.
         */}
        <div data-page-margin>
          <MeetingMargin
            meeting={m}
            /* Real diarization output, and empty for a document or a
               transcript that has not been made yet. */
            speakers={transcript.data?.speakers ?? []}
            /* The translated sections when a translation is showing, so the
               topics and the outline are in the language on screen. */
            sections={showing?.sections ?? summary.data?.sections ?? []}
            actions={{
              ready: actionsState === "ready",
              open: openActions,
              total: actions.data?.length ?? 0,
            }}
            decisions={marginDecisions}
            risks={marginRisks}
            insightsReady={insights.data !== undefined}
            /* Over the transcript only. A summary contains its own outline,
               with every heading already playable -- see the note on the
               component. */
            showOutline={tab === "transcript"}
            /* Action items, decisions and risks are all in the summary panel,
               which is not mounted while the transcript is showing -- so the
               margin cannot reach them with a `#hash` on its own. */
            onIndex={goToIndex}
            /* The page's own element, so there is one control writing to the
               tags rather than two. Not while the meeting is still working:
               tagging a meeting you cannot read yet is filing a document you
               have not seen. */
            tags={
              terminal && ((m.tags?.length ?? 0) > 0 || tagging) ? (
                <MeetingTags
                  id={id}
                  tags={m.tags ?? []}
                  addable={tagging}
                  openAdd={tagging}
                />
              ) : undefined
            }
            onSeek={playFrom}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Which template wrote the summary, and a way to have it rewritten.
 *
 * Its own component with its own mutation, rather than a prop drilled through
 * the summary card, because it now sits on the tab row — outside the card
 * entirely — and the card still has a second use for the same call in its
 * "the transcript changed" banner.
 */
/**
 * THE SUMMARY'S TEMPLATE, as menu items rather than a picker on the mode row.
 *
 * <p>`18-meeting-brief.png` has nothing on that row but the two modes, Ask and
 * the overflow. A permanent `Template: General` beside them read as a third
 * peer of Summary and Transcript, and it is neither a place nor a question --
 * it is a setting on the document below, changed rarely.
 *
 * <p>Same query, same mutation, same shared `fixedCacheKey`, same allowance
 * refusal. Only the surface changed.
 */
/**
 * Whether a submenu has room to open beside the menu it belongs to.
 *
 * <h2>Why this is measured rather than assumed</h2>
 *
 * <p>A submenu opens to the side, and at 390px there is no side to open on:
 * the `⋯` menu is 246px wide against the document's right edge, so a 160px
 * panel needs either 517px to its right or a negative x to its left. Radix
 * flips it left and does not clamp the main axis, so the template names were
 * drawn half off the screen -- "neral", "tailed", "ecutive".
 *
 * <p>So below `sm` the templates go back to being rows in the menu itself,
 * which is only reasonable because that menu now scrolls. Above it they are
 * one row with a chevron.
 *
 * <p>This is the first `matchMedia` in the app, and it is here rather than in
 * `lib/` because it is the only thing that needs it. It reports desktop until
 * it has measured, which is what the server renders and what all but one of
 * the app's breakpoints assume -- so hydration matches, and a phone corrects
 * itself on the first effect.
 */
function useRoomToTheSide(): boolean {
  const [room, setRoom] = React.useState(true);
  React.useEffect(() => {
    const q = window.matchMedia("(min-width: 640px)");
    const read = () => setRoom(q.matches);
    read();
    q.addEventListener("change", read);
    return () => q.removeEventListener("change", read);
  }, []);
  return room;
}

function TemplateItems({ meetingId, current }: { meetingId: string; current: string }) {
  const { data: templates } = useGetSummaryTemplatesQuery();
  // Shared with the menu's own Regenerate and with the banner -- see the page's
  // call. A rewrite started anywhere shows as "Rewriting…" on all of them.
  const [resummarize, { isLoading: rewriting }] = useResummarizeMutation({
    fixedCacheKey: `resummarize:${meetingId}`,
  });
  // Changing the template *is* a rewrite -- the same request Regenerate makes --
  // so the same allowance closes it.
  const refusal = aiRefusal(useAllowance(), "summary");
  const room = useRoomToTheSide();

  if (!templates || templates.length === 0) return null;

  async function onChange(slug: string) {
    if (slug === current) return;
    try {
      await resummarize({ id: meetingId, template: slug }).unwrap();
      toast.success("Summary rewritten.");
    } catch {
      toast.error("Could not rewrite the summary.");
    }
  }

  /*
   * ONE ROW, NOT EIGHT.
   *
   * <p>Inline, the templates were more than half the menu: eight names under a
   * label, above the eleven actions the `⋯` exists for, which pushed Reprocess
   * and Delete off the bottom of a laptop window. They are one choice, made
   * rarely, so they sit behind one row that says which is in use.
   *
   * <p>The label moved onto the trigger, where "Rewriting the summary…" is
   * still visible with the submenu shut -- the state matters most to somebody
   * who has just closed it.
   */
  const chosen = templates.find((t) => t.slug === current);

  const label = (
    <DropdownMenuLabel className="text-foot font-normal text-ink-4">
      {rewriting ? "Rewriting the summary…" : "Summary template"}
    </DropdownMenuLabel>
  );
  const items = templates.map((t) => (
    <DropdownMenuItem
      key={t.slug}
      // The reason on the item itself, because there is nowhere in a menu
      // for a sentence and an option that simply stops working is worse.
      title={refusal ?? undefined}
      disabled={rewriting || refusal !== null}
      onSelect={() => void onChange(t.slug)}
    >
      {/* A tick on the one in use, and reserved space on the rest, so the
          names line up down the menu. */}
      <Check className={cn("h-4 w-4", t.slug !== current && "opacity-0")} />
      {t.name}
    </DropdownMenuItem>
  ));

  // No side to open on. The same rows, in the menu, as they were before.
  if (!room) {
    return (
      <>
        {label}
        {items}
      </>
    );
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        title={refusal ?? undefined}
        disabled={rewriting || refusal !== null}
      >
        <FileSliders />
        <span className="flex-1">Templates</span>
        {/* Which one, on the closed row: a submenu that hides the current
            value makes you open it to find out what you already have. */}
        {!rewriting && chosen && (
          <span className="text-cap text-ink-4">{chosen.name}</span>
        )}
        {rewriting && <span className="text-cap text-ink-4">Rewriting…</span>}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {label}
        {items}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/* ----------------------------- Summary panel ----------------------------- */

/**
 * One section, drawn by its `kind`.
 *
 * <p>The switch is on `kind` rather than on which arrays are non-empty, so an
 * empty section still renders its heading. That is the point: "Budget" with
 * nothing under it tells the reader budget never came up, which is a finding.
 * Inferring the shape from the data would silently hide it.
 *
 * <h2>Set as a document, not as a card</h2>
 *
 * <p>A summary is part of the page rather than an object on it, so it has no
 * fill, no border and no radius — rounding a body of text is the most reliable
 * way to make a product look like a deck of cards. What separates one section
 * from the next is space and a heading in a heavier weight, which is what has
 * separated sections in printed documents for four hundred years.
 *
 * <p>The prose is in the reading serif. The headings are not: a heading is
 * interface — a thing you scan past to find the part you want — and the border
 * between the two faces is absolute. See the note at the top of app/layout.tsx.
 */
function SummarySectionView({
  section,
  onSeek,
}: {
  section: SummarySection;
  onSeek: (seconds: number) => void;
}) {
  const empty =
    !section.text?.trim() &&
    section.bullets.length === 0 &&
    section.groups.length === 0;

  return (
    <section>
      <h3 className="mb-2 text-title-3 font-headline text-ink">{section.title}</h3>

      {empty ? (
        // A finding, not a gap. Said in the quietest tier that still carries
        // meaning, because it IS meaning.
        <p className="v2-read italic text-ink-4">Not discussed.</p>
      ) : section.kind === "prose" ? (
        <p className="v2-read whitespace-pre-wrap">{section.text}</p>
      ) : section.kind === "bullets" ? (
        <ul className="space-y-2">
          {section.bullets.map((b, i) => (
            <li key={i} className="v2-read flex gap-2.5">
              <span
                aria-hidden
                className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-ink-4"
              />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-5">
          {section.groups.map((g, i) => (
            <div key={i}>
              {/*
               * A heading is a link to the moment its topic began — but only
               * when the ai-service could actually find that moment. The rest
               * stay plain text.
               *
               * The alternative, making every heading clickable and sending the
               * unanchored ones to 0:00 or to a guess, is worse than it looks:
               * a link that lands on the wrong minute is indistinguishable from
               * a transcript that disagrees with its own summary, and the
               * reader has no way to tell which of the two is broken.
               */}
              {g.startSeconds != null ? (
                <button
                  type="button"
                  onClick={() => onSeek(g.startSeconds as number)}
                  title={`Play from ${timecode(g.startSeconds)}`}
                  className="group mb-2 flex items-baseline gap-2 text-left"
                >
                  <span className="text-callout font-headline text-ink group-hover:underline">
                    {g.heading}
                  </span>
                  {/* Mono and tabular, like every other quantity in the
                      product. Brand on hover, because following it is Reverie
                      taking you somewhere. */}
                  <span className="tabular font-mono text-cap text-ink-4 transition-colors group-hover:text-brand-text">
                    {timecode(g.startSeconds)}
                  </span>
                </button>
              ) : (
                <h4 className="mb-2 text-callout font-headline text-ink">{g.heading}</h4>
              )}
              <ul className="space-y-2">
                {g.bullets.map((b, j) => (
                  <li key={j} className="v2-read flex gap-2.5">
                    <span
                      aria-hidden
                      className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-ink-4"
                    />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SummaryPanel({
  meetingId,
  state,
  onRetry,
  retrying,
  summary,
  translation,
  onSeek,
}: {
  meetingId: string;
  /**
   * What this panel is allowed to say -- see lib/meeting-panels.
   *
   * <p>One value, replacing a `loading` boolean and a `pending` flavour. The
   * pair of them could express "still loading" and "still being written" but
   * had no way at all to express "the request failed", so a failure fell
   * through to the last branch and said "No summary available." over a summary
   * that existed. That is the screenshot this prop exists for.
   *
   * <p>`"waiting"` is before the transcript exists -- there is nothing to
   * summarise. `"generating"` is after it, while the model is writing.
   * `"empty"` is the only state in which "No summary available" is a true
   * sentence, and it is reached only from a settled successful response or a
   * settled 404 (`getSummary` answers absence with `notFound("Summary not
   * ready")`).
   */
  state: PanelState;
  onRetry: () => void;
  retrying: boolean;
  summary?: SummaryResponse;
  /** The summary in the reading language, when one has been chosen. */
  translation?: MeetingTranslation;
  /** Plays from a quotation's moment. Shared with the transcript and chat. */
  onSeek: (seconds: number) => void;
}) {
  // The picker itself lives on the tab row now (see TemplatePicker). This call
  // stays because the "the transcript changed" banner below rewrites with the
  // template already in use, which is the same request without the choosing.
  // Same fixed key as the other two, so all three know when one is running.
  const [resummarize, { isLoading: rewriting }] = useResummarizeMutation({
    fixedCacheKey: `resummarize:${meetingId}`,
  });
  // The banner below offers a rewrite, which is the same spend as the menu's.
  const refusal = aiRefusal(useAllowance(), "summary");
  const translated = translation;

  async function onTemplateChange(slug: string) {
    try {
      await resummarize({ id: meetingId, template: slug }).unwrap();
      toast.success("Summary rewritten.");
    } catch {
      toast.error("Could not rewrite the summary.");
    }
  }

  const view = translated ?? summary;
  // The translation carries the sections too, so the translated summary is the
  // same document in another language rather than a thinner one — which is
  // what it used to be, and what made switching language quietly show the
  // reader less of the meeting than staying in English did.
  //
  // Memoised because every section below is keyed off this array: a fresh
  // identity on every render would re-render the whole document on every
  // render, which is cheap here and exactly the habit that stops being cheap
  // later.
  const sections = React.useMemo(
    () => translated?.sections ?? summary?.sections ?? [],
    [translated, summary?.sections],
  );

  /*
   * WHETHER THE LEAD IS THE FIRST SECTION SAID TWICE.
   *
   * <p>A short recording produces one section, and the model writes the same
   * sentences into `shortSummary` and into it %(d)s so the document opened with a
   * paragraph and then repeated it verbatim under a heading. Reported from a
   * real meeting.
   *
   * <p>Exact, after trimming and collapsing runs of whitespace, and nothing
   * else. No fuzzy or semantic matching: two summaries that merely overlap are
   * two things somebody may want to read, and a near-match rule would start
   * hiding real content the moment a model rephrased one of them.
   */
  const leadRepeatsFirstSection = React.useMemo(() => {
    // `view` is absent until the summary resolves; there is nothing to
    // compare and nothing rendered either way.
    const lead = flatten(view?.shortSummary);
    if (!lead) return false;
    const first = sections[0];
    return Boolean(first) && flatten(first.text) === lead;
  }, [view?.shortSummary, sections]);
  // Hidden alongside the sections while a translation is showing: a quotation is
  // a claim about the exact words spoken, so displaying it beside translated
  // prose would invite reading it as a translated quote.
  const quotes = translated ? [] : summary?.quotes ?? [];

  const current = summary?.templateSlug ?? "general";

  return (
    /*
     * A document, not a card.
     *
     * <p>This was `<Card><CardContent>`. A summary is the thing the page is
     * about: it is PART of the page rather than an object on it, and a fill and
     * a 10px radius around a body of text are what make a product look like a
     * deck of cards. What is left is the measure it is set in and the space
     * between its sections.
     *
     * <p>`dir` moved with it, unchanged. Set from the language rather than
     * sniffed from the characters: Arabic and Hebrew laid out left-to-right are
     * not merely ugly, they are hard to read.
     */
    <div className="space-y-7" dir={translated?.rightToLeft ? "rtl" : undefined}>
        {/* What we have beats any news about the request that fetched it: a
            refetch that fails must not blank a summary somebody is reading. */}
        {view ? (
          <>
            {/* The transcript has been corrected since this was written, so the
                notes and the transcript below them disagree. Not rewritten
                automatically — that would spend a model call on every typo fix,
                and on each of the next nineteen — so the choice is offered
                instead of made. Hidden while a translation is showing: it
                describes the original, which isn't what's on screen. */}
            {summary?.stale && !translated && (
              <div
                className="no-print v2-note flex flex-wrap items-center justify-between gap-3 py-1 text-callout"
                data-tone="warning"
              >
                {/* A margin note, not a tinted box. The 1px rule in the warning
                    hue does the work a filled panel would do, and it does not
                    put a coloured slab above the first line of the summary. */}
                <span className="flex items-center gap-2 text-ink-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                  The transcript changed after this summary was written.
                </span>
                {/* On a spent account the offer is withdrawn rather than
                    greyed. This banner exists to ask for a decision, and a
                    disabled button leaves it asking for one that cannot be
                    made — the warning is still worth showing, since it is why
                    the summary and the transcript below it disagree, but the
                    reader needs the reason instead of the button. */}
                {refusal ? (
                  <span className="text-foot text-ink-3">{refusal}</span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onTemplateChange(current)}
                    disabled={rewriting}
                  >
                    {rewriting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Rewrite it
                  </Button>
                )}
              </div>
            )}

            {sections.length > 0 ? (
              <div className="space-y-6">
                {/*
                  THE LEAD, which the sectioned summary used to drop.
                  <p>`design-demo/final/18-meeting-brief.html` opens with one
                  paragraph set larger than the rest, before anything else:
                  what happened, in a form somebody can paste into a reply.
                  `shortSummary` is exactly that paragraph and it was rendered
                  only when there were NO sections — so the richer the summary
                  got, the more certain it was to lose its opening.
                  <p>Same treatment as the sectionless branch below uses, so
                  the two are one paragraph in one size rather than two
                  answers. Nothing is manufactured to fill it: where the field
                  is empty the document simply starts at its first section.
                */}
                {view.shortSummary?.trim() && !leadRepeatsFirstSection && (
                  <p className="v2-read text-[1.1875rem] leading-[1.55] text-ink">
                    {view.shortSummary}
                  </p>
                )}
                {/* THE TOPICS ARE IN THE MARGIN NOW.
                    <p>They were a dotted line here, between the lead paragraph
                    and the first section -- which put a list of six headings
                    between the summary's opening sentence and the summary. They
                    are an index of the document rather than part of it, and
                    they are still read from the outline's own headings rather
                    than asked for separately: see
                    components/v2/meeting/meeting-margin. */}
                {sections.map((s) => (
                  <SummarySectionView key={s.key} section={s} onSeek={onSeek} />
                ))}
                {/* Rendered from its own field rather than as a section: these
                    carry a speaker and a timestamp, which the section shapes
                    cannot express, and they are the one part of a summary that
                    claims to be exact — so they are shown as evidence, playable
                    at the moment they were said. Hidden entirely when nothing
                    verified, which is a normal outcome rather than a failure. */}
                {quotes.length > 0 && (
                  <div>
                    <h3 className="v2-label mb-3 flex items-center gap-1.5">
                      <Quote className="h-3.5 w-3.5" /> Key quotations
                    </h3>
                    {/* The signature V2 treatment for evidence: one 1px stroke
                        on the left edge and text. No fill, no border, no
                        radius. The stroke does the work a card would do at a
                        fraction of the visual cost, and it is the same device
                        a citation gets under a chat answer — so the two read as
                        one idea rather than two.

                        The quotation itself is in the reading serif because it
                        is the one part of a summary that is verbatim speech. */}
                    <div className="space-y-3">
                      {quotes.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => onSeek(q.start)}
                          className="v2-note block w-full text-left transition-colors hover:border-l-brand-text"
                          title={`Play from ${timecode(q.start)}`}
                        >
                          <span className="v2-read block italic">“{q.text}”</span>
                          <span className="mt-1 block font-mono text-cap uppercase text-ink-4">
                            {q.speaker || "Unknown speaker"}{" "}
                            <span className="text-ink-5" aria-hidden>
                              ·
                            </span>{" "}
                            <span className="tabular">{timecode(q.start)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Summaries written before templates existed, which have no
                 sections to lay out. A translation carries them, so it takes
                 the branch above. */
              <>
                {/* The lead. One step up from the body, which is the whole of
                    the hierarchy a first paragraph needs. */}
                <p className="v2-read text-[1.1875rem] leading-[1.55] text-ink">
                  {view.shortSummary}
                </p>
                {view.keyPoints.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-title-3 font-headline text-ink">Key points</h3>
                    {/* A hang, not a tab stop, and the same bullet as every
                        other list in a summary -- `list-disc` drew a different
                        one here from the sections above. */}
                    <ul className="space-y-2">
                      {view.keyPoints.map((k, i) => (
                        <li key={i} className="v2-read flex gap-2.5">
                          <span
                            aria-hidden
                            className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-ink-4"
                          />
                          <span>{k}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {view.detailedSummary && (
                  <div>
                    <h3 className="mb-2 text-title-3 font-headline text-ink">Detailed summary</h3>
                    <p className="v2-read whitespace-pre-wrap">{view.detailedSummary}</p>
                  </div>
                )}
              </>
            )}
          </>
        ) : state === "waiting" || state === "generating" ? (
          <ProcessingSummary stage={state} />
        ) : state === "loading" ? (
          // The shape of a summary rather than one grey block, so the column does
          // not collapse and then jump when the real one lands.
          <div className="space-y-3" aria-busy>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : state === "error" ? (
          <ResourceLoadError
            title="Couldn't load the summary"
            detail="Your summary is still here. Something went wrong loading it."
            onRetry={onRetry}
            retrying={retrying}
          />
        ) : (
          /* Reached only from a settled response that proved there is none.
             See lib/resource-state -- this branch used to be reached by
             `!summary.data`, which is also what a 500 looks like. */
          <EmptyText>No summary available.</EmptyText>
        )}
    </div>
  );
}

/* ------------------------------- Chat panel ------------------------------ */
function ChatPanel({
  meetingId,
  title,
  onCite,
  suggestions,
  composed,
}: {
  meetingId: string;
  /**
   * The meeting this chat reads, by name.
   *
   * The chip used to say "This meeting", which was true and became unhelpful
   * the moment the panel could be maximised over the page: with the document
   * covered, "this" names nothing the reader can see. The title is on screen
   * either way now, and it is also what makes the scope obviously *narrow* —
   * somebody who has just come from the workspace chat needs to know this one
   * answers from one transcript.
   */
  title: string;
  onCite: (s: number) => void;
  /**
   * Questions generated from this meeting's summary. Passed down rather than
   * fetched here: the page already has the summary, and a second request would
   * make the chips appear after the chat they sit above.
   */
  suggestions?: string[];
  /** A question pushed in from the transcript's selection menu. */
  composed?: { text: string; send: boolean; nonce: number } | null;
}) {
  /*
   * WHICH THREAD THIS MEETING'S CHAT IS ON.
   *
   * <p>Null means "a new chat", and it is what a first visit gets: asking the
   * server for history without naming a conversation returns the most recent
   * one, so a blank panel would quietly be last week's.
   *
   * <p>Outside component state, because this panel is a tab. Opening the
   * Outline unmounts it, and a `useState` here would abandon a thread
   * mid-question every time somebody looked at the outline and came back.
   * Leaving the meeting *route* does forget it — see lib/chat-route.ts, which
   * is deliberately somewhere else: it is a rule about pages, and this
   * component's lifetime is not a page's.
   *
   * <p>`meeting:` prefixed, matching `usePendingTurn` below and
   * `workspace:home` / `workspace:ask`. It used to be the bare meeting id,
   * which meant the two stores keyed the same conversation two different ways
   * and anything reconciling them had to know both spellings.
   */
  const [conversationId, setConversationId] = useActiveChat(`meeting:${meetingId}`);
  // Only for the maximise control's own state. The pane itself is the shell's.
  const pane = useSidePane();
  /*
   * How hard to look, the same two settings the workspace chat offers.
   *
   * Not here originally, on the recorded ground that one meeting was retrieved
   * in full either way and a picker would be a control that did nothing. That
   * was wrong: retrieval takes the nearest eight passages, and a
   * fifteen-minute recording already chunks to more than eight, so a long
   * meeting was being answered from a sample of itself. Thorough widens that
   * and asks for an enumerated answer. See rag.answer in the ai-service.
   *
   * The wording comes from the server so it cannot drift from what the two
   * settings actually do.
   */
  const { data: modes } = useGetChatModesQuery();
  const [mode, setMode] = React.useState<ChatMode>("express");

  const {
    currentData: messages,
    isFetching,
    isError: chatError,
    // Skipped until a thread is named: history without one returns the most
    // recent conversation, which is what used to resume an old chat on open.
    //
    // `currentData` rather than `data`, for the reason spelled out in
    // lib/use-workspace-chat: a skipped query keeps its last result in `data`,
    // so deleting the open thread left its messages on screen.
  } = useGetChatQuery(
    { id: meetingId, conversationId: conversationId ?? undefined },
    { skip: !conversationId },
  );

  // Nothing to show and something coming — not merely "a request is in
  // flight", which is also true of the refetch after every answer.
  const isLoading = isFetching && !messages;
  const { data: conversations } = useGetMeetingConversationsQuery(meetingId);
  const [ask, { isLoading: asking }] = useAskChatMutation();
  // The question, on screen from the click rather than from the refetch that
  // follows the answer. See lib/pending-turn.
  // Scoped to this meeting, so a question still being answered survives going
  // to look at another meeting and coming back. Not shared with the workspace
  // chat: coming back to a meeting is coming back to one document, and what you
  // were asking about it is part of reading it.
  const pending = usePendingTurn(messages, `meeting:${meetingId}`);
  const [newConversation, { isLoading: starting }] = useCreateMeetingConversationMutation();
  const [rename] = useRenameConversationMutation();
  const [removeConversation] = useDeleteConversationMutation();
  const [deleteExchange, { isLoading: deleting }] = useDeleteChatExchangeMutation();
  // The composer owns what is typed. What stays here is the prefill: the
  // transcript can send a passage over as "ask about this", and only the page
  // knows when that happened.
  const [composeText, setComposeText] =
    React.useState<{ text: string; nonce: number } | null>(null);
  // Follows the newest turn, inside the thread and nowhere else, and stops
  // following the moment the reader scrolls up. See lib/use-thread-scroll.
  const threadRef = useThreadScroll([messages, pending.turn]);
  // Keyed by meeting: two meetings open in two tabs each get their own row,
  // and coming back to one carries on through its pool rather than restarting.
  const prompts = useRotatingPrompts(
    meetingId,
    toPrompts(suggestions, MEETING_PROMPTS),
    conversationId,
  );

  /**
   * Recover from a conversation that is no longer there — see the same guard on
   * the workspace chat. Without it a thread deleted underneath this page leaves
   * the chat stuck on 404 with no way out but a reload.
   */
  React.useEffect(() => {
    if (chatError && conversationId) setConversationId(null);
  }, [chatError, conversationId]);

  const submitRef = React.useRef<(text: string) => Promise<void>>();

  /**
   * Take whatever the transcript handed over.
   *
   * Keyed on the nonce alone: the same passage can be asked about twice, and
   * depending on the text would silently swallow the second attempt. A complete
   * prompt is sent; an opening is placed in the box with the caret at the end,
   * because it is missing the only thing the app cannot supply — the question.
   */
  React.useEffect(() => {
    if (!composed) return;
    if (composed.send) {
      void submitRef.current?.(composed.text);
      return;
    }
    // Handed to the composer, which owns the box and does the focusing.
    setComposeText({ text: composed.text, nonce: composed.nonce });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composed?.nonce]);

  async function submit(text: string) {
    const question = text.trim();
    if (!question) return;
    // Before the first await, so the question appears in the same commit that
    // clears the composer rather than a round trip later.
    pending.begin(question);
    try {
      // Its own thread when none is named, rather than being appended to the
      // last one. The server's rule for an unnamed ask is "continue the most
      // recent, or start one", so a clean sheet on screen would otherwise file
      // the question into a conversation it is not showing.
      const target = conversationId ?? (await newConversation(meetingId).unwrap()).id;
      // Adopted before the answer is waited for. Setting it from the response
      // meant a first question on a new thread belonged nowhere until the answer
      // landed, so leaving during that window came back to a clean sheet with
      // the answer only findable through the history picker.
      setConversationId(target);
      // Where it was asked from, so an answer that lands while the user is on
      // another page can offer the way back.
      const askedOn = typeof window === "undefined" ? "" : window.location.pathname;
      const answer = await ask({
        id: meetingId,
        question,
        conversationId: target,
        mode,
      }).unwrap();
      setConversationId(answer.conversationId);
      announceAnswer(askedOn);
    } catch {
      // Kept on screen with the failure under it and a Retry beside it. A toast
      // and an empty rail means retyping the question, which the composer has
      // already cleared.
      pending.fail();
    }
  }
  submitRef.current = submit;

  async function onNew() {
    try {
      const created = await newConversation(meetingId).unwrap();
      setConversationId(created.id);
      pending.clear();
      // Clears the box: a half-typed question belongs to the thread it was
      // being asked in.
      setComposeText({ text: "", nonce: Date.now() });
    } catch {
      toast.error("Couldn't start a new chat.");
    }
  }

  return (
    /*
     * THE SAME PANEL THE WORKSPACE ASK IS, measured narrower.
     *
     * <p>`ChatRail` before this, which was the same three regions. What
     * `AskPanel` adds is the evidence column: it measures itself, so when this
     * pane is maximised the sources move alongside the answer and when it is a
     * 26rem rail they stay under it. See components/chat/ask-panel.
     *
     * <h2>ONE HEADER ROW, where there were two</h2>
     *
     * <p>There was a tab row above this one -- `[mark] Ask | Outline` with the
     * pane's close button at its far end -- and then this row with the
     * conversation in it. Two rows of chrome over the first answer in a 26rem
     * rail, and two full-width hairlines 53px apart, which reads as a panel
     * with two headers.
     *
     * <p>So the tab row is gone and this row carries all of it: the mark, the
     * conversation, New chat, maximise, the way out, and -- over the
     * transcript -- the outline. Which also makes this pane and the one Home
     * opens the same header, drawn by the same component, instead of two
     * arrangements that happened to hold the same controls.
     *
     * <p>The outline is a body swap rather than a route or a tab, so the chat
     * stays mounted underneath it. That is a small improvement on the tabs it
     * replaced: `TabsContent` unmounted the chat every time somebody looked at
     * the outline, and the thread only survived because it lives in a module
     * store.
     */
    <AskPanel
      variant="pane"
      scrollRef={threadRef}
      header={
        <AskHeader
          /*
           * THE WAY OUT, here rather than in a row of its own.
           *
           * <p>It was `PaneClose` on the tab row: a panel-collapse glyph at
           * the far end of a strip that existed mostly to hold it. An `X`
           * beside maximise is what Home's pane has, it is what a panel with
           * a header is expected to have, and it means the two panes are shut
           * the same way.
           */
          onClose={closeSidePane}
          actions={
            <>
              {/* Block and full width, so `ChatHistory`'s own `ml-auto` puts
                  New chat and maximise at the end of the row. */}
              <div className="min-w-0 flex-1">
                <ChatHistory
                  conversations={conversations ?? []}
                  activeId={conversationId}
                  // Same rule as the workspace chat: an empty thread has nothing to
                  // start. See `isNew` in lib/use-workspace-chat.
                  atNewChat={!isLoading && (messages?.length ?? 0) === 0}
                  onSelect={setConversationId}
                  onNew={onNew}
                  busy={starting}
                  // In place rather than by navigating. There is no full page for one
                  // meeting's chat, and adding a route to hold a second copy of this
                  // conversation would be a URL nobody could get back from with the
                  // transcript still on screen. See components/side-pane.tsx.
                  onExpand={toggleSidePaneExpanded}
                  expanded={pane.expanded}
                  onRename={async (id, title) => {
                    await rename({ conversationId: id, title, scope: meetingId }).unwrap();
                  }}
                  onDelete={async (id) => {
                    await removeConversation({ conversationId: id, scope: meetingId }).unwrap();
                    // The open thread just went, so this chat has none: a clean sheet
                    // with the starter prompts, not the messages of a conversation
                    // that no longer exists.
                    if (id === conversationId) {
                      setConversationId(null);
                      pending.clear();
                      setComposeText({ text: "", nonce: Date.now() });
                    }
                  }}
                />
              </div>

            </>
          }
        />
      }
      dock={
        <ChatDock
          // No gutters of its own: `AskPanel` owns the panel's padding, and the
          // dock's `px-4` inside it set the composer thirty-two pixels in from
          // the thread above.
          className="px-0 pb-0"
          prompts={prompts}
          // An empty thread only. A thread with a question in flight is not
          // one, and three disabled pills across the rail put chrome where the
          // answer is about to be.
          showPrompts={!isLoading && (messages?.length ?? 0) === 0 && !pending.turn}
          busy={asking}
          onSend={(prompt) => void submit(prompt)}
          onCompose={(prefix) => setComposeText({ text: prefix, nonce: Date.now() })}
        >
          <ChatComposer
            busy={asking}
            modes={modes}
            mode={mode}
            onModeChange={setMode}
            // Still no context picker. That one would be a control that does
            // nothing: meeting chat reads one meeting through one endpoint and
            // has no way to widen the scope.
            scope={title || "This meeting"}
            /* No placeholder. It read "Ask about this meeting" and the chip
               above the box already names the meeting -- see the note on the
               withdrawn prop in components/chat-composer. */
            compose={composeText}
            onSend={submit}
          />
        </ChatDock>
      }
    >
      {/*
        THE THREAD, PAIRED INTO EXCHANGES. See components/chat/ask-thread.
        <p>An empty one renders nothing at all -- the starter prompts sit above
        the composer instead, so the panel reads bottom-up rather than opening
        with a wall of chips where the first answer is about to appear.
      */}
      <AskThread
        messages={messages}
        loading={isLoading}
        pending={pending.turn}
        onRetry={() => {
          if (pending.turn) void submit(pending.turn.question);
        }}
        deleting={deleting}
        onDelete={async (messageId) => {
          const result = await deleteExchange({ messageId, scope: meetingId }).unwrap();
          // That was the thread's only exchange, so the thread went with it.
          // Holding its id would 404 every read from here.
          if (result.conversationDeleted) setConversationId(null);
        }}
        /*
         * THE PASSAGES THEMSELVES, not a row of timecodes.
         *
         * <p>What was here was a round pill per citation reading `02:14`, with
         * the quoted sentence hidden in a `title` attribute -- a tooltip
         * nobody hovers, and the only part of the citation worth reading. The
         * text was already on the object and was being thrown away.
         *
         * <p>`onCite` rather than a link: the cited moment is in the
         * transcript on this page, so each passage seeks the player and the
         * transcript to that second. Passing `onSeek` is what selects that
         * behaviour over the workspace chat's deep link -- see
         * components/chat/ask-evidence.
         *
         * <p>No `meetingDates`. Every passage in here is from this meeting and
         * its date is in the masthead; repeating it under each quote would be
         * the same fact four times.
         */
        evidence={(answer) => <AskEvidence citations={answer.citations} onSeek={onCite} />}
      />
    </AskPanel>
  );
}

/* ---------------------------- Transcript panel --------------------------- */
function TranscriptPanel({
  meetingId,
  loading,
  empty,
  segments,
  speakerStats,
  fallbackText,
  currentTime,
  onSeek,
  onAskAbout,
  tool,
  onTool,
}: {
  meetingId: string;
  loading: boolean;
  /**
   * Whether the request settled and proved this meeting has no transcript.
   *
   * <p>Decided by the page from the query's state, not from `fallbackText`
   * being falsy -- which is what the old code did, and which is equally true of
   * a 500, a 401 during the token race, and a refetch still in flight. That is
   * how "Transcript unavailable." came to be printed over a transcript.
   */
  empty: boolean;
  segments: TranscriptSegment[];
  /**
   * Talk-time as the server computed it. Preferred over recomputing here so
   * the figures in the UI, the API and an export cannot disagree; the local
   * fallback below covers a cached response from before this field existed.
   */
  speakerStats: SpeakerStats[];
  fallbackText?: string;
  currentTime: number;
  onSeek: (s: number) => void;
  /** Hands a selected passage to the chat on the Ask tab. */
  onAskAbout: (text: string, send: boolean) => void;
  /** Which of the three tools the overflow menu has opened, if any. */
  tool: "find" | "marks" | "speakers" | null;
  onTool: (next: "find" | "marks" | "speakers" | null) => void;
}) {
  const [renameSpeakers, { isLoading: renaming }] = useRenameSpeakersMutation();
  const [mergeSpeakers, { isLoading: merging }] = useMergeSpeakersMutation();
  const [editing, setEditing] = React.useState(false);

  // Names this user has used before. Offered as autocomplete rather than a
  // forced choice: a new person in the meeting must not be harder to name than
  // a familiar one.

  const [editSegments, { isLoading: savingText }] = useEditSegmentsMutation();
  // Which line is open for editing, and the text as typed. Held by segment id
  // rather than index so a refetch that reorders nothing still cannot move the
  // edit onto a different line.
  const [openLine, setOpenLine] = React.useState<string | null>(null);
  const [lineDraft, setLineDraft] = React.useState("");

  function beginEdit(segment: TranscriptSegment) {
    if (!segment.id) return;
    setOpenLine(segment.id);
    setLineDraft(segment.text);
  }

  async function saveLine(original: string) {
    const text = lineDraft.trim();
    if (!openLine || !text || text === original) {
      setOpenLine(null);
      return;
    }
    try {
      await editSegments({ id: meetingId, edits: [{ id: openLine, text }] }).unwrap();
      // Deliberately quiet about the summary: it was written from the old
      // wording and is now slightly stale, which is the user's call to fix.
      toast.success("Transcript updated.");
      setOpenLine(null);
    } catch {
      toast.error("Could not save that correction.");
    }
  }

  const speakers = React.useMemo(() => {
    const set = new Set<string>();
    segments.forEach((s) => s.speaker && set.add(s.speaker));
    return Array.from(set);
  }, [segments]);

  /**
   * Talk-time, server-computed where available.
   *
   * The local sum is kept only as a fallback for a cached transcript fetched
   * before the server returned these — two independent implementations of the
   * same percentage is exactly how the number in the UI ends up disagreeing
   * with the number in an export.
   */
  const talk = React.useMemo(() => {
    if (speakerStats.length > 0) {
      const map = new Map<string, number>();
      let total = 0;
      for (const stat of speakerStats) {
        map.set(stat.speaker, stat.speakingSeconds);
        total += stat.speakingSeconds;
      }
      return { map, total };
    }
    const map = new Map<string, number>();
    let total = 0;
    for (const s of segments) {
      const d = Math.max(0, (s.end || 0) - (s.start || 0));
      map.set(s.speaker, (map.get(s.speaker) || 0) + d);
      total += d;
    }
    return { map, total };
  }, [segments, speakerStats]);

  const allTurns = React.useMemo(() => groupIntoTurns(segments), [segments]);

  /* ---- Marking: highlights, bookmarks and notes ---- */
  const { data: moments } = useGetMomentsQuery(meetingId);
  const marks = React.useMemo(() => moments ?? [], [moments]);
  const [createMoment, { isLoading: marking }] = useCreateMomentMutation();
  const [deleteMoment] = useDeleteMomentMutation();

  // The live selection, plus where to put the menu. Held together because a
  // menu without a selection is a menu whose actions do nothing.
  const [picked, setPicked] = React.useState<{
    capture: SelectionCapture;
    anchor: { top: number; left: number; bottom: number };
  } | null>(null);
  const [actionFor, setActionFor] = React.useState<Passage | null>(null);
  const [reassignFor, setReassignFor] = React.useState<ReassignTarget | null>(null);
  /** Why the last correction failed, shown in the dialog rather than only as a toast. */
  const [reassignError, setReassignError] = React.useState<string | null>(null);
  const [setSegmentSpeaker, { isLoading: reassigning }] = useSetSegmentSpeakerMutation();
  const bodyRef = React.useRef<HTMLDivElement | null>(null);

  const clearSelection = React.useCallback(() => {
    setPicked(null);
    window.getSelection?.()?.removeAllRanges();
  }, []);

  /**
   * Watch for a finished selection.
   *
   * On mouseup and keyup rather than on `selectionchange`: the latter fires
   * continuously while dragging, so the menu would appear over the words being
   * selected and move under the cursor. Mousedown clears, so a click anywhere
   * dismisses — the menu stops its own mousedown from reaching here.
   */
  React.useEffect(() => {
    function capture() {
      const found = readSelection(bodyRef.current);
      if (!found) {
        setPicked(null);
        return;
      }
      const range = window.getSelection()?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();
      if (!rect) {
        setPicked(null);
        return;
      }
      setPicked({
        capture: found,
        anchor: { top: rect.top, left: rect.left, bottom: rect.bottom },
      });
    }
    function dismiss() {
      setPicked(null);
    }
    /**
     * Any press outside the menu closes it — but a press *on* the menu must
     * not, and the menu cannot stop this event to say so: React's listeners
     * live on `document` here, the same node as this one, so its
     * `stopPropagation` runs alongside rather than before. Dismissing on a
     * press inside would unmount the button between mousedown and mouseup,
     * and the click would never happen.
     */
    function onMouseDown(e: MouseEvent) {
      if (isInsideSelectionMenu(e.target)) return;
      dismiss();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }

    document.addEventListener("mouseup", capture);
    document.addEventListener("keyup", capture);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mouseup", capture);
      document.removeEventListener("keyup", capture);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  async function saveMoment(kind: "HIGHLIGHT" | "BOOKMARK", p: Passage) {
    try {
      await createMoment({
        meetingId,
        body: {
          kind,
          ranges: p.ranges,
          quote: p.quote,
          body: "",
          speaker: p.speaker,
          startSeconds: p.startSeconds,
          endSeconds: p.endSeconds,
        },
      }).unwrap();
    } catch {
      toast.error("Could not save that mark.");
    }
  }

  async function confirmReassign(speakerKey: string) {
    await applyReassign({ speakerKey }, "Speaker corrected for that line.");
  }

  /**
   * The words belong to somebody this meeting does not have yet.
   *
   * <p>The server allocates the identity, so the name is not known until it
   * answers — which is why the toast reads it back off the response rather than
   * guessing "Speaker 5" from what the client can see.
   */
  /**
   * Move the words to somebody this meeting does not have yet, by name.
   *
   * <h2>Two requests, and why</h2>
   *
   * <p>`PATCH /meetings/{id}/segments/{segmentId}/speaker` names a new speaker
   * `Speaker N` and has no field for anything else. So a transcript with one
   * real participant gained a `Speaker 2` -- a person who was never in the
   * room, created by the one correction whose entire purpose is accuracy.
   *
   * <p>The fix is the rename that already exists: create, read back the name
   * the server allocated, and `PATCH /meetings/{id}/speakers` it to the one
   * the reader typed. Both endpoints are unchanged.
   *
   * <p>If the rename fails the words have still moved, and they are on a
   * speaker called `Speaker N` -- which is the state this exists to avoid, so
   * it says so rather than reporting success. The speaker editor renames them
   * by hand from there.
   */
  async function confirmReassignToNew(name: string) {
    const allocated = await applyReassign({ newSpeaker: true }, null);
    if (!allocated) return;
    const wanted = name.trim();
    if (!wanted || wanted === allocated) {
      toast.success(`Assigned to ${allocated}.`);
      return;
    }
    try {
      await renameSpeakers({ id: meetingId, mapping: { [allocated]: wanted } }).unwrap();
      toast.success(`Assigned to ${wanted}.`);
    } catch {
      toast.error(
        `The words moved, but they are on ${allocated} -- the rename to ${wanted} failed.`,
      );
    }
  }

  async function applyReassign(
    target: { speakerKey?: string; newSpeaker?: boolean },
    message: string | null,
  ): Promise<string | null> {
    if (!reassignFor) return null;
    setReassignError(null);
    try {
      const updated = await setSegmentSpeaker({
        id: meetingId,
        segmentId: reassignFor.segmentId,
        ...target,
        fromWord: reassignFor.fromWord,
        toWord: reassignFor.toWord,
      }).unwrap();
      setReassignFor(null);
      clearSelection();
      if (message) toast.success(message);
      // Whoever holds the corrected line now. A split makes new rows, so this
      // is read back rather than remembered.
      const moved = updated.segments?.find((s) => s.id === reassignFor.segmentId);
      return moved?.speaker ?? updated.speakers?.at(-1)?.speaker ?? null;
    } catch (err) {
      // The server can still refuse a correction, and its sentence is worth
      // showing: "try again in a moment" is different advice from "that did
      // not save", and only the server knows which one applies.
      const detail = (err as { data?: { message?: string } })?.data?.message;
      // Shown in the dialog as well as a toast, and the dialog stays open: the
      // selection is still there and the next attempt should not need making it
      // again.
      setReassignError(detail || "Could not change the speaker on that line.");
      toast.error(detail || "Could not change the speaker on that line.");
      return null;
    }
  }

  async function copyToClipboard(text: string, ok: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(ok);
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
    }
  }

  async function onSelectionAction(action: SelectionAction) {
    if (!picked) return;
    const p = picked.capture;

    switch (action) {
      case "highlight": {
        /*
         * THE SAME ITEM BOTH WAYS. A highlight had no undo: selecting
         * highlighted words offered `Highlight` again, which stacked a second
         * mark over the first and looked like nothing had happened.
         *
         * <p>One item rather than two, because "highlight" and "remove
         * highlight" are never both available -- the selection either lands on
         * one or it does not, and a menu that offers the impossible one greyed
         * out is a row of chrome on every selection to serve one case.
         */
        const already = highlightUnderSelection(p.ranges);
        if (already) {
          await removeMoment(already.id, "Could not remove that highlight.");
        } else {
          await saveMoment("HIGHLIGHT", p);
        }
        break;
      }
      case "copy":
        // With the speaker and the timecode, because a transcript line pasted
        // bare into a ticket loses the two things that make it evidence.
        await copyToClipboard(attributedQuote(p), "Copied with attribution.");
        break;
      case "ask":
        // Left unfinished: only the user knows what they wanted to ask.
        onAskAbout(askPrefix(p.quote), false);
        break;
      case "summarize":
        onAskAbout(summarizePrompt(p.quote), true);
        break;
      case "action-item":
        setActionFor(p);
        break;
      case "reassign": {
        // One segment at a time. A selection spanning two turns is ambiguous
        // about what is being corrected -- the words, or the boundary between
        // them -- and guessing would move text the user never pointed at.
        if (p.ranges.length !== 1) {
          toast.error("Select words inside a single turn to change its speaker.");
          break;
        }
        const range = p.ranges[0];
        const seg = segments.find((x) => x.id === range.segmentId);
        // `id` is optional on the wire: transcripts recorded before segments
        // were addressable have none, and those cannot be corrected line by
        // line. Refusing beats sending `undefined` as a path segment.
        if (!seg?.id) {
          toast.error("This transcript is too old to correct line by line.");
          break;
        }
        const span = wordRangeFor(seg, range.startOffset, range.endOffset);
        const whole =
          span === null ||
          (span.fromWord === 0 && span.toWord === (seg.words?.length ?? 0) - 1);
        setReassignFor({
          segmentId: seg.id,
          // Omitted for a whole turn so the server moves the row rather than
          // splitting it into one piece.
          fromWord: whole ? undefined : span?.fromWord,
          toWord: whole ? undefined : span?.toWord,
          quote: whole ? seg.text : p.quote,
          currentKey: seg.speakerKey ?? null,
        });
        break;
      }
      case "share": {
        // The in-app deep link, which the page already knows how to open at a
        // timestamp. Not the public share link: that is a separate capability
        // URL the owner may not have created, and minting one silently from a
        // menu would publish a meeting nobody asked to publish.
        const url = `${window.location.origin}/meetings/${meetingId}?t=${Math.floor(p.startSeconds)}`;
        await copyToClipboard(url, "Link copied — it opens at this moment.");
        break;
      }
    }
    clearSelection();
  }

  /**
   * A highlight the selection lands on, if there is one.
   *
   * <p>The decision is `highlightOver` in lib/moments, next to the
   * `resolveRange`/`segmentMarks` pair whose coordinates it has to share --
   * see the note there for the bug that put it in the wrong place. What this
   * supplies is `marksBySegment`, which is the very map the transcript paints
   * from, so recognition and painting cannot disagree.
   */
  function highlightUnderSelection(
    ranges: Passage["ranges"],
  ): TranscriptMoment | undefined {
    return highlightOver(ranges, marksBySegment);
  }

  /** Take a mark away, saying so if the server refuses. */
  async function removeMoment(id: string, failure: string) {
    try {
      await deleteMoment({ id, meetingId }).unwrap();
    } catch {
      toast.error(failure);
    }
  }

  /** The bookmark on a turn, if there is one. */
  function bookmarkAt(seconds: number): TranscriptMoment | undefined {
    return marks.find(
      (m) => m.kind === "BOOKMARK" && Math.abs(m.startSeconds - seconds) < 0.01,
    );
  }

  /**
   * The marks anchored to a turn rather than to a passage inside it.
   *
   * Matched on the exact start, which is how a bookmark has always been found:
   * two turns never share one, and a tolerance wide enough to be forgiving is
   * wide enough to attach a reaction to the wrong sentence.
   */
  function turnMarks(kind: MomentKind, seconds: number): TranscriptMoment[] {
    return marks.filter(
      (m) =>
        m.kind === kind &&
        m.ranges.length === 0 &&
        Math.abs(m.startSeconds - seconds) < 0.01,
    );
  }

  /**
   * Every note this turn should show: its own, and the ones on its words.
   *
   * <h2>The bug this exists to fix</h2>
   *
   * <p>`turnMarks` requires `ranges.length === 0`, which is right for what it
   * was written for -- a reaction or a note attached to a whole turn has no
   * ranges, and matching those by start time is exact. A note made from a
   * *selection* has ranges, so it failed that filter and rendered nowhere.
   *
   * <p>Nowhere at all: measured on the running stack, `POST /moments` returned
   * 201 with the body and the ranges intact, `GET /moments` returned it, the
   * selected words were underlined by `segmentMarks` -- and the note's text
   * appeared in no element on the page. The only trace was the `title`
   * attribute on the word spans, which is a tooltip nobody hovers, and there
   * was no way to read it, edit it or delete it. Saved and unreachable.
   *
   * <p>The comment on the renderer said passage notes "would exist only in the
   * collapsed marks list", and that list is not in the V2 transcript. So this
   * is not a new home for them: it is the home turn-level notes already have,
   * extended to the notes that point at words inside the turn. Same row, same
   * delete control, one presentation for both.
   *
   * <p>Matched by segment id rather than by time, because that is what a
   * passage note stores and it stays right when a turn is split.
   */
  function notesForTurn(turn: Turn): TranscriptMoment[] {
    const segmentIds = new Set(turn.segments.map((s) => s.id).filter(Boolean));
    return marks.filter((m) => {
      if (m.kind !== "NOTE") return false;
      if (m.ranges.length === 0) {
        return Math.abs(m.startSeconds - turn.start) < 0.01;
      }
      return m.ranges.some((r) => segmentIds.has(r.segmentId));
    });
  }

  /** Every word of a turn, as one string — what Copy puts on the clipboard. */
  function turnText(turn: Turn): string {
    return turn.segments.map((s) => s.text).join(" ").trim();
  }

  /**
   * Add the emoji, or take it off if it is already there.
   *
   * A toggle rather than an add, because the gesture that costs one click has
   * to cost one click to undo. The server treats a repeat as a no-op, so a
   * double click that races itself cannot leave two of the same reaction on one
   * turn.
   */
  async function toggleReaction(turn: Turn, emoji: string) {
    const existing = turnMarks("REACTION", turn.start).find((m) => m.body === emoji);
    try {
      if (existing) {
        await deleteMoment({ id: existing.id, meetingId }).unwrap();
        return;
      }
      await createMoment({
        meetingId,
        body: {
          kind: "REACTION",
          ranges: [],
          // Context for the marks list, which shows reactions beside notes and
          // bookmarks and would otherwise list an emoji against nothing.
          quote: turnText(turn).slice(0, 200),
          body: emoji,
          speaker: turn.speaker,
          startSeconds: turn.start,
          endSeconds: turn.start,
        },
      }).unwrap();
    } catch {
      toast.error("Could not save that reaction.");
    }
  }

  async function toggleBookmark(turn: Turn) {
    const existing = bookmarkAt(turn.start);
    try {
      if (existing) {
        await deleteMoment({ id: existing.id, meetingId }).unwrap();
        return;
      }
      await saveMoment("BOOKMARK", {
        ranges: [],
        // A bookmark marks a time, so its text is context for the list rather
        // than an anchor — the first line of the turn is what identifies it.
        quote: (turn.segments[0]?.text ?? "").slice(0, 200),
        speaker: turn.speaker,
        startSeconds: turn.start,
        endSeconds: turn.start,
      });
    } catch {
      toast.error("Could not update that bookmark.");
    }
  }

  /**
   * Find-in-transcript.
   *
   * The browser's own Ctrl-F is the obvious answer and it is not good enough
   * here: a two-hour transcript is thousands of lines, and finding the fifth
   * mention means pressing Enter five times with no idea how many there are.
   * This filters to the turns that match and says how many, so "did anyone
   * mention the migration?" is answered by looking rather than by scrolling.
   *
   * Speaker names are searched too — "what did Priya say?" is the same question
   * shaped differently.
   */
  const [query, setQuery] = React.useState("");
  const needle = query.trim().toLowerCase();

  /**
   * Only the marked turns.
   *
   * The counterpart to the highlight list below: that one reads as an index,
   * this one keeps the marks in the transcript where the surrounding speech is
   * still there to be played.
   */
  const [onlyMarked, setOnlyMarked] = React.useState(false);
  /*
   * Which tool is open comes from the page now: they are opened from the
   * overflow menu, which the masthead draws. One at a time, and none by
   * default -- the transcript is what this screen is for.
   */
  const panel = tool;
  const closeTool = React.useCallback(() => onTool(null), [onTool]);

  /**
   * The marks each segment carries, resolved against its current text.
   *
   * Computed once for the whole transcript rather than per utterance while
   * rendering: resolution can fall back to searching a segment for the quoted
   * words, and doing that inside the render path would repeat the search on
   * every clock tick.
   */
  const marksBySegment = React.useMemo(() => {
    const map = new Map<string, SegmentMark[]>();
    if (marks.length === 0) return map;
    for (const s of segments) {
      if (!s.id) continue;
      const found = segmentMarks(s.id, s.text, marks);
      if (found.length > 0) map.set(s.id, found);
    }
    return map;
  }, [segments, marks]);

  /**
   * Marks that point at a time rather than at words: bookmarks, reactions, and
   * notes made on a whole turn.
   *
   * They have no ranges, so `marksBySegment` never sees them — which would make
   * "show only marked" hide the turn somebody just reacted to. Matched by start
   * time, the way the marks themselves are anchored.
   */
  const anchorTimes = React.useMemo(
    () => marks.filter((m) => m.ranges.length === 0).map((m) => m.startSeconds),
    [marks],
  );

  const turns = React.useMemo(() => {
    let visible = allTurns;
    if (needle) {
      visible = visible.filter(
        (t) =>
          t.speaker.toLowerCase().includes(needle) ||
          t.segments.some((s) => s.text.toLowerCase().includes(needle)),
      );
    }
    if (onlyMarked) {
      visible = visible.filter(
        (t) =>
          t.segments.some((s) => s.id && marksBySegment.has(s.id)) ||
          anchorTimes.some((at) => Math.abs(at - t.start) < 0.01),
      );
    }
    return visible;
  }, [allTurns, needle, onlyMarked, marksBySegment, anchorTimes]);

  // Counted over utterances rather than turns: a turn is a display grouping, so
  // counting those would report a number that changes with how text happens to
  // be grouped rather than with how often the word was said.
  const matchCount = React.useMemo(() => {
    if (!needle) return 0;
    return segments.filter((s) => s.text.toLowerCase().includes(needle)).length;
  }, [segments, needle]);

  async function saveNames(mapping: Record<string, string>) {
    if (Object.keys(mapping).length === 0) {
      setEditing(false);
      return;
    }
    try {
      await renameSpeakers({ id: meetingId, mapping }).unwrap();
      toast.success("Speakers renamed.");
      setEditing(false);
    } catch {
      toast.error("Rename failed.");
    }
  }

  /**
   * Fold one speaker into another.
   *
   * <p>The server's message is shown rather than a generic failure: the two
   * refusals a user can actually hit — a speaker that is no longer in this
   * meeting, and a transcript that has moved on since the panel was opened —
   * both mean "reload", and "Merge failed" would not say so.
   */
  async function mergeTwoSpeakers(fromSpeakerKey: string, intoSpeakerKey: string) {
    try {
      await mergeSpeakers({ id: meetingId, fromSpeakerKey, intoSpeakerKey }).unwrap();
      toast.success("Speakers merged.");
      setEditing(false);
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message;
      toast.error(message || "Could not merge those speakers.");
    }
  }

  if (loading) {
    // The shape of a transcript rather than one grey block: a name, a line, a
    // line. The column does not collapse and then jump when the real one lands.
    return (
      <div className="space-y-5" aria-busy>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    /*
     * A document, not a card.
     *
     * <p>The transcript is the longest thing anybody reads in this product, and
     * a fill with a radius around an hour of speech is the clearest possible
     * case of a content group pretending to be an object. What is left is the
     * measure, the space between turns, and the words.
     *
     * <p>Everything that made this panel work is untouched: `data-seg` and
     * `data-speaker` are what `readSelection` recovers a passage from with
     * `closest`, the active-utterance computation still drives the playback
     * tint per frame, and `onSeek` is still the same stable callback so the
     * per-word memo keeps holding.
     */
    <div className="space-y-6">

        {/*
          ONE TEMPORARY STRIP, AND ONLY IF IT WAS ASKED FOR.
          <p>Each of these is the control that was already there — same query
          state, same marks index, same speaker stats and editor. What is gone is
          the row of three toggles that sat above the first spoken line whether
          or not anybody wanted any of them. `19-meeting-transcript.png` has
          none of it: the transcript starts under the mode row.
          <p>Closing puts the transcript back. Opened from the overflow menu, so
          nothing here costs height by existing.
        */}
        {panel === "find" && segments.length > 0 && (
          <div className="space-y-2 pb-2">
            <ToolHead label="Find in transcript" onClose={closeTool} />
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" />
              <Input
                autoFocus
                className="h-9 border-edge bg-surface-raised pl-8 pr-8"
                placeholder="Find in transcript…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setQuery("");
                }}
                aria-label="Find in transcript"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-4 transition-colors hover:text-ink"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {needle && (
              <p className="text-foot text-ink-3">
                {matchCount === 0
                  ? "No matches."
                  : `${matchCount} ${matchCount === 1 ? "match" : "matches"} in ${turns.length} ${
                      turns.length === 1 ? "turn" : "turns"
                    }. Click any word to play from there.`}
              </p>
            )}
          </div>
        )}

        {panel === "marks" && marks.length > 0 && (
          <div className="space-y-2 pb-2">
            <ToolHead label="Highlights" onClose={closeTool} />
            <MarksSection
            meetingId={meetingId}
            moments={marks}
            segments={segments}
            onSeek={onSeek}
              onlyMarked={onlyMarked}
              onToggleFilter={() => setOnlyMarked((v) => !v)}
            />
          </div>
        )}

        {panel === "speakers" && speakers.length > 0 && talk.total > 0 && (
          <div className="space-y-2 pb-2">
            <ToolHead label="Speakers" onClose={closeTool}>
              <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
                {editing ? "Cancel" : "Edit speakers"}
              </Button>
            </ToolHead>
            {editing ? (
              <SpeakerEditor
                // Server stats where they exist, because only those carry the
                // canonical key a merge needs. The local fallback below is for
                // a transcript cached before the server sent them, and it can
                // still be renamed.
                speakers={
                  speakerStats.length > 0
                    ? speakerStats
                    : speakers.map((sp) => ({
                        speaker: sp,
                        speakerKey: null,
                        speakingSeconds: talk.map.get(sp) ?? 0,
                        percentage: 0,
                        segmentCount: 0,
                        wordCount: 0,
                      }))
                }
                renaming={renaming}
                merging={merging}
                onRename={saveNames}
                onMerge={mergeTwoSpeakers}
              />
            ) : (
              <div className="space-y-1.5">
                {/* One-line roll-call, ordered by who spoke most. The bars
                    below give the detail; this answers "who was in this and
                    who dominated it" at a glance. */}
                <p className="pb-1 text-callout text-ink-3">
                  {speakers
                    .map((sp) => ({ sp, pct: Math.round(((talk.map.get(sp) || 0) / talk.total) * 100) }))
                    .sort((a, b) => b.pct - a.pct)
                    .map(({ sp, pct }) => `${sp} (${pct}%)`)
                    .join(", ")}
                </p>
                {speakers.map((sp) => {
                  const secs = talk.map.get(sp) || 0;
                  const pct = Math.round((secs / talk.total) * 100);
                  return (
                    <div key={sp} className="flex items-center gap-3 text-callout">
                      <span className="w-20 shrink-0 truncate text-ink-2">{sp}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
                        <div className="h-full bg-ink-3" style={{ width: `${pct}%` }} />
                      </div>
                      {/* Two quantities, so mono and tabular: a column of
                          percentages that does not line up is a column nobody
                          can compare down. */}
                      <span className="tabular w-20 shrink-0 text-right font-mono text-cap text-ink-4">
                        {pct}% <span className="text-ink-5" aria-hidden>·</span>{" "}
                        {formatDuration(Math.round(secs))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}


        {/* Transcript, grouped into turns.
            Diarization emits an utterance per pause, so one person speaking for
            a minute arrives as several segments. Rendered one row each, that
            reads as a stack of fragments with the same name repeated down the
            page; merged into a turn it reads as someone talking. Each utterance
            stays individually seekable inside the turn, so nothing is lost. */}
        {segments.length > 0 ? (
          <div className="space-y-5" ref={bodyRef}>
            {turns.map((turn, i) => {
              const bookmarked = bookmarkAt(turn.start);
              const reactions = turnMarks("REACTION", turn.start);
              // Both kinds: the turn's own, and the ones on its words. See
              // `notesForTurn` -- a selection note used to render nowhere.
              const notes = notesForTurn(turn);
              return (
              /*
                ONE TURN, ON THE SHARED GRID.
                <p>`19-meeting-transcript.png` and `21-transcript-editing.png`
                use the same geometry: a quiet timecode gutter, and a text
                column that the speaker's name is aligned to. Reading and
                correcting differ only in whether a paragraph is editable, so
                the grid is defined identically here and in
                components/transcript-editor.
                <p>`groupIntoTurns` is untouched: the same runs, in the same
                order, with the same segments in them.
              */
              <div key={i} className="group relative">
                {/* Floating over the top-right of the turn, out of the reading
                    column entirely: five icons inline would push the speaker's
                    name and timestamp around every time the pointer moved. */}
                <TurnActions
                  context={`${turn.speaker} at ${timecode(turn.start)}`}
                  reactions={reactions.map((m) => m.body)}
                  bookmarked={Boolean(bookmarked)}
                  busy={marking}
                  onReact={(emoji) => void toggleReaction(turn, emoji)}
                  onBookmark={() => void toggleBookmark(turn)}
                  onCopy={() =>
                    void copyToClipboard(
                      attributedQuote({
                        speaker: turn.speaker,
                        startSeconds: turn.start,
                        quote: turnText(turn),
                      }),
                      "Copied with attribution.",
                    )
                  }
                  onShare={() =>
                    void copyToClipboard(
                      `${window.location.origin}/meetings/${meetingId}?t=${Math.floor(turn.start)}`,
                      "Link copied — it opens at this moment.",
                    )
                  }
                />
                {/*
                  NO AVATAR.
                  <p>A 28px circle with an initial in it, once per turn, down a
                  document. The references have none, and it carried nothing:
                  the colour was decorative and every speaker operation lives
                  elsewhere -- renaming and merging behind Speakers, reassigning
                  on a selection. The name is the heading now, which is what a
                  document does.
                */}
                <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3">
                  {/*
                    WHO IS SPEAKING, IN THE GUTTER THAT WAS EMPTY.
                    <p>It held `<span aria-hidden />` and a comment saying the
                    gutter had nothing to say about the speaker. The approved
                    transcript draws an initials chip exactly here, and it is
                    the right place for one: the gutter is otherwise timecodes,
                    so the eye already runs down it, and a chip on the turn's
                    own line costs the reading column nothing.
                    <p>Coloured by `speakerColor`, which keys off `speakerKey`
                    rather than the display name -- so renaming Speaker 2 to
                    Sarah keeps her the same colour, and the chip agrees with
                    the scrubber's bands and the speaker strip.
                    <p>`aria-hidden`, because the name is right beside it in
                    text. Announcing "AM" before "Alex Morgan" is the same fact
                    twice, the second time as two letters.
                    <p>CENTRED IN THE GUTTER, and so is every timecode under it
                    -- see `Timecode`. Both were right-aligned, which lines up
                    their right EDGES: a 28px circle and a five-character
                    timecode then have centres about three pixels apart, and the
                    chip read as sitting off to one side of the column. Centring
                    both makes the centres identical whatever the timecode says,
                    which matters because it says "1:02:03" on a long recording
                    and "00:01" on a short one.
                  */}
                  <span className="flex justify-center pb-1">
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full",
                        "font-mono text-cap text-white/95",
                        speakerColor(turn.speaker, turn.speakerKey),
                      )}
                    >
                      {initialsOf(turn.speaker)}
                    </span>
                  </span>
                  <span className="flex items-baseline gap-2 pb-1">
                    {/* Sans, because a name is interface — it is what you scan
                        down the page to find who said something. The words
                        underneath are the serif. */}
                    <span className="text-callout font-headline text-ink">{turn.speaker}</span>
                    {/* Setting a bookmark is a toolbar action, but one that was
                        only visible on hover would be findable by scrolling
                        only if you scrolled with the pointer over every turn.
                        So a set one stays on the row, and clicking it takes it
                        off. */}
                    {bookmarked && (
                      <button
                        onClick={() => void toggleBookmark(turn)}
                        aria-label="Remove bookmark"
                        aria-pressed
                        title="Remove bookmark"
                        className="rounded p-0.5 text-brand-text transition-colors hover:text-ink"
                      >
                        <Bookmark className="h-3.5 w-3.5 fill-current" />
                      </button>
                    )}
                  </span>
                  {turn.segments.map((s, j) => {
                      const active = currentTime >= s.start && currentTime < s.end;
                      // Editing one line replaces just that line, so the rest
                      // of the turn stays readable and still seekable while a
                      // correction is being typed.
                      if (s.id && openLine === s.id) {
                        return (
                          <React.Fragment key={j}>
                            <Timecode at={s.start} onSeek={onSeek} editing />
                          <span className="block pb-3">
                            <textarea
                              autoFocus
                              rows={Math.max(2, Math.ceil(lineDraft.length / 70))}
                              value={lineDraft}
                              onChange={(e) => setLineDraft(e.target.value)}
                              onKeyDown={(e) => {
                                // Enter saves; Shift+Enter is a newline, and
                                // Escape abandons the edit without saving.
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  void saveLine(s.text);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  setOpenLine(null);
                                }
                              }}
                              className="v2-read w-full resize-y rounded-md border border-edge bg-surface-raised p-2 outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/25"
                            />
                            <span className="mt-1 flex items-center gap-2">
                              <Button size="sm" onClick={() => void saveLine(s.text)} disabled={savingText}>
                                {savingText ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setOpenLine(null)}>
                                Cancel
                              </Button>
                              <span className="text-foot text-ink-4">
                                Enter to save <span className="text-ink-5" aria-hidden>·</span> Esc
                                to cancel
                              </span>
                            </span>
                          </span>
                          </React.Fragment>
                        );
                      }
                      return (
                        <React.Fragment key={j}>
                        {/* THE GUTTER. Quiet, monospaced and still the seek
                            target it always was -- one per utterance, as the
                            references draw it, rather than one per turn. */}
                        <Timecode at={s.start} onSeek={onSeek} />
                        <span
                          // The segment and speaker live here rather than on
                          // every word: `readSelection` recovers them with
                          // `closest`, and repeating a name across tens of
                          // thousands of spans is document weight for nothing.
                          data-seg={s.id}
                          data-speaker={turn.speaker}
                          className={cn(
                            // THE READING COLUMN. The one place the serif is
                            // allowed, and the reason the layout protects 680px.
                            "v2-read group/line block rounded px-0.5 pb-3 transition-colors",
                            // The utterance being spoken. Brand, because this
                            // is Reverie telling you where the audio is — which
                            // is the one thing the accent means.
                            active && "bg-brand/10"
                          )}
                        >
                          {/* Every utterance renders its words, not just the
                              playing one, so any word in the transcript can be
                              clicked to play from it. Inactive utterances are
                              handed a constant `at`, which lets the memo skip
                              them while the active one re-renders per frame. */}
                          <SpokenWords
                            text={s.text}
                            start={s.start}
                            end={s.end}
                            words={s.words}
                            at={active ? currentTime : -1}
                            onSeek={onSeek}
                            match={needle}
                            marks={s.id ? marksBySegment.get(s.id) : undefined}
                          />
                          {/* Only lines that differ from the meeting's language
                              carry this, so it stays a signal. In a monolingual
                              meeting nothing renders here at all. */}
                          {s.language && (
                            <span
                              className="ml-1 rounded-xs border border-line px-1 py-0.5 align-middle font-mono text-[10px] uppercase text-ink-4"
                              title={`Spoken in ${languageName(s.language)}`}
                            >
                              {s.language}
                            </span>
                          )}
                          {/* Shown on hover so it never competes with reading,
                              but always reachable by keyboard. */}
                          {s.id && (
                            <button
                              onClick={() => beginEdit(s)}
                              aria-label="Correct this line"
                              title="Correct this line"
                              className="ml-0.5 rounded p-0.5 align-middle text-ink-4 opacity-0 transition-opacity hover:text-ink focus:opacity-100 group-hover/line:opacity-100"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                        </React.Fragment>
                      );
                    })}

                  {/* Under the words they are about. Clicking one removes it,
                      which is the whole undo path — a gesture that costs one
                      click should not cost three to take back. */}
                  <TurnReactions
                    reactions={reactions.map((m) => m.body)}
                    onToggle={(emoji) => void toggleReaction(turn, emoji)}
                    busy={marking}
                  />

                  {/* Notes, in place, under the words they are about.
                      <p>Both kinds. A turn-level note has no ranges and is
                      matched by time; a passage note has ranges and is matched
                      by segment, and until this it rendered nowhere at all --
                      the words were underlined and the text was reachable only
                      as a `title` tooltip. See `notesForTurn`. */}
                  {notes.map((note) => (
                    <div
                      key={note.id}
                      className="v2-note mt-2 flex items-start gap-2"
                    >
                      <MessageSquare className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-4" />
                      <p className="min-w-0 flex-1 whitespace-pre-wrap text-callout text-ink-2">
                        {note.body}
                      </p>
                      <button
                        onClick={() => void deleteMoment({ id: note.id, meetingId })}
                        aria-label="Delete this note"
                        title="Delete this note"
                        className="rounded p-0.5 text-ink-4 opacity-0 transition-opacity hover:text-ink focus:opacity-100 group-hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              );
            })}
            {/* Searched, matched nothing. Without this the panel just empties,
                which reads as a transcript that failed to load. */}
            {needle && turns.length === 0 && (
              <EmptyText>Nothing in this transcript matches “{query.trim()}”.</EmptyText>
            )}
            {!needle && onlyMarked && turns.length === 0 && (
              <EmptyText>Nothing is marked in this transcript yet.</EmptyText>
            )}
          </div>
        ) : empty ? (
          <EmptyText>Transcript unavailable.</EmptyText>
        ) : (
          /* No segments, but text -- a document import, or a transcript from
             before segments existed. Both are real transcripts. */
          <p className="v2-read whitespace-pre-wrap">{fallbackText}</p>
        )}

      <SelectionMenu
        anchor={picked?.anchor ?? null}
        onAction={onSelectionAction}
        busy={marking}
        /* So the first item can be the way out of a highlight rather than a
           second one. Computed here because the marks are here. */
        highlighted={picked ? highlightUnderSelection(picked.capture.ranges) !== undefined : false}
      />
      <ReassignSpeakerDialog
        target={reassignFor}
        speakers={speakerStats ?? []}
        busy={reassigning}
        error={reassignError}
        onClose={() => {
          setReassignFor(null);
          setReassignError(null);
        }}
        onConfirm={confirmReassign}
        onConfirmNew={(name) => void confirmReassignToNew(name)}
      />
      <ActionItemDialog
        meetingId={meetingId}
        passage={actionFor}
        onClose={() => setActionFor(null)}
      />
    </div>
  );
}

/**
 * The marks on this transcript, as a collapsible index.
 *
 * Split out of {@link TranscriptPanel} only because that component is already
 * long; it has no state worth sharing beyond what is passed in.
 */
function MarksSection({
  meetingId,
  moments,
  segments,
  onSeek,
  onlyMarked,
  onToggleFilter,
}: {
  meetingId: string;
  moments: TranscriptMoment[];
  segments: TranscriptSegment[];
  onSeek: (s: number) => void;
  onlyMarked: boolean;
  onToggleFilter: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  // Looked up by id rather than scanned per mark: a two-hour transcript has
  // thousands of segments and the list resolves every mark against them.
  const textById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const s of segments) if (s.id) map.set(s.id, s.text);
    return map;
  }, [segments]);

  return (
    <div className="rounded-md border border-line bg-surface-raised">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-callout text-ink"
          aria-expanded={open}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Highlighter className="h-4 w-4 text-warning" />
          {moments.length} {moments.length === 1 ? "mark" : "marks"}
        </button>
        <Button
          variant={onlyMarked ? "secondary" : "ghost"}
          size="sm"
          className="ml-auto"
          onClick={onToggleFilter}
          aria-pressed={onlyMarked}
        >
          {onlyMarked ? "Show everything" : "Show only marked"}
        </Button>
      </div>
      {open && (
        <div className="border-t px-3">
          <MomentsPanel
            meetingId={meetingId}
            moments={moments}
            segmentText={(id) => textById.get(id)}
            onSeek={onSeek}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The utterance currently being spoken, with the word at `at` highlighted and
 * every word clickable to play from it.
 *
 * Uses the provider's real per-word timings when the transcript has them.
 * Failing that it estimates, spreading the utterance's span across its words
 * in proportion to their length. The estimate assumes speech has no pauses, so
 * it runs ahead of the voice — tolerable when diarization broke utterances on
 * every pause, badly wrong when a provider groups a whole speaker turn and one
 * segment covers half a minute. Only transcripts recorded before word timings
 * were persisted take that path now.
 *
 * Memoized, and that is load-bearing rather than an optimisation. Every
 * utterance renders its words so that any of them can be clicked, which for an
 * hour-long meeting is thousands of spans. The clock ticks ~60 times a second,
 * so without the memo the whole transcript would re-render on every frame.
 * Inactive utterances are passed a constant `at`, so their props never change
 * and only the one being spoken does any work.
 */
const SpokenWords = React.memo(function SpokenWords({
  text,
  start,
  end,
  words,
  at,
  onSeek,
  match,
  marks,
}: {
  text: string;
  start: number;
  end: number;
  words?: SpokenWord[];
  at: number;
  onSeek: (t: number) => void;
  /**
   * Lower-cased search term, or empty. A word containing it is tinted, so a hit
   * is visible in place rather than only as a filtered-down list — which is
   * what tells you *why* a turn matched.
   */
  match?: string;
  /**
   * Saved highlights and notes covering this utterance, already resolved to
   * character offsets by the panel above.
   */
  marks?: SegmentMark[];
}) {
  // Tokenizing lives in lib/moments so the offsets a word reports and the ones
  // a stored highlight was saved with come from one implementation. Two would
  // drift, and a highlight that fails to resolve looks exactly like one that
  // was never saved.
  const tokens = React.useMemo(
    () => tokenize(text, start, end, words),
    [text, start, end, words],
  );

  return (
    <>
      {tokens.map((w, i) => {
        const marked = marks && marks.length > 0 ? isMarked(marks, w.from, w.to) : undefined;
        return (
          <span
            key={i}
            role="button"
            tabIndex={0}
            data-word=""
            data-from={w.from}
            data-to={w.to}
            data-start={w.start}
            data-end={w.end}
            // Stops the enclosing utterance handler from also firing and seeking
            // to the start of the sentence instead of to this word.
            onClick={(e) => {
              e.stopPropagation();
              onSeek(w.start);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onSeek(w.start);
              }
            }}
            title={marked?.moment.body || undefined}
            className={cn(
              "cursor-pointer rounded transition-colors duration-75 hover:bg-ink/15",
              // A saved mark and a search hit share a hue — a highlighter is
              // yellow, and pretending otherwise to avoid the collision would
              // make saved highlights unrecognisable. They are told apart by
              // the underline, which only a saved mark carries, and the overlap
              // is momentary anyway: a search tint lasts as long as the find
              // box has text in it.
              marked &&
                "rounded-none border-b-2 border-warning bg-warning/25",
              match && w.text.toLowerCase().includes(match) &&
                "bg-warning/30 text-ink",
              // The word being spoken, right now. Brand at a strength that
              // reads over the serif without turning the line into a block --
              // this repaints every frame while the audio runs, so it is the
              // one tint in the product that is genuinely animated.
              at >= w.start && at < w.end && "bg-brand/35 text-ink"
            )}
          >
            {w.text}
          </span>
        );
      })}
    </>
  );
});

/**
 * An absence that was settled rather than assumed.
 *
 * <p>Every caller is gated on a settled, successful, genuinely empty response —
 * never on `!data`, which is also what a 500 looks like. See
 * lib/resource-state.
 */
/**
 * The same text, for the one comparison the summary needs to make.
 *
 * <p>Trim, and collapse every run of whitespace to a single space. That is the
 * whole normalisation: it makes "a  b
" and " a b " the same string, which is
 * the difference two renderings of one paragraph actually produce, and nothing
 * more. A looser rule would start hiding real content.
 */
function flatten(text: string | null | undefined): string {
  return (text ?? "").trim().replace(/\s+/g, " ");
}

/**
 * ONE UTTERANCE'S TIMECODE, in the gutter.
 *
 * <p>The references hang it outside the reading column, quiet and monospaced,
 * one per paragraph. It is still the seek target it has always been -- the
 * gutter is where it sits, not what it does.
 *
 * <p>`editing` brightens it, which is the reference's one difference between a
 * paragraph being read and the paragraph being corrected.
 */
function Timecode({
  at,
  onSeek,
  editing = false,
}: {
  at: number;
  onSeek: (seconds: number) => void;
  editing?: boolean;
}) {
  return (
    <button
      onClick={() => onSeek(at)}
      aria-label={`Play from ${timecode(at)}`}
      className={cn(
        /* `text-center`, to share a centre line with the speaker chip above
           it -- see the note in the turn header. It was `text-right`, which
           aligned the right edges instead. */
        "tabular h-fit pt-[0.3rem] text-center font-mono text-cap transition-colors hover:text-brand-text",
        editing ? "text-brand-text" : "text-ink-4",
      )}
    >
      {timecode(at)}
    </button>
  );
}

/**
 * The head of a temporary tool strip: what it is, and the way out of it.
 *
 * <p>Replaces `UtilityTab`, which was the toggle on a permanent row. There is
 * no row any more -- the tools are in the overflow menu and only the one that
 * was asked for is drawn -- so what each one needs is a name and a close.
 *
 * <p>A named close rather than a bare X: this strip appeared because somebody
 * chose a menu item, and the thing that undoes that should say so.
 */
function ToolHead({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  /** Anything belonging to this tool, before the close. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="v2-label">{label}</span>
      <span className="grow" />
      {children}
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close ${label.toLowerCase()}`}
        className="rounded p-1 text-ink-4 transition-colors duration-press ease-soft hover:bg-white/[0.06] hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-callout text-ink-4">{children}</p>;
}
