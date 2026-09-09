import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ActionItemResponse,
  MeetingResponse,
  SummaryResponse,
  SummarySection,
  TranscriptMoment,
  TranscriptSegment,
} from "@/lib/types";

/**
 * The meeting page — its shell, its masthead and its transport.
 *
 * <h2>Why this file exists now and did not before</h2>
 *
 * <p>This is the largest screen in the product and it had **no tests at all**.
 * That was survivable while it was being edited a panel at a time; it is not
 * survivable through a redesign that moves the column every panel is set in.
 * Everything under it — the summary, the transcript, the action items — is
 * covered by its own component's tests, and every one of those passes just as
 * well when the page renders them at the wrong width, in the wrong tab, or not
 * at all.
 *
 * <p>So this covers what only the *page* can be wrong about: which facts are in
 * the masthead, which reading mode is showing, what column the document is set
 * in, and where the transport is docked. The panels themselves are mocked out
 * by name — their contents belong to their own files, and pulling them in here
 * would make this a test of forty components that fails for thirty-nine reasons
 * that are not this page's fault.
 *
 * <p>It is written to be extended. Phases 7, 8 and 9 rebuild the summary, the
 * transcript and the action items, and each will add to the mocks below rather
 * than standing up a second harness.
 */
/*
 * `vi.mock` factories are hoisted above every `const` in this file, so anything
 * they call has to be built inside `vi.hoisted` -- otherwise the factory runs
 * against a temporal-dead-zone binding and the whole suite fails to collect
 * with an error that names the wrong file.
 */
const { push, refetch, openPane, ok, none, mut } = vi.hoisted(() => {
  const refetch = vi.fn();
  /** Whatever asked for the chat pane. */
  const openPane = vi.fn();
  /** An RTK Query result with the flags this page actually reads. */
  function ok<T>(data: T) {
    return {
      data,
      isLoading: false,
      isFetching: false,
      isError: false,
      isSuccess: true,
      isUninitialized: false,
      error: undefined,
      refetch,
    };
  }
  return {
    push: vi.fn(),
    refetch,
    openPane,
    ok,
    none: () => ok(undefined),
    /** A mutation tuple. Nothing here fires one; they only have to exist. */
    mut: () => [() => ({ unwrap: () => Promise.resolve({}) }), { isLoading: false }],
  };
});

let meeting: MeetingResponse;
let segments: TranscriptSegment[];
/** The marks on this transcript. Empty unless a test puts one here. */
let moments: TranscriptMoment[];
let summary: SummaryResponse | undefined;
/** How the summary request is going. See the mock. */
let summaryQuery: "ok" | "loading" | "error" | "absent" | "stale-over-error";
/** Templates the picker offers. Empty by default; one test needs two. */
let templates: { slug: string; name: string }[];
/** How the transcript request is going. */
let transcriptQuery: "ok" | "error" | "absent";
/** The flat body a document import has instead of utterances. */
let transcriptText: string | undefined;
/** Whether anything has asked for the chat pane yet. */
let paneOpen: boolean;

/** The folder the meeting is filed in, for the masthead's back link. */
let folder: { id: string; name: string } | undefined;
/**
 * Real diarization output, ordered by who spoke most.
 *
 * <p>Empty by default, which is the honest default: a document has no
 * speakers and a transcript that has not been made yet has none either. The
 * masthead must name people only when there are people to name.
 */
let speakers: { speaker: string; speakingSeconds: number; percentage: number; segmentCount: number; wordCount: number }[];
let actionItems: ActionItemResponse[];
/** How the action-items request is going. */
let actionsQuery: "ok" | "error";
/** Whether `SidePane` renders its children. See the mock below. */
let renderPane = false;

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "mtg_1" }),
  useRouter: () => ({ push }),
  usePathname: () => "/meetings/mtg_1",
}));

vi.mock("@/lib/api", () => ({
  // `getSummary` answers absence with a 404 rather than an empty body, so for
  // that one endpoint a settled 404 is the proof of absence that a settled 200
  // is elsewhere. See `meetingPanels`.
  isNotFoundError: () => summaryQuery === "absent",
  useGetMeetingQuery: () => ok(meeting),
  /*
   * The folder the masthead's back link is named after. Skipped when the
   * meeting is filed nowhere, which is the default here -- so the link reads
   * "Library" unless a test gives the meeting a `projectId`.
   */
  useGetProjectQuery: (_id: string, opts?: { skip?: boolean }) =>
    opts?.skip ? ok(undefined) : ok(folder),
  // The one query with more than one interesting state, so it goes through a
  // switch rather than a fixture. Every branch below is a screen the summary can
  // legitimately be, and three of them used to be the same screen.
  useGetSummaryQuery: () => {
    if (summaryQuery === "loading") {
      return { ...ok(undefined), isLoading: true, isFetching: true, isSuccess: false };
    }
    if (summaryQuery === "error" || summaryQuery === "absent") {
      return {
        ...ok(undefined),
        isError: true,
        isSuccess: false,
        error: { status: 500, data: { message: "boom" } },
      };
    }
    if (summaryQuery === "stale-over-error") {
      return { ...ok(summary), isError: true, error: { status: 500 } };
    }
    return ok(summary);
  },
  useGetTranscriptQuery: () => {
    if (transcriptQuery === "error") {
      return {
        ...ok(undefined),
        isError: true,
        isSuccess: false,
        error: { status: 500, data: { message: "boom" } },
      };
    }
    if (transcriptQuery === "absent") return { ...ok(undefined), isSuccess: false };
    return ok({ segments, speakers, transcript: transcriptText });
  },
  // A bare array here, not a page: this endpoint answers one meeting.
  useGetMeetingActionItemsQuery: () => {
    if (actionsQuery === "error") {
      return {
        ...ok(undefined),
        isError: true,
        isSuccess: false,
        error: { status: 500, data: { message: "boom" } },
      };
    }
    return ok(actionItems);
  },
  useGetChatQuery: () => ok({ messages: [] }),
  useGetChatModesQuery: () => ok([]),
  useGetTranslationsQuery: () => ok([]),
  useGetLanguagesQuery: () => ok([]),
  useGetSummaryTemplatesQuery: () => ok(templates),
  useGetMomentsQuery: () => ok(moments),
  useGetInsightsQuery: () => ok([]),
  useGetMeetingConversationsQuery: () => ok([]),
  useDeleteMeetingMutation: mut,
  useAskChatMutation: mut,
  useTranslateMeetingMutation: mut,
  useRenameSpeakersMutation: mut,
  useMergeSpeakersMutation: mut,
  useReprocessMeetingMutation: mut,
  useEditSegmentsMutation: mut,
  useSetSegmentSpeakerMutation: mut,
  useResummarizeMutation: mut,
  useCreateMomentMutation: mut,
  useDeleteMomentMutation: mut,
  useCreateMeetingConversationMutation: mut,
  useRenameConversationMutation: mut,
  useDeleteConversationMutation: mut,
  useDeleteChatExchangeMutation: mut,
  // MeetingTitle and MeetingTags render inside the masthead and reach for
  // these; they are not mocked out because the title IS the masthead.
  useUpdateMeetingMutation: mut,
  useCreateActionItemMutation: mut,
  usePatchActionItemMutation: mut,
  useGetUsageQuery: none,
}));

vi.mock("@/lib/ws", () => ({ subscribeMeetingStatus: () => ({ deactivate: () => {} }) }));
/*
 * A TUPLE, because that is what the hook returns.
 *
 * <p>It returned `{ id: null, set: () => {} }`, which is not the shape of
 * `useActiveChat` and would throw the moment anything destructured it. Nothing
 * did, because the pane was stubbed away below and the chat never rendered --
 * so a mock that could not possibly work sat here passing 113 tests. Corrected
 * so that the block at the end of this file can render the pane for real.
 */
vi.mock("@/lib/active-chat", () => ({ useActiveChat: () => [null, () => {}] }));
vi.mock("@/lib/recording-context", () => ({
  useRecordingJob: () => ({ phase: "idle", job: null, stop: () => Promise.resolve(false) }),
}));
vi.mock("@/lib/allowance", () => ({
  useAllowance: () => ({}),
  aiRefusal: () => null,
  reprocessCost: () => null,
}));
vi.mock("@/lib/processing-jobs", () => ({ trackProcessing: () => {} }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

/*
 * The panels, by name.
 *
 * Each has its own test file. What is asserted here is that the page puts them
 * in the right tab, in the right column — not what they draw, which is theirs.
 */
vi.mock("@/components/insights-panel", () => ({
  InsightsPanel: () => <div data-testid="insights-panel" />,
}));
vi.mock("@/components/action-item-row", () => ({
  ActionItemRow: (props: {
    item: { id: string; title: string; sourceStartSeconds?: number | null };
    onOpenSource?: (s: number) => void;
  }) => (
    <li
      data-testid={`action-row-${props.item.id}`}
      // The two wires the page owns: whether the row was told it can seek
      // (there is a player here) and whether the sentence was ever placed.
      data-seekable={String(Boolean(props.onOpenSource))}
      data-anchored={String(props.item.sourceStartSeconds != null)}
    >
      {props.item.title}
    </li>
  ),
}));
vi.mock("@/components/export-dialog", () => ({ ExportDialog: () => null }));
/*
 * Stubbed, but no longer to nothing: the page renders this in the masthead now
 * and Export is an item inside it, so the stub has to carry the trigger and
 * that item for the placement to be assertable here. What the menu *does* is
 * pinned in components/meeting-menu.test.tsx.
 */
vi.mock("@/components/meeting-menu", async () => {
  /*
   * A real dropdown wrapping a stubbed menu.
   *
   * <p>The page hands this two things the composition depends on: Export, and
   * whatever the open reading mode brought with it -- the summary's template,
   * or the transcript's find / highlights / speakers / correct. Those are page
   * state, so their wiring belongs in this file; what the real menu does with
   * everything else is pinned in components/meeting-menu.test.tsx.
   *
   * <p>The primitives are the real ones rather than stubs, because the items
   * the page builds are `DropdownMenuItem`s and Radix throws outside a menu
   * root -- and because pressing a trigger and then an item is the interaction
   * being asserted.
   */
  const dd = await import("@/components/ui/dropdown-menu");
  return {
    MeetingMenu: ({
      onExport,
      onAddTag,
      onJumpTo,
      extra,
    }: {
      onExport: () => void;
      onAddTag: () => void;
      onJumpTo: () => void;
      extra?: React.ReactNode;
    }) => (
      <dd.DropdownMenu>
        <dd.DropdownMenuTrigger asChild>
          <button type="button" aria-label="More actions" />
        </dd.DropdownMenuTrigger>
        <dd.DropdownMenuContent>
          {/* Plain buttons for the two the page owns: Radix returns focus on
              select, which in jsdom lands after the assertion. What the real
              items do is components/meeting-menu.test.tsx's business. */}
          <button type="button" role="menuitem" onClick={onAddTag}>
            Add a tag
          </button>
          <button type="button" role="menuitem" onClick={onExport}>
            Export…
          </button>
          {/* NO Jump to. The real menu dropped it, so a stub that still drew
              it would let a test pass through a way in that no longer exists.
              The navigator is opened by `⌘.` now; see the describe below. */}
          {extra}
        </dd.DropdownMenuContent>
      </dd.DropdownMenu>
    ),
  };
});

vi.mock("@/components/transcript-editor", () => ({
  TranscriptEditor: () => <div data-testid="transcript-editor" />,
}));
vi.mock("@/components/selection-menu", () => ({
  /*
   * Stubbed with one working action, because "Ask about this" now has to open
   * the pane as well as compose into it -- and that is a page behaviour, not a
   * menu behaviour. The real menu's own logic is its own file's.
   */
  SelectionMenu: ({ onAction }: { onAction: (a: string) => void }) => (
    <div data-testid="selection-menu">
      <button type="button" onClick={() => onAction("ask")}>
        Ask about this
      </button>
    </div>
  ),
  isInsideSelectionMenu: () => false,
}));
vi.mock("@/components/turn-actions", () => ({
  TurnActions: () => <div data-testid="turn-actions" />,
  TurnReactions: () => null,
}));
vi.mock("@/components/moments-panel", () => ({ MomentsPanel: () => null }));
vi.mock("@/components/outline-nav", () => ({ OutlineNav: () => null }));
vi.mock("@/components/translated-transcript", () => ({ TranslatedTranscript: () => null }));
vi.mock("@/components/new-action-item-dialog", () => ({
  NewActionItemDialog: () => <div data-testid="new-action-item" />,
}));
vi.mock("@/components/moment-composer", () => ({
  ActionItemDialog: () => <div data-testid="action-item-dialog" />,
}));
vi.mock("@/components/reassign-speaker-dialog", () => ({
  ReassignSpeakerDialog: () => <div data-testid="reassign-dialog" />,
}));
vi.mock("@/components/speaker-editor", () => ({
  SpeakerEditor: () => <div data-testid="speaker-editor" />,
}));

// The side pane is the shell's, and its portal target does not exist here.
vi.mock("@/components/side-pane", () => ({
  /*
   * Rendered in place, and only when a test asks for it.
   *
   * <p>The real one portals into an element the shell owns and this file does
   * not render, so it was stubbed to nothing -- which meant the pane's whole
   * contents went untested from this page. The flag renders it inline for the
   * few tests that are about the pane itself, and leaves the other 113 seeing
   * exactly what they saw before: a page with no chat in it.
   */
  SidePane: ({ children }: { children: React.ReactNode }) =>
    renderPane ? <>{children}</> : null,
  useSidePane: () => ({ occupied: false, open: paneOpen, expanded: false }),
  toggleSidePaneExpanded: () => {},
  // Imported by components/pane-close, which the pane's header renders. The
  // pane itself is stubbed away here, so this is never pressed in this file --
  // components/pane-close.test drives it against the real store.
  closeSidePane: () => {
    paneOpen = false;
  },
  /*
   * The chat is a requested state now, so what gets asserted is the request.
   * `Ask` in the mode row and "Ask about this" on a selection both go through
   * here. The real pane is stubbed away in this file -- the shell owns it, and
   * its own tests cover the open and closed rendering.
   */
  openSidePane: () => {
    openPane();
    paneOpen = true;
  },
}));
vi.mock("@/components/header-slot", () => ({
  HEADER_SLOT_ID: "reverie-header-actions",
  // Rendered in place rather than portalled: what the page puts in the header
  // is this page's decision, and the portal itself is the shell's test.
  HeaderSlot: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="header-slot">{children}</div>
  ),
}));

import MeetingDetailPage from "@/app/(app)/meetings/[id]/page";

function aMeeting(over: Partial<MeetingResponse> = {}): MeetingResponse {
  return {
    id: "mtg_1",
    title: "Tuesday design review",
    status: "READY",
    tags: [],
    createdAt: "2026-08-14T09:00:00Z",
    durationSeconds: 2527,
    audioUrl: "https://media.example/mtg_1.webm",
    ...over,
  } as MeetingResponse;
}

function aSegment(over: Partial<TranscriptSegment> = {}): TranscriptSegment {
  return {
    id: "seg_1",
    speaker: "Speaker 1",
    text: "We agreed to ship on the ninth.",
    // `start`/`end`, which is what the type says. Naming them `startTime` here
    // typechecked through the `as` cast and produced a transcript with every
    // utterance at 0:00 -- silently, and only the timecode assertions noticed.
    start: 0,
    end: 6,
    ...over,
  };
}

function anActionItem(over: Partial<ActionItemResponse> = {}): ActionItemResponse {
  return {
    id: "mtg_a",
    meetingId: "mtg_1",
    title: "Send the contract",
    dueStatus: "NONE",
    status: "OPEN",
    edited: false,
    commentCount: 0,
    sourceStartSeconds: 754,
    ...over,
  };
}

function aSection(over: Partial<SummarySection> = {}): SummarySection {
  return { key: "s1", title: "Budget", kind: "prose", text: "", bullets: [], groups: [], ...over };
}

function aSummary(over: Partial<SummaryResponse> = {}): SummaryResponse {
  return {
    meetingId: "mtg_1",
    shortSummary: "The team agreed to ship on the ninth.",
    detailedSummary: "",
    keyPoints: [],
    sections: [],
    templateSlug: "general",
    ...over,
  };
}

/**
 * What `matchMedia("(min-width: 640px)")` should answer.
 *
 * <p>`vitest.setup.ts` reports `matches: false` for everything except
 * `prefers-reduced-motion`, which is the right global default and the wrong
 * one for the two tests that care whether a submenu has room to open. It says
 * per-file overrides are expected; this is one.
 */
function wide(yes: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches: /prefers-reduced-motion/.test(query) ? true : yes,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  meeting = aMeeting();
  segments = [aSegment()];
  moments = [];
  summary = aSummary();
  summaryQuery = "ok";
  templates = [];
  transcriptQuery = "ok";
  transcriptText = undefined;
  actionItems = [];
  actionsQuery = "ok";
  folder = undefined;
  speakers = [];
  paneOpen = false;
  renderPane = false;
});

/**
 * The masthead.
 *
 * <p>The facts about one document, set as a spec line under its title rather
 * than as a row of loose badges — so the title is the only thing competing for
 * first read. What is asserted here is mostly what is *absent*: each of those
 * was argued for once and is the kind of thing a redesign quietly puts back.
 */
describe("the masthead", () => {
  it("leads with the title", () => {
    render(<MeetingDetailPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Tuesday design review",
    );
  });

  it("states the duration and the date", () => {
    render(<MeetingDetailPage />);

    expect(screen.getByText(/42m 7s/)).toBeInTheDocument();
  });

  it("does not badge a meeting READY", () => {
    // A label for the only state that needs none, beside a meeting somebody is
    // plainly reading. Anything else is announced far louder further down.
    render(<MeetingDetailPage />);

    expect(screen.queryByText("READY")).not.toBeInTheDocument();
  });

  it("names the language only when it is not the default", () => {
    // An "English" badge on every meeting is noise.
    meeting = aMeeting({ language: "en" });
    const { unmount } = render(<MeetingDetailPage />);
    expect(screen.queryByText("English")).not.toBeInTheDocument();
    unmount();

    meeting = aMeeting({ language: "de" });
    render(<MeetingDetailPage />);
    expect(screen.getByText("German")).toBeInTheDocument();
  });

  it("gives a document no duration, because it was never spoken", () => {
    meeting = aMeeting({ sourceType: "DOCUMENT", audioUrl: null, durationSeconds: null });
    render(<MeetingDetailPage />);

    expect(screen.getByText("Document")).toBeInTheDocument();
    expect(screen.queryByText(/42m/)).not.toBeInTheDocument();
  });

  it("does not duplicate Copy summary under the title", () => {
    /*
     * THIS ASSERTED THE OPPOSITE. It was promoted out of the menu because
     * pasting a summary into a reply is the commonest thing anybody does with
     * one -- but the menu item was never removed, so the same action had two
     * buttons a centimetre apart and the masthead grew a second control row to
     * hold one of them.
     *
     * <p>It is in `MeetingMenu`, where components/meeting-menu.test.tsx pins
     * it, and the masthead is facts again.
     */
    render(<MeetingDetailPage />);

    expect(screen.queryByRole("button", { name: /Copy summary/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("More actions")).toBeInTheDocument();
  });
});

/**
 * The reading modes.
 *
 * <p>Two, where there were four. Ask and Action items are not places — making
 * them tabs meant the two things you do *while* reading were both somewhere the
 * reading was not.
 */
describe("the way back up", () => {
  it("names the folder this meeting is filed in", () => {
    /*
     * This page had no back link at all, on the reasoning that the band always
     * says where everything is. The band says which *place* you are in; this
     * says which *folder* the document is filed in, which is a fact about the
     * document — and Library, /folders and a folder all open with the same
     * chevron now, so a meeting without one was the odd page out.
     */
    meeting = { ...meeting, projectId: "prj_1" };
    folder = { id: "prj_1", name: "Beta Launch" };
    render(<MeetingDetailPage />);

    expect(screen.getByRole("link", { name: /Beta Launch/ })).toHaveAttribute(
      "href",
      "/folder/prj_1",
    );
  });

  it("goes to Library when it is filed nowhere", () => {
    // And asks for no folder: `useGetProjectQuery` is skipped, so an unfiled
    // meeting costs no request for a link that would have no name.
    render(<MeetingDetailPage />);

    expect(screen.getByRole("link", { name: /Library/ })).toHaveAttribute("href", "/library");
  });
});

describe("who spoke", () => {
  it("counts them in the margin, from real diarization", () => {
    /*
     * IT USED TO NAME THEM. First as a dotted line under the title -- "Maya
     * Chen, Alex Morgan" -- and then, briefly, as a second line under the
     * count in the margin.
     *
     * <p>A fact row is one measurement, and two or three names wrapping under
     * a number made the tallest row in that table the least useful one. The
     * count is what the row answers. Who spoke is on the transcript, against
     * the words: on every turn's own line, and in full behind Edit speakers.
     *
     * <p>Still from `TranscriptResponse.speakers`, which is real diarization
     * output -- so the number cannot be right for a meeting that has none.
     */
    speakers = [
      { speaker: "Maya Chen", speakingSeconds: 900, percentage: 52, segmentCount: 40, wordCount: 900 },
      { speaker: "Alex Morgan", speakingSeconds: 700, percentage: 48, segmentCount: 30, wordCount: 700 },
    ];
    render(<MeetingDetailPage />);

    const aside = screen.getByRole("complementary", { name: "About this meeting" });
    expect(aside).toHaveTextContent("Speakers");
    expect(aside).toHaveTextContent("2");
    expect(screen.queryByText("Maya Chen, Alex Morgan")).not.toBeInTheDocument();
  });

  it("carries no talk-time percentages", () => {
    /*
     * Deleted from the product. They appeared in three places and changed no
     * decisions; the transcript's own speaker strip still has the real stats,
     * where they are read against the words.
     */
    speakers = [
      { speaker: "Maya Chen", speakingSeconds: 900, percentage: 52, segmentCount: 40, wordCount: 900 },
    ];
    render(<MeetingDetailPage />);

    const masthead = screen.getByRole("heading", { level: 1 }).parentElement?.parentElement;
    expect(masthead?.textContent ?? "").not.toMatch(/52%/);
  });

  it("names nobody when diarization has produced nobody", () => {
    // No count, no placeholder, no "Unknown speaker" -- one fewer fact.
    speakers = [];
    render(<MeetingDetailPage />);

    expect(screen.queryByText(/speakers?$/i)).not.toBeInTheDocument();
  });
});

describe("the reading modes", () => {
  it("offers exactly Summary and Transcript", () => {
    render(<MeetingDetailPage />);

    // Trimmed: each segment carries a small glyph before its word, as
    // `18-meeting-brief.png` draws them.
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent?.trim());
    expect(tabs).toEqual(["Summary", "Transcript"]);
  });

  it("opens on the summary", () => {
    render(<MeetingDetailPage />);

    expect(screen.getByRole("tab", { name: "Summary" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("switches to the transcript", async () => {
    render(<MeetingDetailPage />);

    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));

    expect(screen.getByRole("tab", { name: "Transcript" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

/**
 * The column the document is set in.
 *
 * <p>680px, which is about 74 characters at the reading size. The point of
 * asserting it on the page rather than in each panel is that a summary and a
 * transcript must be set in the *same* column: moving between the two reading
 * modes is a change of content, not of reading posture, and two panels each
 * choosing their own width is how that stops being true.
 */
describe("what this page must never say", () => {
  /*
   * The four references this page was rebuilt against sell a cross-meeting
   * memory system: a Memory reading mode, "What this meeting changed", a
   * decision that reverses one from 12 August, promises kept and slipped, a
   * risk carried in from another call, topics in instalments. None of it
   * exists — the migrations dropped `meeting_decisions`, `decision_links`,
   * `commitments` and `commitment_evidence`, and nothing replaced them.
   *
   * <p>Only the composition was taken from those files. These assert the rest
   * of them stayed out, because a redesign is exactly when unsupported copy
   * gets typed in from a picture.
   */
  it("offers no third reading mode", () => {
    /*
     * Scoped to the tablist the reading modes live in. The meeting rail has
     * tabs of its own -- the chat and the outline -- which are legitimately
     * tabs and are portalled into the shell's side pane, so an unscoped
     * `getAllByRole("tab")` passes under jsdom and says nothing about a
     * browser. What must never grow a third member is this list.
     */
    render(<MeetingDetailPage />);

    const modes = screen.getAllByRole("tablist")[0];
    const tabs = Array.from(modes.querySelectorAll('[role="tab"]')).map((t) =>
      t.textContent?.trim(),
    );
    expect(tabs).toEqual(["Summary", "Transcript"]);
    expect(tabs).not.toContain("Memory");
  });

  it("uses none of the vocabulary of a memory it does not have", () => {
    render(<MeetingDetailPage />);

    const text = document.body.textContent ?? "";
    for (const invented of [
      /\bMemory\b/,
      /What this meeting changed/i,
      /Decision Drift/i,
      /Promise Journey/i,
      /Commitment Ledger/i,
      /Promise slipped/i,
      /Promise kept/i,
      /Reverses \d/i,
      /instalment/i,
      /Open the thread/i,
      /carried in/i,
    ]) {
      expect(text).not.toMatch(invented);
    }
  });

  it("calls the summary a summary, never a brief", () => {
    /*
     * The references say "Brief". Production says Summary everywhere a reader
     * can see it -- and the API already says summary, so nothing was renamed
     * underneath to achieve it.
     */
    render(<MeetingDetailPage />);

    expect(document.body.textContent ?? "").not.toMatch(/\bbriefs?\b/i);
  });
});

describe("the frame", () => {
  it("sets the summary in the document column", () => {
    const { container } = render(<MeetingDetailPage />);

    expect(container.querySelector(".v2-page")).toBeInTheDocument();
    // `.v2-spread` was the single centred 680px measure this replaced.
    expect(container.querySelector(".v2-spread")).toBeNull();
  });

  it("sets the transcript in the same one", async () => {
    const { container } = render(<MeetingDetailPage />);

    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));

    expect(container.querySelector(".v2-page")).toBeInTheDocument();
  });

  it("draws the margin, and keeps it across both reading modes", async () => {
    /*
     * INVERTED. This asserted `data-margin="empty"` -- the measure centred,
     * with no second column -- on the grounds that an empty 400px gutter looks
     * broken and there was nothing real to put in it.
     *
     * <p>There is now: the facts about the meeting, the topics, and how many
     * action items, decisions and risks it has. All of it was already being
     * fetched for the document, so the margin costs no request; what it used
     * to cost was the two rows of metadata between the title and the first
     * sentence.
     *
     * <p>Across both modes, because the facts are equally true of either and a
     * second column that appears when somebody changes tab is a page that
     * changes shape under them.
     */
    const { container } = render(<MeetingDetailPage />);

    expect(container.querySelector("[data-page-margin]")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "About this meeting" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));
    expect(container.querySelector("[data-page-margin]")).toBeInTheDocument();
  });

  it("states the facts once, in the margin rather than under the title", () => {
    /*
     * They were a dotted sentence under the title -- date, duration, who
     * spoke, language, tags -- so the summary's first line began a long way
     * down a page opened to read it. Asserted as "in the margin", not merely
     * "present": moving them and leaving a copy behind would pass a test that
     * only looked for the words.
     */
    const { container } = render(<MeetingDetailPage />);

    const aside = screen.getByRole("complementary", { name: "About this meeting" });
    const duration = screen.getByText("Duration");
    expect(aside.contains(duration)).toBe(true);
    // One statement of it, not two.
    expect(screen.getAllByText("Duration")).toHaveLength(1);
    expect(container.querySelector("[data-page-margin]")?.contains(aside)).toBe(true);
  });

  it("sets the switch and the masthead in the same column as the document", () => {
    /*
     * THIS ASSERTED THE OPPOSITE, and the reversal is the correction.
     *
     * <p>The argument was that a switch is chrome and chrome indented to the
     * measure reads as part of the text. That held while the document was
     * left-aligned under a full-width row. It stopped holding when the chat
     * became a requested state: with the pane closed the document centres, so
     * a full-width row left the title and the tabs starting at 24px above a
     * document starting at 380px -- a document that does not line up with the
     * thing naming it.
     *
     * <p>One column for all of it now, which is what /folders and a folder
     * already do.
     */
    const { container } = render(<MeetingDetailPage />);

    const list = screen.getByRole("tablist");
    const title = screen.getByRole("heading", { level: 1 });
    const frame = container.querySelector(".v2-page");

    expect(frame).toBeInTheDocument();
    expect(list.closest(".v2-page")).toBe(frame);
    expect(title.closest(".v2-page")).toBe(frame);
    // And in the document column rather than the margin.
    expect(list.closest("[data-page-margin]")).toBeNull();
    expect(title.closest("[data-page-margin]")).toBeNull();
  });

  it("holds the prose to the reading measure, in both modes and to the same width", async () => {
    /*
     * The frame's document column is about 1010px at the reference width,
     * which is right for a list of rows and too wide for prose: the lead
     * paragraph measured a hundred characters before this cap, where the whole
     * point of `--measure` is that the eye loses the line past eighty.
     *
     * <p>The same token on both panels, which is the older half of this rule.
     * Moving between the two reading modes is a change of content, not of
     * reading posture, and two panels each choosing their own width is how
     * that stops being true.
     */
    const { container } = render(<MeetingDetailPage />);

    const summaryPanel = container.querySelector('[role="tabpanel"]');
    expect(summaryPanel?.className).toContain("max-w-measure");
    // And the masthead is NOT held to it -- it gets the whole column, which is
    // what lines the title up with the document rather than centring away.
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.closest(".max-w-measure")).toBeNull();

    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));
    const transcriptPanel = container.querySelector('[role="tabpanel"]');
    expect(transcriptPanel?.className).toContain("max-w-measure");
  });

  it("applies the frame exactly once", () => {
    // It was on both `TabsContent` panels and nowhere else. Two of them is how
    // the summary and the transcript come to disagree about their own width.
    const { container } = render(<MeetingDetailPage />);

    expect(container.querySelectorAll(".v2-page")).toHaveLength(1);
    expect(container.querySelectorAll("[data-page-margin]")).toHaveLength(1);
  });
});

/**
 * Where the transport is.
 *
 * <p>It floats over the transcript it is scrubbing, which is the one thing on
 * this page that is genuinely the functional layer.
 */
describe("the docked player", () => {
  /**
   * The fixed wrapper the page draws around the transport.
   *
   * <p>It was matched on `.fixed.inset-x-0.bottom-0`. `inset-x-0` is gone: the
   * bar is inset to the document column now rather than spanning the window,
   * so the selector that identified it was also the bug.
   */
  function dock(container: HTMLElement) {
    return container.querySelector(".fixed.bottom-0");
  }

  it("stays out of the way on the summary", () => {
    // There is nothing to scrub past on a brief, and a bar over one is a
    // control acting on something that is not on screen.
    const { container } = render(<MeetingDetailPage />);

    expect(dock(container)).toBeNull();
  });

  it("appears with the transcript", async () => {
    const { container } = render(<MeetingDetailPage />);

    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));

    expect(dock(container)).not.toBeNull();
    expect(screen.getByRole("slider", { name: "Seek" })).toBeInTheDocument();
  });

  it("does not appear for a document, which was never spoken", async () => {
    meeting = aMeeting({ sourceType: "DOCUMENT", audioUrl: null });
    const { container } = render(<MeetingDetailPage />);

    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));

    expect(dock(container)).toBeNull();
  });

  it("does not appear when the recording has been erased", async () => {
    meeting = aMeeting({ audioUrl: null });
    const { container } = render(<MeetingDetailPage />);

    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));

    expect(dock(container)).toBeNull();
  });

  it("reserves no room for a navigation rail that no longer exists", async () => {
    // `lg:left-[var(--rail-w,16rem)]` was correct while the shell had a 256px
    // column. It does not, and the fallback in that expression is what would
    // have shifted the bar 16rem right the moment the variable stopped being
    // published.
    const { container } = render(<MeetingDetailPage />);

    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));

    expect(dock(container)?.className).not.toContain("--rail-w");
  });

  it("sits in the middle of the document column, wide enough not to wrap", async () => {
    /*
     * BACK TO `max-w-measure`, and this is the second reversal of the same
     * decision, so it is worth being exact about what changed.
     *
     * <p>The argument for `--doc` was sound in itself: a timeline is a ruler
     * over forty minutes, and a wider ruler is a finer one. What was wrong was
     * the frame of reference. `max-w-doc` with `mx-auto` inside an
     * `inset-x-0` wrapper centred 1120px of transport on the WINDOW -- at 1672
     * it ran from x=260 to x=1650, under the margin and 570px past the rule at
     * 1083. A ruler laid across the facts about the recording is not a finer
     * ruler; it is in the wrong place.
     *
     * <p>The wrapper is the document column now, so `mx-auto` centres inside
     * that, and the approved transcript puts the transport in the middle of
     * the document rather than spanning it.
     *
     * <p>Not the reading measure either, though: at 680px the trailing group
     * wrapped and the volume slider dropped to a second row, taking the bar
     * from 60px to 80. Prose has a measure because of how far the eye travels;
     * a transport has a minimum because of what is in it.
     */
    const { container } = render(<MeetingDetailPage />);

    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));

    /* Neither the window-centred `--doc` nor the paragraph measure -- and
       capped at something, rather than filling the column. The exact number is
       the transport's minimum and has been tuned twice; what must not drift is
       the frame of reference, so that is what this pins. */
    expect(dock(container)?.querySelector(".max-w-doc")).toBeNull();
    expect(dock(container)?.querySelector(".max-w-measure")).toBeNull();
    const bar = dock(container)?.firstElementChild;
    expect(bar?.className).toMatch(/max-w-\[\d/);
    expect(bar?.className).toContain("mx-auto");
    // Inset to the column rather than spanning the window, which is the half
    // of this that the `mx-auto` above depends on.
    expect(dock(container)?.className).not.toContain("inset-x-0");
    expect(dock(container)?.className).toContain("--page-margin-track");
  });
});

/**
 * What acts on this meeting, and where it is.
 *
 * <p>Export and the ⋯ menu were drawn into the shell's `HeaderSlot`, which is
 * a full-width row: over a centred 680px document they floated hard right of
 * the window, reading as application chrome rather than as this meeting's. The
 * menu is in the masthead now, beside the title, and Export is an item inside
 * it — one action surface per document, which is what the reference's single
 * `⋯` is.
 */
describe("the meeting's own controls", () => {
  it("puts the action menu beside the title, not in the shell's row", () => {
    render(<MeetingDetailPage />);

    const menu = screen.getByLabelText("More actions");
    const title = screen.getByRole("heading", { level: 1 });
    const facts = screen.getByText(/42m/);

    // After the title and before the facts line: on the title's own row,
    // aligned to the document rather than to the window.
    expect(title.compareDocumentPosition(menu)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(menu.compareDocumentPosition(facts)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    /*
     * And the page hands the shell nothing at all: `HeaderSlot` is not
     * rendered, so the shell's full-width row contributes zero pixels here.
     * The stub is mounted only when the page uses it.
     */
    expect(screen.queryByTestId("header-slot")).not.toBeInTheDocument();
  });

  it("keeps Export reachable, from inside that menu", async () => {
    render(<MeetingDetailPage />);

    await userEvent.click(screen.getByLabelText("More actions"));

    expect(screen.getByRole("menuitem", { name: /Export/ })).toBeInTheDocument();
  });

  it("offers the menu on a meeting that failed, which is when it matters most", () => {
    // Deleting a meeting that failed to process is the commonest thing to want
    // to do with one.
    meeting = aMeeting({ status: "FAILED", audioUrl: null });
    render(<MeetingDetailPage />);

    expect(screen.getByLabelText("More actions")).toBeInTheDocument();
  });

  it("draws no menu while the meeting is still being made", () => {
    // Everything in it that needs a transcript is gated off at that point.
    meeting = aMeeting({ status: "TRANSCRIBING", audioUrl: null });
    render(<MeetingDetailPage />);

    expect(screen.queryByLabelText("More actions")).not.toBeInTheDocument();
  });

  it("puts no empty tag pill in the masthead", () => {
    /*
     * It carried a dashed `+ Tag` on every meeting, tagged or not -- an empty
     * affordance on the overwhelming majority of them, and part of what kept
     * that area looking utility-heavy. `18-meeting-brief.png` has one facts
     * line and nothing else before the document.
     *
     * <p>Adding one is an action, so it moved to where the actions are: the
     * item and its callback are pinned in components/meeting-menu.test.tsx,
     * against the real menu.
     */
    render(<MeetingDetailPage />);

    expect(screen.queryByRole("button", { name: /Tag/ })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Tag name")).not.toBeInTheDocument();
  });

  it("shows tags a meeting already has, on the facts line", () => {
    meeting = aMeeting({ tags: ["beta", "launch"] });
    render(<MeetingDetailPage />);

    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(screen.getByText("launch")).toBeInTheDocument();
  });
});

/**
 * The chat is asked for, not assumed.
 *
 * <p>`SidePaneState.open` defaulted to true, and the only page that fills the
 * pane is this one — so every READY meeting arrived as a document beside a chat
 * application, which is the split-pane shape the V2 study exists to remove.
 * The reference has one document and an `Ask` control.
 */
/**
 * The navigator, from the page's side.
 *
 * <p>What it is made of is components/jump-to's own test. What is asserted here
 * is the wiring: that the `⋯` menu opens it, that it goes through the page's one
 * seek pipeline, and that choosing a timed target from the summary brings the
 * transcript with it rather than leaving the reader to switch tabs.
 */
/**
 * The navigator, and the one way into it.
 *
 * <p>It had a menu item with a `⌘.` keycap beside it. The approved menu does
 * not, so the item is gone and the shortcut is the whole of the way in — which
 * is what these now drive. The dialog, its rows and the seek pipeline behind
 * them are untouched.
 *
 * <p>Asserted absent from the menu as well, in components/meeting-menu.test,
 * because an item quietly returning is the drift worth catching.
 */
describe("Jump to", () => {
  /** `⌘.`, on the window, which is where the page binds it. */
  const jump = () =>
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: ".", metaKey: true, bubbles: true }),
      );
    });

  it("opens on its shortcut", async () => {
    render(<MeetingDetailPage />);

    jump();

    expect(await screen.findByRole("dialog", { name: "Jump to" })).toBeInTheDocument();
  });

  it("is not offered by the menu any more", async () => {
    render(<MeetingDetailPage />);

    await userEvent.click(screen.getByLabelText("More actions"));

    expect(screen.queryByRole("menuitem", { name: /Jump to/ })).not.toBeInTheDocument();
  });

  it("is not a third reading mode", () => {
    // It is a dialog on a menu, not a tab. `18-meeting-brief.png` keeps that
    // row to the two reading modes, Ask and the overflow.
    render(<MeetingDetailPage />);

    const tabs = screen.getAllByRole("tab").map((t) => t.textContent?.trim());
    expect(tabs).toEqual(["Summary", "Transcript"]);
  });

  it("brings the transcript with it when a topic is chosen from the summary", async () => {
    /*
     * THE WHOLE POINT OF ROUTING IT THROUGH `playFrom`. Jump to can be opened
     * over the summary, and a timed target is a place in the transcript — so the
     * tab change and the seek are one action, not a tab change and then a
     * request that the reader find the minute themselves.
     */
    summary = {
      ...summary!,
      sections: [
        {
          key: "outline",
          title: "What was discussed",
          kind: "outline",
          text: "",
          bullets: [],
          groups: [{ heading: "Moving the beta date", bullets: [], startSeconds: 698 }],
        },
      ],
    };
    render(<MeetingDetailPage />);
    expect(screen.getByRole("tab", { name: "Summary" })).toHaveAttribute("aria-selected", "true");

    jump();
    await userEvent.click(
      await screen.findByRole("option", { name: /Moving the beta date/ }),
    );

    expect(screen.getByRole("tab", { name: "Transcript" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("does not open the chat", async () => {
    // Navigation and asking are different things. The pane stays where the
    // reader left it, which after 0a3aaa2 is closed.
    render(<MeetingDetailPage />);

    jump();
    await screen.findByRole("dialog", { name: "Jump to" });

    expect(openPane).not.toHaveBeenCalled();
  });
});

/**
 * THE CONTROL THAT OPENS THE PANE, on the mode row.
 *
 * <p>Named `AI` and marked with the Reverie glyph. It was `Ask` behind a
 * `Sparkles`, and both changed: the star is what every product in the category
 * spends on the same claim, and the word collided with a band nav item called
 * Ask Reverie that navigates to the workspace chat instead of opening this
 * one. Home's launcher carries the same label, so one name opens one panel.
 *
 * <p>Matched by its accessible name, which is longer than what is drawn: the
 * visible label is `AI` and a hidden continuation makes it
 * "AI — ask about this conversation", because "AI" alone is a poor thing to
 * hear announced. The visible text is contained in the spoken name, so the two
 * cannot disagree.
 */
const AI_BUTTON = /^AI — ask about this conversation$/;

describe("Ask", () => {
  it("is on the mode row, at the far end", () => {
    render(<MeetingDetailPage />);

    const modes = screen.getAllByRole("tablist")[0];
    const ask = screen.getByRole("button", { name: AI_BUTTON });
    expect(modes.parentElement).toContainElement(ask);
  });

  it("opens the meeting's own chat, and does not leave for the workspace one", async () => {
    render(<MeetingDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: AI_BUTTON }));

    expect(openPane).toHaveBeenCalled();
    // Not a link: /ask is the workspace chat, which knows nothing about this
    // transcript.
    expect(screen.queryByRole("link", { name: AI_BUTTON })).not.toBeInTheDocument();
  });

  it("wires the selection menu to the same handler", async () => {
    /*
     * The selection path itself needs a real `Selection` to produce a passage,
     * which jsdom does not give and synthetic drags do not either -- so what is
     * asserted here is that the menu is mounted over the transcript and handed
     * the page's action handler. That handler calls `askAbout`, and `askAbout`
     * opens the pane; the test above pins the opening.
     *
     * <p>The end-to-end selection interaction is on the manual checklist. See
     * the note in the commit.
     */
    segments = [aSegment({ id: "s1", text: "We agreed to ship on the ninth." })];
    render(<MeetingDetailPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));

    expect(screen.getByTestId("selection-menu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask about this" })).toBeInTheDocument();
  });

  it("does not disturb the player it is opened over", async () => {
    /*
     * Below `lg` the pane is laid over the meeting rather than appended to it,
     * which is only safe because the meeting underneath is untouched: the
     * player is covered, never unmounted, so the recording keeps its position,
     * its rate and its volume and closing the chat reveals it exactly as it
     * was. A pane that replaced the document would have to rebuild all of it.
     *
     * <p>Asserted as "still mounted" because that is the whole mechanism. The
     * geometry -- `z-30` over the player's `z-20`, and the hit test proving the
     * pane paints over it -- is measured in a browser at 768 and 390.
     */
    render(<MeetingDetailPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));
    const player = screen.getByRole("slider", { name: "Seek" });

    await userEvent.click(screen.getByRole("button", { name: AI_BUTTON }));

    expect(screen.getByRole("slider", { name: "Seek" })).toBe(player);
    expect(screen.getByText("Transcript")).toBeInTheDocument();
  });

  it("is not a second chat", () => {
    // One meeting-scoped implementation. The rail is the same component it has
    // always been; only its default visibility changed.
    render(<MeetingDetailPage />);

    expect(screen.getAllByRole("button", { name: AI_BUTTON })).toHaveLength(1);
  });
});

/**
 * THE PANE'S ONE HEADER ROW.
 *
 * <p>There were two: a tab row reading `[mark] Ask | Outline` with the pane's
 * collapse glyph at its far end, and then the conversation's own row under it.
 * Two rows of chrome over the first answer in a 26rem rail, and two full-width
 * hairlines 53px apart — a panel with two headers.
 *
 * <p>What is here now is the row Home's pane has, drawn by the same component:
 * the mark, the conversation, New chat, maximise, the way out, and — over the
 * transcript only — the outline.
 *
 * <p>These are the first tests in this file to render the pane at all. It was
 * stubbed to nothing because the real one portals into the shell; see the
 * `renderPane` flag and the `useActiveChat` mock above, which had to be
 * corrected before any of this could mount.
 */
describe("the pane's one header row", () => {
  /** Open the pane and put its contents on the page. */
  async function openTheChat() {
    renderPane = true;
    render(<MeetingDetailPage />);
    await userEvent.click(screen.getByRole("button", { name: AI_BUTTON }));
  }

  it("carries the way out as a cross, not a panel-collapse glyph", async () => {
    await openTheChat();

    /*
     * It was `PaneClose`, whose glyph is a rectangle with a bar down one side
     * — a fair icon for "collapse this panel" and one that only reads that way
     * to somebody who already knows. An `X` beside maximise is what Home's
     * pane has and what a panel with a header is expected to have, so the two
     * panes are now shut the same way.
     */
    expect(screen.getByRole("button", { name: "Close Ask Reverie" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /hide ai chat/i })).not.toBeInTheDocument();
  });

  it("says what the panel is with the mark rather than a second name", async () => {
    await openTheChat();

    // The tab said `Ask` and the header said nothing; now the mark says it.
    // The conversation is what reads first, because it is the only thing up
    // there that changes.
    expect(screen.queryByRole("tab", { name: /^Ask$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous chat history/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New chat" })).toBeInTheDocument();
  });

  it("carries no outline of its own, because the margin already has one", async () => {
    /*
     * THIS PANE HAD AN `Outline` TAB, and it took a screenshot to see that it
     * should not.
     *
     * <p>The argument for it was sound: a transcript has no headings of its
     * own, and the summary's outline is the only thing that makes an hour of
     * speech navigable. What the argument missed is that the margin has been
     * carrying exactly that since this page went on the frame -- a `Transcript
     * outline` region, gated on the same condition, from the same headings,
     * with the same timecodes and the same seek, and permanently visible
     * rather than behind a toggle.
     *
     * <p>So the tab was the same list twice on one screen about 250px apart,
     * and the copy in here was the worse of the two. Both halves are asserted
     * together, because the only thing that makes removing it safe is that the
     * other one is there.
     */
    renderPane = true;
    // The margin's outline is built from the summary's `outline` sections, and
    // the default fixture has none -- so without this the second assertion
    // would pass for the wrong reason.
    summary = aSummary({
      sections: [
        {
          key: "discussed",
          title: "What was discussed",
          kind: "outline",
          text: "",
          bullets: [],
          groups: [
            { heading: "Moving the beta date", bullets: [], startSeconds: 330 },
          ],
        },
      ],
    });
    render(<MeetingDetailPage />);
    await userEvent.click(screen.getByRole("button", { name: AI_BUTTON }));
    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));

    // Not in the pane, under any of the names it has had.
    expect(screen.queryByRole("button", { name: "Outline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Outline" })).not.toBeInTheDocument();
    // And still on the page, in the margin.
    expect(screen.getByRole("heading", { name: "Transcript outline" })).toBeInTheDocument();
  });
});

/**
 * THE MARGIN'S INDEX, from either tab.
 *
 * <p>Action items, decisions and risks each say how many there are and go to
 * them. They are rows in the margin, which is beside both tabs; the sections
 * they point at are inside the summary panel, which is one of two
 * `TabsContent` and unmounted while the transcript is showing.
 *
 * <p>So `href="#meeting-insights"` worked from the summary and did nothing at
 * all from the transcript -- a dead link, and dead in the one direction
 * somebody would actually use it: you read the transcript, notice the margin
 * says a decision was recorded, press it, and the page sits still.
 */
describe("the margin's index", () => {
  /** One open action item, so the margin's index row is a link. */
  function withIndexedSections() {
    actionItems = [anActionItem({ id: "ai_1", title: "Write the announcement" })];
  }

  /**
   * The element the last scroll was asked of.
   *
   * <p>`mock.instances` is typed from the spied signature, which returns
   * `void`, so the cast is unavoidable — the instance is the receiver rather
   * than the return.
   */
  function scrolled(spy: ReturnType<typeof vi.spyOn>): HTMLElement | undefined {
    return spy.mock.instances[0] as unknown as HTMLElement | undefined;
  }

  it("switches to the summary and scrolls to the section", async () => {
    withIndexedSections();
    const scrollTo = vi.spyOn(Element.prototype, "scrollIntoView");
    render(<MeetingDetailPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));
    expect(screen.getByRole("tab", { name: "Transcript" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.click(screen.getByRole("link", { name: /1 of 1 open/ }));

    // The tab first, because the element does not exist until it is mounted.
    expect(screen.getByRole("tab", { name: "Summary" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    /*
     * `waitFor`, because the scroll genuinely is not synchronous with the
     * click: the panel mounts a commit later, so the page waits a frame for
     * the anchor to appear. See the effect in the page.
     */
    await waitFor(() => expect(scrollTo).toHaveBeenCalled());
    // And the thing scrolled to is the section, not the page.
    expect(scrolled(scrollTo)?.id).toBe("meeting-action-items");
    scrollTo.mockRestore();
  });

  it("still goes to the section when the summary is already showing", async () => {
    // The case that always worked, kept so the fix cannot break it.
    withIndexedSections();
    const scrollTo = vi.spyOn(Element.prototype, "scrollIntoView");
    render(<MeetingDetailPage />);

    await userEvent.click(screen.getByRole("link", { name: /1 of 1 open/ }));

    expect(screen.getByRole("tab", { name: "Summary" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await waitFor(() => expect(scrollTo).toHaveBeenCalled());
    expect(scrolled(scrollTo)?.id).toBe("meeting-action-items");
    scrollTo.mockRestore();
  });

  it("keeps the href, so the link is still true when it is pasted", async () => {
    /*
     * Suppressed on click and kept on the element. Opened cold,
     * `/meetings/x#meeting-action-items` lands on the summary -- the default
     * tab -- and the browser scrolls to it with no help from us.
     */
    withIndexedSections();
    render(<MeetingDetailPage />);

    expect(screen.getByRole("link", { name: /1 of 1 open/ })).toHaveAttribute(
      "href",
      "#meeting-action-items",
    );
  });

  it("does not scroll the page later, having been left pending", async () => {
    /*
     * The anchor is remembered until the summary is mounted, so it has to be
     * cleared once used -- otherwise it scrolls the page the next time the
     * reader opens the summary, minutes later, for their own reasons.
     */
    withIndexedSections();
    render(<MeetingDetailPage />);
    await userEvent.click(screen.getByRole("link", { name: /1 of 1 open/ }));

    const scrollTo = vi.spyOn(Element.prototype, "scrollIntoView");
    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));
    await userEvent.click(screen.getByRole("tab", { name: "Summary" }));

    expect(scrollTo).not.toHaveBeenCalled();
    scrollTo.mockRestore();
  });
});

/**
 * NOTES MADE FROM A SELECTION, which had nowhere to appear.
 *
 * <p>`turnMarks` requires `ranges.length === 0` — right for a reaction or a
 * note attached to a whole turn, and wrong for a note attached to words. A
 * passage note failed that filter and rendered in no element on the page.
 *
 * <p>Measured on the running stack before the fix: `POST /moments` returned
 * 201 with the ranges and the body intact, `GET /moments` returned it, the
 * selected words were underlined — and the note's text appeared nowhere. The
 * only trace was a `title` attribute on the word spans, so there was no way to
 * read it, edit it or delete it. Saved and unreachable.
 *
 * <p>The renderer's own comment said passage notes "would exist only in the
 * collapsed marks list", and the V2 transcript has no such list. So they are
 * shown where turn-level notes already are: under the words, with the same
 * delete control.
 */
function aNote(over: Partial<TranscriptMoment> = {}): TranscriptMoment {
  return {
    id: "mom_note",
    meetingId: "mtg_1",
    kind: "NOTE",
    ranges: [{ segmentId: "seg_1", startOffset: 13, endOffset: 17, quote: "ship" }],
    quote: "ship",
    body: "Check this before the launch.",
    speaker: "Speaker 1",
    startSeconds: 1,
    endSeconds: 2,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...over,
  };
}

describe("notes on a passage", () => {
  it("shows the note under the words it is about", async () => {
    moments = [aNote()];
    render(<MeetingDetailPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));

    // The whole bug: this text was in no element at all.
    expect(screen.getByText("Check this before the launch.")).toBeInTheDocument();
  });

  it("offers the same way to delete it as a turn note", async () => {
    moments = [aNote()];
    render(<MeetingDetailPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));

    // One presentation for both kinds, so there is one thing to learn.
    expect(screen.getByRole("button", { name: "Delete this note" })).toBeInTheDocument();
  });

  it("still shows a note attached to a whole turn", async () => {
    // The case that always worked, kept so the fix cannot break it.
    moments = [aNote({ id: "mom_turn", ranges: [], startSeconds: 0, body: "About this turn." })];
    render(<MeetingDetailPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));

    expect(screen.getByText("About this turn.")).toBeInTheDocument();
  });

  it("does not show a note belonging to a different segment", async () => {
    moments = [aNote({ ranges: [{ segmentId: "seg_other", startOffset: 0, endOffset: 4, quote: "ship" }] })];
    render(<MeetingDetailPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));

    expect(screen.queryByText("Check this before the launch.")).not.toBeInTheDocument();
  });

  it("underlines the words the note is on", async () => {
    // Painting was never the broken half; asserted so the two halves stay
    // together — a note that paints and cannot be read is the bug again.
    moments = [aNote()];
    const { container } = render(<MeetingDetailPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));

    const marked = Array.from(container.querySelectorAll("[data-word]")).filter((w) =>
      /border-warning/.test(w.className),
    );
    expect(marked.map((w) => w.textContent?.trim())).toContain("ship");
  });
});

/**
 * The brief — every shape it can take, and every state it can be in.
 *
 * <h2>Why this is the page's test and not the panel's</h2>
 *
 * <p>`SummaryPanel` is a local function inside this file's subject rather than
 * an exported component, so the page is the only place it can be exercised at
 * all. That is not a compromise: what makes the brief hard is that a summary
 * can be present, absent, being written, failed, stale, translated, or
 * pre-dating the template system — and several of those used to render as the
 * same screen. "No summary available." over a summary that existed is the
 * screenshot this whole state machine was built for.
 *
 * <p>Phase 7 replaced the presentation of all of it. Each case below is one of
 * the capabilities inventoried before a line changed.
 */
describe("the summary", () => {
  it("reads a summary that pre-dates templates from its flat fields", () => {
    // No sections, so the lead, the key points and the long form are the
    // document. Still rendered — a redesign that handles only the new shape
    // silently blanks every meeting summarised before templates existed.
    summary = aSummary({
      shortSummary: "We shipped the redesign.",
      keyPoints: ["Ship on the ninth", "Freeze on the seventh"],
      detailedSummary: "A longer account of the same.",
    });
    render(<MeetingDetailPage />);

    expect(screen.getByText("We shipped the redesign.")).toBeInTheDocument();
    expect(screen.getByText("Ship on the ninth")).toBeInTheDocument();
    expect(screen.getByText("A longer account of the same.")).toBeInTheDocument();
  });

  it("prefers structured sections when the summary has them", () => {
    summary = aSummary({
      shortSummary: "ignored when there are sections",
      sections: [aSection({ title: "Budget", kind: "prose", text: "No budget was set." })],
    });
    render(<MeetingDetailPage />);

    expect(screen.getByRole("heading", { name: "Budget" })).toBeInTheDocument();
    expect(screen.getByText("No budget was set.")).toBeInTheDocument();
  });

  it("keeps an empty section's heading, because the absence is a finding", () => {
    // "Budget" with nothing under it tells the reader budget never came up.
    // Inferring the shape from the data would silently hide that.
    summary = aSummary({ sections: [aSection({ title: "Risks" })] });
    render(<MeetingDetailPage />);

    /*
     * `level: 3`, because the margin labels its own index of the risks "Risks"
     * as well. That is how a table of contents works rather than a defect --
     * see the note on `MeetingMargin` -- but it does mean this has to say
     * which of the two it means. The document's section headings are h3.
     */
    expect(screen.getByRole("heading", { name: "Risks", level: 3 })).toBeInTheDocument();
    expect(screen.getByText("Not discussed.")).toBeInTheDocument();
  });

  it("draws a bullets section as bullets", () => {
    summary = aSummary({
      sections: [aSection({ kind: "bullets", bullets: ["First thing", "Second thing"] })],
    });
    render(<MeetingDetailPage />);

    expect(screen.getByText("First thing")).toBeInTheDocument();
    expect(screen.getByText("Second thing")).toBeInTheDocument();
  });

  it("makes an anchored outline heading play from its moment", async () => {
    summary = aSummary({
      sections: [
        aSection({
          kind: "outline",
          key: "outline",
          groups: [{ heading: "Pricing", startSeconds: 754, bullets: ["We held the price."] }],
        }),
      ],
    });
    render(<MeetingDetailPage />);

    const heading = screen.getByRole("button", { name: /Pricing/ });
    expect(heading).toHaveAttribute("title", "Play from 12:34");

    await userEvent.click(heading);

    // Following a citation out of the brief takes you to the words it was
    // read from, with the player already there. Seeking under a summary the
    // reader cannot see the timeline of would be a control acting off screen.
    expect(screen.getByRole("tab", { name: "Transcript" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("leaves an unanchored heading as plain text, not a link to a guess", () => {
    // A link that lands on the wrong minute is indistinguishable from a
    // transcript that disagrees with its own summary, and the reader has no way
    // to tell which of the two is broken.
    summary = aSummary({
      sections: [
        aSection({
          kind: "outline",
          key: "outline",
          groups: [{ heading: "Pricing", startSeconds: null, bullets: ["We held the price."] }],
        }),
      ],
    });
    render(<MeetingDetailPage />);

    expect(screen.queryByRole("button", { name: /Pricing/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pricing" })).toBeInTheDocument();
  });

  it("lists the topics from the outline's own headings", () => {
    // Not a second list generated separately, which could disagree with the
    // outline and leave two answers to "what was discussed".
    summary = aSummary({
      sections: [
        aSection({
          kind: "outline",
          key: "outline",
          groups: [
            { heading: "Pricing", startSeconds: 10, bullets: [] },
            { heading: "Hiring", startSeconds: 90, bullets: [] },
          ],
        }),
      ],
    });
    render(<MeetingDetailPage />);

    /*
     * No heading, and no pills. `18-meeting-brief.png` sets these as plain
     * text under the lead, separated by the product's dot -- six words that do
     * not need to be told they are topics, and are not operable so must not
     * look it.
     */
    expect(screen.queryByText("Topics discussed")).not.toBeInTheDocument();
    expect(screen.getAllByText("Pricing").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hiring").length).toBeGreaterThan(0);
  });

  it("does not read topics out of a section that merely looks like an outline", () => {
    // Keyed on `outline`, not on kind: the Interview template pairs each
    // question with its answer in the outline SHAPE, and those headings are
    // questions rather than topics the meeting covered.
    summary = aSummary({
      sections: [
        aSection({
          kind: "outline",
          key: "questions",
          groups: [{ heading: "Why did you leave?", startSeconds: 10, bullets: [] }],
        }),
      ],
    });
    render(<MeetingDetailPage />);

    expect(screen.queryByText("Topics discussed")).not.toBeInTheDocument();
  });

  it("shows verified quotations, playable at the moment they were said", () => {
    summary = aSummary({
      sections: [aSection({ text: "x" })],
      quotes: [{ text: "We ship on the ninth.", speaker: "Priya", start: 754 }],
    });
    render(<MeetingDetailPage />);

    expect(screen.getByText("Key quotations")).toBeInTheDocument();
    expect(screen.getByText(/We ship on the ninth/)).toBeInTheDocument();
    expect(screen.getByText("Priya")).toBeInTheDocument();
    expect(screen.getByText("12:34")).toBeInTheDocument();
  });

  it("names an unattributed quotation rather than leaving a gap", () => {
    summary = aSummary({
      sections: [aSection({ text: "x" })],
      quotes: [{ text: "We ship on the ninth.", speaker: "", start: 0 }],
    });
    render(<MeetingDetailPage />);

    expect(screen.getByText("Unknown speaker")).toBeInTheDocument();
  });

  it("shows no quotations section when nothing was verified", () => {
    // A normal outcome rather than a failure, and an empty decorative box
    // headed "Key quotations" would report it as one.
    summary = aSummary({ sections: [aSection({ text: "x" })], quotes: [] });
    render(<MeetingDetailPage />);

    expect(screen.queryByText("Key quotations")).not.toBeInTheDocument();
  });
});

/**
 * The brief when it is not simply there.
 *
 * <p>Six states, and three of them used to be one. `panelState` is what tells
 * them apart and it has its own unit tests; what is asserted here is that the
 * page draws the right screen for each — which is the half that was wrong in
 * production.
 */
describe("the summary's opening paragraph", () => {
  it("leads with it, even when the summary has sections", () => {
    /*
     * `18-meeting-brief.html` opens with one paragraph set larger than the
     * rest. `shortSummary` is that paragraph, and it was rendered only when
     * there were NO sections -- so the richer the summary got, the more
     * certain it was to lose its opening.
     */
    summary = {
      ...summary!,
      shortSummary: "The date holds for some accounts and moves for others.",
      sections: [
        { key: "a", title: "What was decided", kind: "prose", text: "Beta ships on the twelfth.", bullets: [], groups: [] },
      ],
    };
    render(<MeetingDetailPage />);

    const paragraph = screen.getByText(
      "The date holds for some accounts and moves for others.",
    );
    const heading = screen.getByText("What was decided");
    // Before the first section, which is where a lead is a lead.
    expect(paragraph.compareDocumentPosition(heading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("manufactures nothing when there is no lead to show", () => {
    // An empty field means the document starts at its first section, not that
    // a paragraph gets assembled out of the sections to fill the space.
    summary = {
      ...summary!,
      shortSummary: "",
      sections: [
        { key: "a", title: "What was decided", kind: "prose", text: "Beta ships on the twelfth.", bullets: [], groups: [] },
      ],
    };
    render(<MeetingDetailPage />);

    expect(screen.getByText("What was decided")).toBeInTheDocument();
    expect(screen.queryByText(/^\s*$/, { selector: "p.v2-read" })).not.toBeInTheDocument();
  });
});

describe("the summary's opening paragraph, said twice", () => {
  it("renders it once when it is the first section word for word", () => {
    /*
     * REPORTED FROM A REAL MEETING. A short recording produces one section,
     * and the model writes the same sentences into `shortSummary` and into it
     * -- so the document opened with a paragraph and then repeated it verbatim
     * under a heading.
     */
    summary = {
      ...summary!,
      shortSummary: "  We agreed to ship on the\n  ninth.  ",
      sections: [
        {
          key: "overview",
          title: "Overview",
          kind: "prose",
          text: "We agreed to ship on the ninth.",
          bullets: [],
          groups: [],
        },
      ],
    };
    render(<MeetingDetailPage />);

    // Whitespace-insensitive, so the two renderings of one paragraph count as
    // one -- and the section keeps it, because the section has the heading.
    expect(screen.getAllByText("We agreed to ship on the ninth.")).toHaveLength(1);
    expect(screen.getByText("Overview")).toBeInTheDocument();
  });

  it("renders both when they differ at all", () => {
    /*
     * Exact only. Two summaries that merely overlap are two things somebody
     * may want to read, and a near-match rule would start hiding real content
     * the moment a model rephrased one of them.
     */
    summary = {
      ...summary!,
      shortSummary: "We agreed to ship on the ninth.",
      sections: [
        {
          key: "overview",
          title: "Overview",
          kind: "prose",
          text: "We agreed to ship on the ninth, with a caveat about staging.",
          bullets: [],
          groups: [],
        },
      ],
    };
    render(<MeetingDetailPage />);

    expect(screen.getByText("We agreed to ship on the ninth.")).toBeInTheDocument();
    expect(
      screen.getByText("We agreed to ship on the ninth, with a caveat about staging."),
    ).toBeInTheDocument();
  });

  it("compares only against the first section", () => {
    // The lead summarises the meeting; a later section repeating it is a
    // coincidence of a long document rather than the duplication being fixed.
    summary = {
      ...summary!,
      shortSummary: "We agreed to ship on the ninth.",
      sections: [
        { key: "a", title: "What was decided", kind: "prose", text: "Beta ships.", bullets: [], groups: [] },
        { key: "b", title: "Overview", kind: "prose", text: "We agreed to ship on the ninth.", bullets: [], groups: [] },
      ],
    };
    render(<MeetingDetailPage />);

    expect(screen.getAllByText("We agreed to ship on the ninth.")).toHaveLength(2);
  });
});

describe("the summary's states", () => {
  it("shows a skeleton before the first answer, not an absence", () => {
    summaryQuery = "loading";
    const { container } = render(<MeetingDetailPage />);

    expect(screen.queryByText("No summary available.")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("says the request failed rather than that there is no summary", () => {
    // THE screenshot: "No summary available." over a summary sitting in the
    // database, produced by a panel describing its own network.
    summaryQuery = "error";
    render(<MeetingDetailPage />);

    expect(screen.getByText("Couldn't load the summary")).toBeInTheDocument();
    expect(screen.queryByText("No summary available.")).not.toBeInTheDocument();
  });

  it("offers a retry on the failure, wired to refetch", async () => {
    summaryQuery = "error";
    render(<MeetingDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));

    expect(refetch).toHaveBeenCalled();
  });

  it("keeps a summary on screen when a refetch over it fails", () => {
    // Content beats any news about the request that fetched it. Blanking a
    // brief somebody is reading because a refresh they did not ask for failed
    // is strictly worse than showing it.
    summaryQuery = "stale-over-error";
    summary = aSummary({ shortSummary: "Still readable." });
    render(<MeetingDetailPage />);

    expect(screen.getByText("Still readable.")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load the summary")).not.toBeInTheDocument();
  });

  it("says a summary is being written rather than missing, while the meeting runs", () => {
    meeting = aMeeting({ status: "SUMMARIZING" });
    summary = undefined;
    render(<MeetingDetailPage />);

    // Twice: the stage strip above says it too, and they must agree.
    expect(screen.getAllByText(/Generating summary/).length).toBeGreaterThan(0);
    expect(screen.queryByText("No summary available.")).not.toBeInTheDocument();
  });

  it("says it is waiting for the transcript before there is one to read", () => {
    meeting = aMeeting({ status: "TRANSCRIBING" });
    summary = undefined;
    segments = [];
    render(<MeetingDetailPage />);

    expect(screen.getByText(/waiting for the transcript/)).toBeInTheDocument();
  });

  it("says there is none only once the server has proved it", () => {
    // The one state in which "No summary available." is a true sentence, and
    // it is reached from a settled 404 rather than from `!data` -- which is
    // also what a 500 looks like.
    summary = undefined;
    summaryQuery = "absent";
    render(<MeetingDetailPage />);

    expect(screen.getByText("No summary available.")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load the summary")).not.toBeInTheDocument();
  });

  it("draws a blank summary body as the document it is, not as an absence", () => {
    // A 200 with every field empty is not something the backend produces today
    // -- absence is a 404 -- but a row written from a failed model call could
    // be. Content beats everything, so the brief renders empty rather than
    // claiming there is none: saying "No summary available." over a row that
    // exists is the same class of lie as saying it over a full one.
    summary = aSummary({ shortSummary: "", detailedSummary: "", keyPoints: [], sections: [] });
    render(<MeetingDetailPage />);

    expect(screen.queryByText("No summary available.")).not.toBeInTheDocument();
  });
});

/**
 * Rewriting the brief.
 *
 * <p>Two entry points, and they must not disagree: the template picker on the
 * mode row, and the "the transcript changed" notice inside the document. Both
 * spend a model call, so both answer to the allowance.
 */
describe("rewriting the summary", () => {
  it("offers the template only once there is a summary to rewrite", async () => {
    /*
     * IN THE OVERFLOW MENU, not on the mode row.
     *
     * <p>`18-meeting-brief.png` has two modes, Ask and an overflow on that row
     * and nothing else; a permanent `Template: General` beside the tabs read as
     * a third peer of Summary and Transcript. It is a setting on the document,
     * changed rarely, which is what a menu is for. Same query, same mutation.
     */
    templates = [
      { slug: "general", name: "General" },
      { slug: "standup", name: "Standup" },
    ];
    /*
     * WIDE, so the templates are behind one row. The narrow shape is the next
     * test — see `wide()` and the note on `useRoomToTheSide`.
     */
    wide(true);
    const { unmount } = render(<MeetingDetailPage />);
    await userEvent.click(screen.getByLabelText("More actions"));

    /*
     * ONE ROW, AND THE NAMES BEHIND IT.
     *
     * <p>Eight templates inline were more than half the menu and pushed
     * Reprocess and Delete off the bottom of a laptop window. The row says
     * which one is in use so that closing the submenu does not lose it.
     */
    const trigger = screen.getByRole("menuitem", { name: /Templates/ });
    expect(trigger).toHaveTextContent("General");
    expect(screen.queryByRole("menuitem", { name: /Standup/ })).not.toBeInTheDocument();

    // And they are all there once it is asked for.
    await userEvent.click(trigger);
    expect(await screen.findByText("Summary template")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Standup/ })).toBeInTheDocument();
    unmount();

    // A template over a summary that does not exist yet is a control that
    // cannot do anything.
    summary = undefined;
    meeting = aMeeting({ status: "SUMMARIZING" });
    render(<MeetingDetailPage />);
    expect(screen.queryByRole("menuitem", { name: /Templates/ })).not.toBeInTheDocument();
  });

  it("puts the templates in the menu where there is no room beside it", async () => {
    /*
     * MEASURED AT 390. A submenu opens to the side, and on a phone there is no
     * side: the menu is 246px wide against the document's right edge, so a
     * 160px panel needs either 517px to its right or a negative x to its left.
     * Radix flips it left and does not clamp the main axis, so the names were
     * drawn half off the screen — "neral", "tailed", "ecutive".
     *
     * <p>So below `sm` they are rows in the menu again, which is only
     * reasonable because the menu now scrolls.
     */
    templates = [
      { slug: "general", name: "General" },
      { slug: "standup", name: "Standup" },
    ];
    wide(false);
    render(<MeetingDetailPage />);

    await userEvent.click(screen.getByLabelText("More actions"));

    expect(screen.queryByRole("menuitem", { name: /Templates/ })).not.toBeInTheDocument();
    expect(screen.getByText("Summary template")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Standup/ })).toBeInTheDocument();
  });

  it("does not offer it over a transcript, which it cannot change", async () => {
    templates = [{ slug: "general", name: "General" }];
    render(<MeetingDetailPage />);

    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));
    await userEvent.click(screen.getByLabelText("More actions"));

    // The menu carries what the open mode brought with it, and a template item
    // over a transcript would do nothing to what is on screen.
    expect(screen.queryByText("Summary template")).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Find in transcript/ })).toBeInTheDocument();
  });

  it("says the transcript changed under a stale summary, and offers the rewrite", () => {
    // Not rewritten automatically — that would spend a model call on every typo
    // fix, and on each of the next nineteen — so the choice is offered rather
    // than made.
    summary = aSummary({ stale: true, sections: [aSection({ text: "x" })] });
    render(<MeetingDetailPage />);

    expect(screen.getByText(/transcript changed after this summary/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rewrite it/ })).toBeInTheDocument();
  });

  it("says nothing about staleness when a summary is fresh", () => {
    summary = aSummary({ stale: false, sections: [aSection({ text: "x" })] });
    render(<MeetingDetailPage />);

    expect(screen.queryByText(/transcript changed/)).not.toBeInTheDocument();
  });
});

/**
 * The transcript — the highest-risk surface in the redesign.
 *
 * <h2>What is asserted here, and what is not</h2>
 *
 * <p>`SelectionMenu`, `TurnActions`, `SpeakerEditor`, `ReassignSpeakerDialog`,
 * `TranscriptEditor`, `TranslatedTranscript` and `MomentsPanel` each have their
 * own test file, and they are mocked out above. What none of those can catch is
 * the page failing to *mount* one of them, mounting it in the wrong reading
 * mode, or severing the wires between them: the `data-seg` and `data-speaker`
 * attributes a selection is recovered from, the per-word seek, the
 * active-utterance tint that follows the audio.
 *
 * <p>Those wires are the whole reason this phase was risky. A transcript that
 * renders beautifully and no longer plays from the word you clicked is a
 * regression no component test would see, because every component involved is
 * still perfect on its own.
 */
describe("the transcript", () => {
  /** Get to the transcript, which is not the mode the page opens in. */
  async function readTranscript() {
    const view = render(<MeetingDetailPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));
    return view;
  }

  it("draws a turn with its speaker, its timecode and its words", async () => {
    segments = [aSegment({ speaker: "Priya", text: "We agreed to ship on the ninth.", start: 754, end: 760 })];
    await readTranscript();

    /*
     * Once. The talk-time roll-call used to name every speaker again above the
     * first turn, which is part of the 350px of utility that sat before the
     * document; it is behind the Speakers disclosure now, so the name appears
     * where it belongs and nowhere else.
     */
    expect(screen.getAllByText("Priya")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Play from 12:34" })).toBeInTheDocument();
    expect(screen.getByText("agreed")).toBeInTheDocument();
  });

  it("gives every word its own seek target, not just the playing one", async () => {
    // Any word in the transcript can be clicked to play from it. The memo that
    // keeps inactive utterances from re-rendering per frame is what makes that
    // affordable, and it is easy to lose while restyling the span it hangs on.
    segments = [aSegment({ text: "We agreed to ship." })];
    await readTranscript();

    const word = screen.getByText("agreed");
    expect(word).toHaveAttribute("data-word");
    expect(word).toHaveAttribute("data-start");
    expect(word).toHaveAttribute("role", "button");
  });

  it("keeps the attributes a selection is recovered from", async () => {
    // `readSelection` walks up from the selection with `closest("[data-seg]")`
    // to find which utterance and which speaker a passage belongs to. Drop
    // either attribute and highlighting, quoting, noting and "ask about this"
    // all stop working at once — silently, since the menu still opens.
    segments = [aSegment({ id: "seg_9", speaker: "Priya" })];
    const { container } = await readTranscript();

    const utterance = container.querySelector('[data-seg="seg_9"]');
    expect(utterance).not.toBeNull();
    expect(utterance).toHaveAttribute("data-speaker", "Priya");
  });

  it("groups consecutive utterances by one speaker into a single turn", async () => {
    // Diarization emits an utterance per pause, so a minute of one person
    // arrives as several segments. One row each reads as a stack of fragments
    // with the same name repeated down the page.
    segments = [
      aSegment({ id: "a", speaker: "Priya", text: "First part.", start: 0, end: 3 }),
      aSegment({ id: "b", speaker: "Priya", text: "Second part.", start: 3, end: 6 }),
    ];
    await readTranscript();

    /*
     * ONE NAME, TWO TIMECODES.
     *
     * <p>The grouping is what puts the speaker's name on the page once; each
     * utterance inside the turn keeps its own timecode in the gutter, which is
     * how `19-meeting-transcript.png` draws it and how the editor always drew
     * it. Two names here would mean the grouping did not happen.
     */
    expect(screen.getAllByText("Priya")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Play from/ })).toHaveLength(2);
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });

  it("still seeks each utterance separately inside that turn", async () => {
    segments = [
      aSegment({ id: "a", speaker: "Priya", text: "First.", start: 0, end: 3 }),
      aSegment({ id: "b", speaker: "Priya", text: "Second.", start: 30, end: 33 }),
    ];
    const { container } = await readTranscript();

    // Two utterances under one name; nothing was merged away.
    expect(container.querySelectorAll("[data-seg]")).toHaveLength(2);
  });

  it("mounts the selection menu, which every marking gesture goes through", async () => {
    await readTranscript();

    expect(screen.getByTestId("selection-menu")).toBeInTheDocument();
  });

  it("mounts the action-item composer a selection opens", async () => {
    await readTranscript();

    expect(screen.getByTestId("action-item-dialog")).toBeInTheDocument();
  });

  it("mounts no note composer, because adding a note is withdrawn", async () => {
    /*
     * Both ways in went together -- the selection menu's `Add note` and the
     * turn row's `Add a note here` -- because they were one dialog writing one
     * kind of moment. The dialog itself is gone from
     * `components/moment-composer`, so there is nothing left to mount.
     *
     * <p>Notes already written are unaffected; see the block on passage notes.
     */
    await readTranscript();

    expect(screen.queryByTestId("note-dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Add note" })).not.toBeInTheDocument();
  });

  it("mounts the speaker correction dialog", async () => {
    await readTranscript();

    expect(screen.getByTestId("reassign-dialog")).toBeInTheDocument();
  });

  it("offers a per-turn toolbar for reactions, notes, copying and links", async () => {
    await readTranscript();

    expect(screen.getByTestId("turn-actions")).toBeInTheDocument();
  });

  /**
   * Open one of the three transcript tools.
   *
   * <p>They were three stacked blocks above the first spoken line, then a row
   * of three toggles, and now they are items in the meeting's one overflow
   * menu -- because `19-meeting-transcript.png` has neither: the first turn
   * begins under the mode row. Each item opens the control that was already
   * there, so the tests below open it and then assert what they always did.
   */
  async function openTool(name: RegExp) {
    await userEvent.click(screen.getByLabelText("More actions"));
    await userEvent.click(screen.getByRole("menuitem", { name }));
  }

  it("draws no utility row at all until something is asked for", async () => {
    /*
     * THE COMPOSITION THIS EXISTS FOR. A full-width find box with two lines of
     * help under it, a bordered marks strip and a roll-call with a bar per
     * speaker — and then, briefly, a row of three toggles — all above the first
     * spoken line, on the screen the V2 study says the design lives or dies on.
     * `19-meeting-transcript.png` has none of it.
     */
    segments = [
      aSegment({ id: "a", speaker: "Priya", start: 0, end: 60 }),
      aSegment({ id: "b", speaker: "Dev", start: 60, end: 90 }),
    ];
    await readTranscript();

    expect(screen.queryByLabelText("Find in transcript")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit speakers" })).not.toBeInTheDocument();
    // And no toggles standing in for them either.
    expect(screen.queryByRole("button", { name: /^Find$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Speakers/ })).not.toBeInTheDocument();
  });

  it("offers all four tools in the overflow menu", async () => {
    segments = [
      aSegment({ id: "a", speaker: "Priya", start: 0, end: 60 }),
      aSegment({ id: "b", speaker: "Dev", start: 60, end: 90 }),
    ];
    await readTranscript();
    await userEvent.click(screen.getByLabelText("More actions"));

    for (const item of [/Find in transcript/, /Edit speakers/, /Edit transcript/]) {
      expect(screen.getByRole("menuitem", { name: item })).toBeInTheDocument();
    }
  });

  it("opens one tool at a time, so the block cannot grow back", async () => {
    segments = [
      aSegment({ id: "a", speaker: "Priya", start: 0, end: 60 }),
      aSegment({ id: "b", speaker: "Dev", start: 60, end: 90 }),
    ];
    await readTranscript();

    await openTool(/Find in transcript/);
    expect(screen.getByLabelText("Find in transcript")).toBeInTheDocument();

    await openTool(/Edit speakers/);
    expect(screen.queryByLabelText("Find in transcript")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit speakers" })).toBeInTheDocument();
  });

  it("closes a tool and leaves the transcript alone", async () => {
    segments = [aSegment({ id: "a", text: "We agreed to ship." })];
    await readTranscript();

    await openTool(/Find in transcript/);
    await userEvent.click(screen.getByRole("button", { name: /Close find in transcript/i }));

    expect(screen.queryByLabelText("Find in transcript")).not.toBeInTheDocument();
    expect(screen.getByText("agreed")).toBeInTheDocument();
  });

  it("offers Find in transcript, and says how many matched", async () => {
    segments = [
      aSegment({ id: "a", text: "We agreed to ship." }),
      aSegment({ id: "b", speaker: "Dev", text: "Nothing about that here." }),
    ];
    await readTranscript();

    await openTool(/Find in transcript/);
    await userEvent.type(screen.getByLabelText("Find in transcript"), "agreed");

    expect(screen.getByText(/1 match in 1 turn/)).toBeInTheDocument();
  });

  it("says a search matched nothing rather than emptying the page", async () => {
    // Without this the panel just empties, which reads as a transcript that
    // failed to load.
    await readTranscript();

    await openTool(/Find in transcript/);
    await userEvent.type(screen.getByLabelText("Find in transcript"), "zzzz");

    expect(screen.getByText(/Nothing in this transcript matches/)).toBeInTheDocument();
  });

  it("shows talk time and the way into speaker editing", async () => {
    segments = [
      aSegment({ id: "a", speaker: "Priya", start: 0, end: 60 }),
      aSegment({ id: "b", speaker: "Dev", start: 60, end: 90 }),
    ];
    await readTranscript();

    // Behind the Speakers item, with the same real stats and the same editor
    // behind them.
    await openTool(/Edit speakers/);
    expect(screen.getByText(/Priya \(\d+%\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit speakers" }));
    expect(screen.getByTestId("speaker-editor")).toBeInTheDocument();
  });

  it("offers a per-line correction without leaving the reading mode", async () => {
    // The line editor replaces one line so the rest of the turn stays readable
    // and still seekable while a correction is being typed. Distinct from the
    // whole-transcript editor, which is a mode.
    segments = [aSegment({ id: "seg_9", text: "We agreed." })];
    await readTranscript();

    await userEvent.click(screen.getByRole("button", { name: "Correct this line" }));

    // Not `getByRole("textbox")`: the find box is one too, and the whole point
    // of the line editor is that it opens *inside* a transcript that is still
    // searchable and still seekable around it.
    const editors = screen.getAllByRole("textbox").filter((el) => el.tagName === "TEXTAREA");
    expect(editors).toHaveLength(1);
    expect(editors[0]).toHaveValue("We agreed.");
  });

  it("hands the whole transcript to the editor when that mode is chosen", async () => {
    // From the overflow menu now: the reference's mode row carries two modes,
    // Ask and the overflow, and nothing else.
    await readTranscript();

    await openTool(/Edit transcript/);

    expect(screen.getByTestId("transcript-editor")).toBeInTheDocument();
  });
});

/**
 * The transcript when it is not simply there.
 *
 * <p>The same rule as the brief, and the same production screenshot behind it:
 * "Transcript unavailable." printed over a transcript that was in the database
 * the whole time.
 */
describe("correcting the transcript", () => {
  it("says which mode it is in, rather than leaving it to be inferred", async () => {
    /*
     * `21-transcript-editing.html` heads the document "Correcting the
     * transcript" with one Done beside it. This row carried two unlabelled
     * buttons and nothing naming the state, so the only thing telling a reader
     * the transcript had become editable was that the paragraphs had.
     */
    render(<MeetingDetailPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));
    await userEvent.click(screen.getByLabelText("More actions"));
    await userEvent.click(screen.getByRole("menuitem", { name: /Edit transcript/ }));

    expect(screen.getByRole("status")).toHaveTextContent("Correcting the transcript");
  });

  it("keeps both ways out of it", async () => {
    // Done keeps what was typed; Cancel abandons it. The confirmation behind
    // either is the editor's and is unchanged.
    render(<MeetingDetailPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));
    await userEvent.click(screen.getByLabelText("More actions"));
    await userEvent.click(screen.getByRole("menuitem", { name: /Edit transcript/ }));

    expect(screen.getByRole("button", { name: /Done/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("says nothing about a mode nobody is in", () => {
    render(<MeetingDetailPage />);

    expect(screen.queryByText("Correcting the transcript")).not.toBeInTheDocument();
  });
});

describe("the transcript's states", () => {
  async function readTranscript() {
    const view = render(<MeetingDetailPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));
    return view;
  }

  it("says the request failed rather than that there is no transcript", async () => {
    transcriptQuery = "error";
    await readTranscript();

    expect(screen.getByText("Couldn't load the transcript")).toBeInTheDocument();
    expect(screen.queryByText("Transcript unavailable.")).not.toBeInTheDocument();
  });

  it("offers a retry on the failure, wired to refetch", async () => {
    transcriptQuery = "error";
    await readTranscript();

    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));

    expect(refetch).toHaveBeenCalled();
  });

  it("says a transcript is being prepared rather than missing, while the meeting runs", async () => {
    // An empty transcript looks like a recording that captured nothing, which
    // is the one conclusion that must not be drawn from a meeting still being
    // transcribed.
    meeting = aMeeting({ status: "TRANSCRIBING" });
    segments = [];
    transcriptQuery = "absent";
    await readTranscript();

    expect(screen.queryByText("Transcript unavailable.")).not.toBeInTheDocument();
  });

  it("renders a document's body, which has no utterances at all", async () => {
    // A PDF import and a transcript from before segments existed are both real
    // transcripts, and counting only segments would call them missing.
    meeting = aMeeting({ sourceType: "DOCUMENT", audioUrl: null });
    segments = [];
    transcriptText = "The whole document, as one body of text.";
    await readTranscript();

    expect(screen.getByText(/The whole document/)).toBeInTheDocument();
    expect(screen.queryByText("Transcript unavailable.")).not.toBeInTheDocument();
  });
});

/**
 * What the meeting asks of you, and what it decided.
 *
 * <h2>Three models, and they stay three models</h2>
 *
 * <p>Action items are action items. Per-meeting decisions are decisions.
 * Per-meeting risks are risks. The V2 concept had a Commitment Ledger, a
 * Promise Journey and Decision Drift on top of them — none of which exists:
 * `V14` and `V15` dropped `meeting_decisions`, `decision_links`,
 * `decision_vectors`, `commitments` and `commitment_evidence`. Nothing here
 * introduces a lifecycle, a history or a cross-meeting relationship, and the
 * assertions below are partly here to make that hard to do by accident.
 *
 * <p>`ActionItemRow` and `InsightsPanel` have their own files for the row-level
 * behaviour — ticking off, editing, deleting, comments. What only the page can
 * be wrong about is which of them is mounted, in which reading mode, in what
 * order, and whether a state that is not "ready" is allowed to make a claim
 * about somebody's commitments.
 */
describe("action items on the meeting", () => {
  it("puts them under the brief, in the reading mode where the brief is", () => {
    // What a meeting asks of you is the part with consequences. It used to sit
    // third, below two lists that are commentary on what happened.
    actionItems = [anActionItem()];
    render(<MeetingDetailPage />);

    // The document's, at h3; the margin's index of the same list is h2.
    expect(screen.getByRole("heading", { name: /Action items/, level: 3 })).toBeInTheDocument();
    expect(screen.getByText("Send the contract")).toBeInTheDocument();
  });

  it("counts what is still open against the whole list", () => {
    actionItems = [
      anActionItem({ id: "a", status: "OPEN" }),
      anActionItem({ id: "b", title: "Book the room", status: "DONE" }),
    ];
    render(<MeetingDetailPage />);

    expect(screen.getByText("1 of 2 still open.")).toBeInTheDocument();
  });

  it("says so when everything is done", () => {
    actionItems = [anActionItem({ status: "DONE" })];
    render(<MeetingDetailPage />);

    expect(screen.getByText("Everything here is done.")).toBeInTheDocument();
  });

  it("never congratulates the reader on work it has not seen", () => {
    // "Everything here is done." is a claim about what the meeting asked of
    // you. Derived from `(actions.data ?? []).filter(...)`, a failed request
    // made it while having seen nothing at all.
    actionsQuery = "error";
    render(<MeetingDetailPage />);

    expect(screen.queryByText("Everything here is done.")).not.toBeInTheDocument();
    expect(screen.queryByText(/still open/)).not.toBeInTheDocument();
    expect(screen.getByText("Couldn't load the action items")).toBeInTheDocument();
  });

  it("offers a retry on that failure, wired to refetch", async () => {
    actionsQuery = "error";
    render(<MeetingDetailPage />);

    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));

    expect(refetch).toHaveBeenCalled();
  });

  it("says none were extracted only from a settled, empty list", () => {
    actionItems = [];
    render(<MeetingDetailPage />);

    expect(screen.getByText("No action items were extracted.")).toBeInTheDocument();
  });

  it("says they are still being extracted while the meeting runs", () => {
    // Not "none were extracted", which is the same sentence meaning the
    // opposite thing about a meeting that has not finished.
    meeting = aMeeting({ status: "EXTRACTING" });
    actionItems = [];
    render(<MeetingDetailPage />);

    expect(screen.queryByText("No action items were extracted.")).not.toBeInTheDocument();
  });

  it("offers a way to add one that was never said aloud", () => {
    // A commitment made in the room and never spoken is exactly the one the
    // extractor cannot find, so this needs no transcript selection.
    render(<MeetingDetailPage />);

    expect(screen.getByTestId("new-action-item")).toBeInTheDocument();
  });

  it("plays the sentence here rather than opening the meeting again", () => {
    // There is a player on this page. `onOpenSource` is what tells the row to
    // seek instead of navigating to the meeting it is already on.
    actionItems = [anActionItem({ sourceStartSeconds: 754 })];
    render(<MeetingDetailPage />);

    expect(screen.getByTestId("action-row-mtg_a")).toHaveAttribute("data-seekable", "true");
  });

  it("does not invent a source link when the sentence could not be placed", () => {
    // A link that seeks to the wrong moment plays somebody saying something
    // else, and reads as the evidence being fabricated.
    actionItems = [anActionItem({ sourceStartSeconds: null })];
    render(<MeetingDetailPage />);

    expect(screen.getByTestId("action-row-mtg_a")).toHaveAttribute("data-anchored", "false");
  });
});

describe("decisions and risks on the meeting", () => {
  it("are read below the brief, not above it", () => {
    // These rows are read OUT of the brief. Putting them first would suggest
    // they were the source rather than the reading.
    actionItems = [anActionItem()];
    render(<MeetingDetailPage />);

    // `level: 3` -- the margin's index of the action items carries the same
    // name at h2. See the note on `MeetingMargin`.
    const brief = screen.getByRole("heading", { name: /Action items/, level: 3 });
    const insights = screen.getByTestId("insights-panel");
    expect(brief.compareDocumentPosition(insights)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("are mounted on the summary, and only there", async () => {
    render(<MeetingDetailPage />);
    expect(screen.getByTestId("insights-panel")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Transcript" }));

    // A decision list under a transcript is commentary parked over the source.
    expect(screen.queryByTestId("insights-panel")).not.toBeInTheDocument();
  });

  it("introduces no lifecycle, history or drift anywhere on the page", () => {
    // The V2 concept's cross-meeting intelligence has no schema behind it. This
    // is a guard rather than an assertion about markup: any of these words
    // appearing on this page means something was rendered from data that does
    // not exist.
    actionItems = [anActionItem()];
    const { container } = render(<MeetingDetailPage />);

    for (const forbidden of [
      /commitment/i,
      /promise/i,
      /decision drift/i,
      /decision history/i,
      /slipped/i,
      /reversed/i,
      /since last meeting/i,
    ]) {
      expect(container.textContent ?? "").not.toMatch(forbidden);
    }
  });
});
