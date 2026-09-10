import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatConversation, ChatMessage, MeetingResponse, Project } from "@/lib/types";

/**
 * A folder's page: what is filed here.
 *
 * <p>The list is the whole page. The folder chat that used to sit under it was
 * removed on request, and the folder's own actions moved to the top bar, so
 * several of the groups below assert absence rather than behaviour — an absence
 * nobody wrote down is indistinguishable from a regression six months later.
 *
 * <h2>And now two more absences, from the V2 reference itself</h2>
 *
 * <p>`design-demo/final/17-folder.html` offers "Ask this folder" in the
 * masthead and a margin headed "Tracked in this folder": a topic in four
 * instalments, a risk open thirteen days, a promise due tomorrow. The first was
 * deliberately removed from this page and a visual migration is not permission
 * to restore it; the second describes cross-meeting state that does not exist —
 * the migrations dropped `meeting_decisions`, `decision_links`, `commitments`
 * and `commitment_evidence`. Only the whitespace and the proportions were taken
 * from that file.
 */
const { askProject, chatQuery, deleteProject, updateProject, assign, push } = vi.hoisted(() => ({
  askProject: vi.fn(),
  chatQuery: vi.fn(),
  deleteProject: vi.fn(),
  updateProject: vi.fn(),
  assign: vi.fn(),
  push: vi.fn(),
}));

let project: Project | undefined;
let meetings: MeetingResponse[];
let messages: ChatMessage[];
let conversations: ChatConversation[];

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "prj_1" }),
  useRouter: () => ({ push }),
}));

/** What is left of the free allowance. Full unless a test spends it. */
const usage = vi.hoisted(() => ({
  data: { minutesUsed: 0, minutesLimit: 100, importsUsed: 0, importsLimit: 3 },
}));

vi.mock("@/lib/api", () => ({
  /*
   * The allowance. The empty panel asks what is left before it offers to
   * record anything -- see `spentEmptyNote`. Full, because nothing in this file
   * is about the allowance and every test here wants the ordinary panel.
   */
  useGetUsageQuery: () => ({
    data: usage.data,
    isLoading: false,
    isFetching: false,
    isError: false,
    isSuccess: true,
    isUninitialized: false,
    refetch: () => {},
  }),
  useGetProjectQuery: () => ({ data: project, isLoading: false }),
  // The per-meeting poll a row runs under its socket subscription, now that the
  // rows are the same component Now and Library use.
  useGetMeetingQuery: () => ({ data: undefined }),
  useGetProjectMeetingsQuery: () => ({ data: meetings }),
  useGetProjectChatQuery: (arg: unknown) => {
    chatQuery(arg);
    return { data: messages, isLoading: false, isError: false };
  },
  useGetProjectConversationsQuery: () => ({ data: conversations }),
  useAskProjectChatMutation: () => [
    (arg: unknown) => {
      askProject(arg);
      return { unwrap: () => Promise.resolve({ conversationId: "cnv_1" }) };
    },
    { isLoading: false },
  ],
  useCreateProjectConversationMutation: () => [
    () => ({ unwrap: () => Promise.resolve({ id: "cnv_2" }) }),
    { isLoading: false },
  ],
  useClearProjectChatMutation: () => [
    () => ({ unwrap: () => Promise.resolve() }),
    { isLoading: false },
  ],
  useUpdateProjectMutation: () => [
    (arg: unknown) => {
      updateProject(arg);
      return { unwrap: () => Promise.resolve({}) };
    },
    { isLoading: false },
  ],
  useCreateProjectMutation: () => [
    () => ({ unwrap: () => Promise.resolve({}) }),
    { isLoading: false },
  ],
  useAssignProjectMutation: () => [
    (arg: unknown) => {
      assign(arg);
      return { unwrap: () => Promise.resolve({}) };
    },
    { isLoading: false },
  ],
  useDeleteProjectMutation: () => [
    (id: string) => {
      deleteProject(id);
      return { unwrap: () => Promise.resolve({ unfiledMeetings: 3 }) };
    },
    { isLoading: false },
  ],
  useRenameConversationMutation: () => [vi.fn(), {}],
  useDeleteConversationMutation: () => [vi.fn(), {}],
  useDeleteChatExchangeMutation: () => [vi.fn(), { isLoading: false }],
}));

const { toast } = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("sonner", () => ({ toast }));

import ProjectPage from "@/app/(app)/folder/[id]/page";

beforeEach(() => {
  vi.clearAllMocks();
  // A module-level control, so without this the last describe's spent state
  // would decide whatever ran after it.
  usage.data = { minutesUsed: 0, minutesLimit: 100, importsUsed: 0, importsLimit: 3 };
  project = {
    id: "prj_1",
    name: "Client ABC",
    description: "The ABC engagement",
    color: "",
    favorite: false,
    meetingCount: 3,
    createdAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-08-01T09:00:00Z",
  };
  meetings = [
    {
      id: "mtg_1",
      title: "Discovery Call",
      status: "READY",
      tags: [],
      createdAt: "2026-08-01T10:00:00Z",
      durationSeconds: 1800,
    },
  ];
  messages = [];
  conversations = [];
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("ProjectPage", () => {
  it("lists what is filed here, under the folder's name", () => {
    render(<ProjectPage />);

    const list = screen.getByRole("region", { name: "Conversations in Client ABC" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Client ABC");
    expect(within(list).getByText("Discovery Call")).toBeInTheDocument();
    expect(
      within(list).getByRole("link", { name: /Discovery Call/ }),
    ).toHaveAttribute("href", "/meetings/mtg_1");
  });

  it("reads as a document rather than a table", () => {
    /*
     * The column header was the single word "Conversation" over one column.
     * `17-folder.html` groups by date instead, which is what people navigate a
     * folder by.
     */
    render(<ProjectPage />);

    const list = screen.getByRole("region", { name: "Conversations in Client ABC" });
    expect(within(list).queryByText("Conversation")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    // A date heading, from the real `createdAt` and the shared day grouping.
    expect(within(list).getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(0);
  });

  it("says a meeting's state only when it has one worth saying", () => {
    /*
     * DELIBERATE CHANGE, and the reason is one row rather than two. The old row
     * carried a "Notes ready" glyph on every finished meeting; the V2 row —
     * already shipped on Now — puts state in the metadata line and treats ready
     * as the absence of state, so a processing row is exactly as tall as a
     * finished one. Marking ready here and not on Now is how a status pill ends
     * up on one screen and not the other.
     */
    meetings = [
      { ...meetings[0], id: "mtg_2", title: "Still going", status: "TRANSCRIBING" },
      { ...meetings[0], id: "mtg_3", title: "Broke", status: "FAILED", errorMessage: "No audio track" },
      meetings[0],
    ];
    render(<ProjectPage />);

    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByText("No audio track")).toBeInTheDocument();
    // And nothing invented for the one that is simply done.
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("says where it sits, and offers the way back up", () => {
    render(<ProjectPage />);

    expect(screen.getByText("Library · folder")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Folders/ })).toHaveAttribute("href", "/folders");
  });

  it("states the facts the server actually sent", () => {
    /*
     * The count and when it was last updated. Not the reference's "6h 12m":
     * `GET /projects/:id` returns no duration and the meetings come back
     * unpaged, so a total would be a sum of the response presented as the
     * folder's. Not "4 tracked" either.
     */
    render(<ProjectPage />);

    // "conversations", which is the product's word for them; "meetings" is
    // the one in the DTO and it had leaked out onto the page.
    expect(screen.getByText("3 conversations")).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/\d+h\s*\d+m/);
    expect(document.body.textContent ?? "").not.toMatch(/tracked/i);
  });

  it("shows the folder's own description, and no invented prose", () => {
    render(<ProjectPage />);

    expect(screen.getByText("The ABC engagement")).toBeInTheDocument();
  });

  it("says nothing is here yet, centred, with the two ways to change that", () => {
    meetings = [];
    const { container } = render(<ProjectPage />);

    /*
     * It was two left-aligned paragraphs where the list would be. The approved
     * design centres it with a glyph over it and the two ways to put something
     * in a folder underneath -- and names the folder, because "conversations
     * you add will appear here" is true of every folder and says nothing about
     * this one.
     *
     * <p>Neither button files INTO the folder and the copy does not claim they
     * do: `recordHref` carries a return path and no folder, and /upload picks
     * one in its own form. So the record link comes back here afterwards.
     */
    expect(screen.getByRole("heading", { name: "Nothing here yet" })).toBeInTheDocument();
    // Read off the paragraph rather than matched as one text node: the copy
    // interpolates the folder's name, so React renders it as three.
    const heading = screen.getByRole("heading", { name: "Nothing here yet" });
    expect(heading.nextElementSibling?.textContent).toContain(
      "Conversations you add to Client ABC will appear here.",
    );
    expect(screen.getByRole("link", { name: "Record a conversation" })).toHaveAttribute(
      "href",
      "/record?r=%2Ffolder%2Fprj_1",
    );
    expect(screen.getByRole("link", { name: "Import a recording" })).toHaveAttribute(
      "href",
      "/upload",
    );
    expect(container.querySelectorAll(".border-dashed")).toHaveLength(0);
  });

  it("stars the folder, which is what sorts it to the top of the rail", async () => {
    render(<ProjectPage />);

    await userEvent.click(screen.getByRole("button", { name: "Star this folder" }));

    expect(updateProject).toHaveBeenCalledWith({ id: "prj_1", body: { favorite: true } });
  });

  it("takes a meeting out of the folder without deleting it", async () => {
    render(<ProjectPage />);

    await userEvent.click(screen.getByRole("button", { name: "Actions for Discovery Call" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Remove from folder/ }));

    // Deleting a recording lives on the meeting page, behind the erase menu,
    // where what is about to go can be named one grain at a time.
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith({ meetingId: "mtg_1", projectId: null }),
    );
  });

  it("carries no chat any more", () => {
    render(<ProjectPage />);

    // "Ask Reverie about this folder" was removed on request. The server side
    // of it is untouched, so this asserts the removal was a decision rather
    // than something that fell out of a refactor.
    expect(screen.queryByText(/Ask Reverie/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Ask about Client ABC/)).not.toBeInTheDocument();
  });

  it("did not get its chat back from the V2 reference", () => {
    /*
     * `17-folder.html` puts "Ask this folder" in the masthead. A visual
     * migration is not permission to restore a product decision, and an
     * endpoint existing is not the same as a feature existing.
     */
    render(<ProjectPage />);

    expect(screen.queryByText(/Ask this folder/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ask/i })).not.toBeInTheDocument();
  });

  it("grew no memory margin", () => {
    /*
     * The reference's margin is tracked topics, an ageing risk and a promise
     * due tomorrow. None of that data exists, and reserving 400px for it would
     * be building the frame of a feature and calling the redesign done.
     */
    render(<ProjectPage />);

    const text = document.body.textContent ?? "";
    for (const invented of [
      /tracked in this folder/i,
      /instalment/i,
      /risk open/i,
      /promise due/i,
      /commitment/i,
      /open the thread/i,
      /\bMemory\b/,
    ]) {
      expect(text).not.toMatch(invented);
    }
  });

  it("does not ask the server for a folder chat it no longer shows", () => {
    render(<ProjectPage />);

    // The hook going unused is the difference between removing a feature and
    // hiding one that still costs a request on every visit.
    expect(chatQuery).not.toHaveBeenCalled();
    expect(askProject).not.toHaveBeenCalled();
  });

  it("carries the folder's own actions, as a list in the margin", async () => {
    /*
     * MOVED TWICE NOW, so it is worth saying where from and why.
     *
     * <p>The shell drew them, at the right-hand end of a full-width row --
     * about 340px clear of a centred 680px document, reading as application
     * chrome rather than as the folder's. So they came onto the title's line
     * as a `⋯`.
     *
     * <p>The approved design draws them as three rows under "Manage" in the
     * margin, which is a menu's worth of actions given the room to be read
     * rather than opened. The `⋯` is gone: two surfaces for one set of actions
     * is how one of them ends up out of date. Same component, same dialogs,
     * same confirmation -- `variant="list"`.
     *
     * <p>Still one set of them. The shell draws none, which
     * components/app-shell.test.tsx pins from the other side.
     */
    render(<ProjectPage />);

    expect(screen.queryByRole("button", { name: "Folder actions" })).not.toBeInTheDocument();

    const margin = screen.getByRole("complementary", { name: "About this folder" });
    for (const label of ["Search folder", "Rename folder", "Delete folder"]) {
      expect(margin).toContainElement(screen.getByRole("button", { name: label }));
    }
  });

  it("states what the folder holds, and never whether it is starred", () => {
    /*
     * The approved margin has a "Starred / No" row. It is the one reading here
     * not worth a row: the star beside the folder's name already says it and
     * is the control that changes it, so a second statement of the same bit is
     * a fact somebody has to reconcile with a toggle six inches away. Asked
     * for and removed.
     */
    render(<ProjectPage />);

    const margin = screen.getByRole("complementary", { name: "About this folder" });
    expect(margin).toHaveTextContent("Conversations");
    expect(margin).toHaveTextContent("Last updated");
    expect(margin).not.toHaveTextContent("Starred");
  });

  it("keeps the star on the title's line, which is the one control that stays", () => {
    /*
     * Structural rather than pixel-counting. The star is what "this is the
     * folder I am in this week" means -- starred folders sort to the top of
     * the Library margin and of the folders page -- so it belongs beside the
     * name it describes, on its line and before the facts.
     *
     * <p>The three that opened dialogs went to the margin; this one changes a
     * field on the thing the title names, and it reports its own state.
     */
    render(<ProjectPage />);

    const h1 = screen.getByRole("heading", { level: 1 });
    const star = screen.getByRole("button", { name: "Star this folder" });
    const meta = screen.getByText(/Updated/);

    expect(h1.compareDocumentPosition(star)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(star.compareDocumentPosition(meta)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(h1.parentElement).toContainElement(star);
  });

  it("renames the folder from there", async () => {
    render(<ProjectPage />);

    await userEvent.click(screen.getByRole("button", { name: "Rename folder" }));

    expect(await screen.findByRole("heading", { name: "Rename folder" })).toBeInTheDocument();
  });

  it("deletes it from there, promising the meetings survive first", async () => {
    render(<ProjectPage />);

    await userEvent.click(screen.getByRole("button", { name: "Delete folder" }));

    await waitFor(() => expect(deleteProject).toHaveBeenCalledWith("prj_1"));
    // The sentence people read at the moment they are deciding.
    expect(
      (window.confirm as unknown as { mock: { calls: string[][] } }).mock.calls[0][0],
    ).toMatch(/are kept/);
  });

  it("adds nothing folder-specific to the global band", () => {
    /*
     * The band is 48px of global chrome and the same shape on every screen.
     * This page draws no band — the shell does — so what is asserted here is
     * that the move did not smuggle a destination or a folder control into one:
     * see components/app-shell.test.tsx for the shell's half.
     */
    render(<ProjectPage />);

    for (const global of [/^Now$/, /^Ask Reverie$/, /^Record$/]) {
      expect(screen.queryByRole("link", { name: global })).not.toBeInTheDocument();
    }
  });

  it("says so when the folder is gone, and where its meetings went", () => {
    project = undefined;
    render(<ProjectPage />);

    expect(screen.getByText(/no longer exists/)).toBeInTheDocument();
    // The meetings survive a folder deletion. Saying so is the difference
    // between a dead end and a way on.
    expect(screen.getByRole("link", { name: /they are all in Library/ })).toHaveAttribute(
      "href",
      "/library",
    );
  });
});

describe("FOLDER — an empty folder with no minutes left", () => {
  /*
   * The third place the same wrong invitation was printed. Home and Library
   * were the two in the report; this one is one click away and had it too --
   * "Record, import, or organize a conversation into this folder", with a
   * Record button and an Import button, on an account that can do none of it.
   */
  beforeEach(() => {
    // The panel only appears for a folder with nothing in it.
    meetings = [];
    usage.data = { minutesUsed: 100, minutesLimit: 100, importsUsed: 3, importsLimit: 3 };
  });

  it("explains instead of inviting, and offers neither action", async () => {
    render(<ProjectPage />);

    expect(await screen.findByText("No minutes left")).toBeInTheDocument();
    expect(screen.getByText(/no minutes left to record or import with/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /record a conversation/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /import a recording/i })).toBeNull();
  });
});
