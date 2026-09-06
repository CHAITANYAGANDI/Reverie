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

vi.mock("@/lib/api", () => ({
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

    expect(screen.getByText("3 meetings")).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/\d+h\s*\d+m/);
    expect(document.body.textContent ?? "").not.toMatch(/tracked/i);
  });

  it("shows the folder's own description, and no invented prose", () => {
    render(<ProjectPage />);

    expect(screen.getByText("The ABC engagement")).toBeInTheDocument();
  });

  it("says nothing is filed here without a bordered box round it", () => {
    meetings = [];
    const { container } = render(<ProjectPage />);

    expect(screen.getByText("Nothing filed here yet")).toBeInTheDocument();
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

  it("keeps rename and delete out of the page body", () => {
    render(<ProjectPage />);

    // They moved to the top bar beside Record; see
    // components/folder-header-actions.test.tsx. Two menus for one set of
    // actions is the state this asserts against.
    expect(screen.queryByRole("button", { name: "Folder actions" })).not.toBeInTheDocument();
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
