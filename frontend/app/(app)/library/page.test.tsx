import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MeetingResponse, MeetingListQuery, Page, Project } from "@/lib/types";

/**
 * LIBRARY — every meeting, with the filing system in the margin.
 *
 * <h2>What these pin</h2>
 *
 * <p><b>It must ask for everything.</b> `unfiled=true` is gone from Now too — it
 * made that page's name a lie, since filing a meeting took it off a list called
 * Recent — so what separates the two pages is how much they show. The assertion
 * is on the request rather than on the rows: a Library that ever inherited that
 * flag would look completely right until somebody opened a folder and found
 * meetings the "everything" list had never shown them.
 *
 * <p><b>It must not read a failure as an empty archive.</b> The screen that says
 * you have nothing is the one a person with two hundred meetings should never
 * see, and `data?.content ?? []` is the single line that produces it.
 *
 * <p><b>The folders must not be a table above the archive.</b> That was the
 * shipped composition and the reason this page looked nothing like
 * `design-demo/final/14-library.html`: a heading, a New folder button, a
 * two-column sort header and either the folders or a centred empty state, all
 * of it above the list anybody opens Library for. They are a quiet margin now.
 *
 * <p><b>It must not grow filters or sections it cannot honour.</b> The reference
 * draws four filter chips and a "Kinds" section; `GET /meetings` supports the
 * dates and nothing else of theirs. Four convincing controls that narrow
 * nothing is worse than one that works.
 */
const query = vi.hoisted(() => ({ last: null as MeetingListQuery | null }));
const refetch = vi.hoisted(() => vi.fn());

let rows: MeetingResponse[];
let total: number | null;
/** Nothing usable is cached -- `data` is undefined, not an empty page. */
let noData: boolean;
let loading: boolean;
let errored: boolean;
/** What `GET /projects` answers with. `undefined` is "not yet". */
let folders: Project[] | undefined;
let foldersErrored: boolean;

function aPage(content: MeetingResponse[]): Page<MeetingResponse> {
  return {
    content,
    page: 0,
    size: 50,
    totalElements: total ?? content.length,
    totalPages: 1,
  };
}

/** An RTK Query result with every flag the page reads, kept mutually consistent. */
function result<T>(
  data: T | undefined,
  opts: { isLoading?: boolean; isFetching?: boolean; isError?: boolean } = {},
) {
  const isLoading = opts.isLoading ?? false;
  const isError = opts.isError ?? false;
  return {
    data,
    isLoading,
    isFetching: opts.isFetching ?? isLoading,
    isError,
    isSuccess: !isLoading && !isError && data !== undefined,
    isUninitialized: false,
    error: isError ? { status: 500, data: { message: "boom" } } : undefined,
    refetch,
  };
}

vi.mock("@/lib/api", () => ({
  // The per-meeting poll a processing row runs under its socket subscription.
  useGetMeetingQuery: () => ({ data: undefined }),
  useGetMeetingsQuery: (q: MeetingListQuery, options?: { skip?: boolean }) => {
    if (options?.skip) {
      return { ...result<Page<MeetingResponse>>(undefined), isUninitialized: true };
    }
    query.last = q;
    if (loading) return result<Page<MeetingResponse>>(undefined, { isLoading: true });
    return result(noData ? undefined : aPage(rows), { isError: errored });
  },
  /*
   * The margin is rendered for real. It is the structural half of this
   * migration — the folders moved out of the document and into the margin — and
   * a stub would let that pass while the page still drew a table.
   */
  useGetProjectsQuery: () => result(folders, { isError: foldersErrored }),
  // Reached through the dialog the margin keeps mounted for its empty state.
  useCreateProjectMutation: () => [
    () => ({ unwrap: () => Promise.resolve({}) }),
    { isLoading: false },
  ],
  useUpdateProjectMutation: () => [
    () => ({ unwrap: () => Promise.resolve({}) }),
    { isLoading: false },
  ],
}));

// Both the date window and anything else remembered per sign-in wait on this.
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ userId: "usr_1", sessionKey: "sess_1", isLoaded: true }),
}));

import LibraryPage from "@/app/(app)/library/page";

function aMeeting(overrides: Partial<MeetingResponse> = {}): MeetingResponse {
  return {
    id: "mtg_1",
    title: "Tuesday design review",
    status: "READY",
    tags: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function aFolder(over: Partial<Project> = {}): Project {
  return {
    id: "prj_1",
    name: "Beta Launch",
    description: "",
    color: "",
    favorite: false,
    meetingCount: 9,
    createdAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-08-01T09:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  query.last = null;
  rows = [aMeeting()];
  total = null;
  noData = false;
  loading = false;
  errored = false;
  folders = [aFolder()];
  foldersErrored = false;
  /*
   * Both. The remembered date window lives in `localStorage` -- see
   * lib/preference-store -- so a test that narrows it leaves the next one
   * starting narrowed, with a filter chip reading "Last 7 days" instead of
   * "Any time".
   */
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("the masthead", () => {
  it("says what the page is before it offers a control", async () => {
    render(<LibraryPage />);

    const title = await screen.findByRole("heading", { level: 1 });
    expect(title).toHaveTextContent("Every meeting");
    expect(screen.getByText("Library")).toBeInTheDocument();
  });

  it("describes the archive truthfully", async () => {
    render(<LibraryPage />);

    await screen.findByRole("heading", { level: 1 });
    // The retention clause is kept only because retention is real here:
    // RetentionService, RetentionJob, and a window on the account.
    expect(screen.getByText(/Everything in this workspace, filed or not/)).toBeInTheDocument();
  });
});

describe("the list", () => {
  it("asks for everything, filed or not", async () => {
    render(<LibraryPage />);

    await screen.findByText("Tuesday design review");
    // The one line that separates this page from Now. `unfiled: true` here
    // would make Library a second copy of Now under another name.
    expect(query.last?.unfiled).toBeUndefined();
  });

  it("lists the conversations that came back", async () => {
    rows = [aMeeting(), aMeeting({ id: "mtg_2", title: "Pricing sync" })];
    render(<LibraryPage />);

    expect(await screen.findByText("Tuesday design review")).toBeInTheDocument();
    expect(screen.getByText("Pricing sync")).toBeInTheDocument();
  });

  it("links a conversation to itself", async () => {
    render(<LibraryPage />);

    expect(await screen.findByRole("link", { name: /Tuesday design review/ })).toHaveAttribute(
      "href",
      "/meetings/mtg_1",
    );
  });

  it("states the server's count, and never a duration it would have to add up", async () => {
    /*
     * The reference reads "68 meetings · 41h 20m". `totalElements` is real; no
     * endpoint returns an archive-wide duration, and summing the fifty rows on
     * screen would be a measurement of the page rather than of the archive.
     */
    rows = [
      aMeeting(),
      aMeeting({ id: "m2", title: "Pricing sync" }),
      aMeeting({ id: "m3", title: "Beta readiness" }),
    ];
    total = 3;
    render(<LibraryPage />);

    await screen.findByText("Beta readiness");
    expect(document.body.textContent ?? "").toContain("3 meetings");
    expect(document.body.textContent ?? "").not.toMatch(/\d+h\s*\d+m/);
  });

  it("says when it is showing fewer than there are", async () => {
    total = 200;
    render(<LibraryPage />);

    await screen.findByText("Tuesday design review");
    expect(screen.getByText(/Showing the 1 most recent of/)).toBeInTheDocument();
  });
});

describe("the filters", () => {
  it("keeps the one that works", async () => {
    render(<LibraryPage />);

    await screen.findByText("Tuesday design review");
    expect(screen.getByRole("button", { name: /Any time/ })).toBeInTheDocument();
  });

  it("draws none of the three the API cannot honour", async () => {
    /*
     * "Every folder", "Any kind" and "Any voice" are in the reference. There is
     * no folder, source or speaker parameter on `GET /meetings` — and a folder
     * chip would be the very predicate this app removed from both lists.
     */
    render(<LibraryPage />);

    await screen.findByText("Tuesday design review");
    const text = document.body.textContent ?? "";
    for (const fake of ["Every folder", "Any kind", "Any voice"]) {
      expect(text).not.toContain(fake);
    }
  });
});

describe("the folder margin", () => {
  it("shows the real folders, with their real counts", async () => {
    folders = [aFolder({ name: "Beta Launch", meetingCount: 9 })];
    render(<LibraryPage />);

    await screen.findByText("Tuesday design review");
    expect(screen.getByRole("link", { name: /Beta Launch/ })).toHaveAttribute(
      "href",
      "/folder/prj_1",
    );
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("is not a table above the archive", async () => {
    /*
     * THE STRUCTURAL POINT OF THIS MIGRATION. The folders were a full-width
     * section with a sort header at the top of the page; an account with no
     * folders spent about three hundred pixels saying so, above the archive.
     * The archive comes first in the document now and the folders sit beside
     * it.
     */
    render(<LibraryPage />);

    await screen.findByText("Tuesday design review");
    const archive = screen.getAllByRole("heading", { level: 2 })[0];
    const folderHeading = screen.getByRole("heading", { name: "Folders" });
    expect(archive).not.toBe(folderHeading);
    expect(archive.compareDocumentPosition(folderHeading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("sends Manage to the folders page", async () => {
    render(<LibraryPage />);

    await screen.findByText("Tuesday design review");
    expect(screen.getByRole("link", { name: "Manage" })).toHaveAttribute("href", "/folders");
  });

  it("stays quiet when there are no folders, rather than taking the page", async () => {
    folders = [];
    render(<LibraryPage />);

    await screen.findByText("Tuesday design review");
    expect(screen.getByText("No folders yet.")).toBeInTheDocument();
    // And the archive is still the document: it comes first, and nothing has
    // pushed it down.
    expect(screen.getByText("Tuesday design review")).toBeInTheDocument();
  });

  it("does not read a failed folder request as an account with no folders", async () => {
    folders = undefined;
    foldersErrored = true;
    render(<LibraryPage />);

    await screen.findByText("Tuesday design review");
    expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't load your folders/);
    expect(screen.queryByText("No folders yet.")).not.toBeInTheDocument();
  });

  it("carries no Kinds section, and none of its invented categories", async () => {
    /*
     * The reference's second margin section is Recorded here / Uploaded / From
     * a link / Typed-up notes. Nothing filters by source, so those would be
     * links that cannot narrow anything, and two of the four are not concepts
     * this product has.
     */
    render(<LibraryPage />);

    await screen.findByText("Tuesday design review");
    const text = document.body.textContent ?? "";
    for (const fake of ["Kinds", "Recorded here", "From a link", "Typed-up notes"]) {
      expect(text).not.toContain(fake);
    }
  });

  it("offers no Not in a folder row", async () => {
    // That row is `unfiled=true`, which is the predicate this app removed.
    render(<LibraryPage />);

    await screen.findByText("Tuesday design review");
    expect(document.body.textContent ?? "").not.toMatch(/Not in a folder/);
  });
});

describe("what it must never say", () => {
  it("uses no Memory vocabulary", async () => {
    render(<LibraryPage />);

    await screen.findByText("Tuesday design review");
    const text = document.body.textContent ?? "";
    for (const word of [/\bMemory\b/, /tracked/i, /commitment/i, /decision drift/i, /promise/i]) {
      expect(text).not.toMatch(word);
    }
  });
});

describe("when it cannot be read", () => {
  it("says so, rather than saying the archive is empty", async () => {
    // The two readings are opposites and only one of them is recoverable by
    // waiting. `data?.content ?? []` reads "no answer" as "the answer is none",
    // which tells somebody with two hundred meetings that they have none.
    errored = true;
    noData = true;
    render(<LibraryPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Couldn't load your library/);
    expect(screen.queryByText("Nothing here yet")).not.toBeInTheDocument();
  });

  it("offers the way back", async () => {
    errored = true;
    noData = true;
    render(<LibraryPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));

    expect(refetch).toHaveBeenCalled();
  });

  it("keeps whatever is already on screen when a refetch fails over it", async () => {
    // RTK does not throw the last good page away, and neither should this: an
    // error screen replacing a list somebody is reading is worse than the error.
    errored = true;
    noData = false;
    render(<LibraryPage />);

    expect(await screen.findByText("Tuesday design review")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("when there is genuinely nothing", () => {
  it("says the archive is empty and how it stops being empty", async () => {
    rows = [];
    render(<LibraryPage />);

    expect(await screen.findByText("Nothing here yet")).toBeInTheDocument();
  });

  it("does not claim a folder is hiding anything", async () => {
    // Now needs that screen because its list is narrowed by default. This one
    // is everything, so there is nothing for a folder to be hiding — saying so
    // would send somebody looking through folders for meetings that do not
    // exist.
    rows = [];
    render(<LibraryPage />);

    await screen.findByText("Nothing here yet");
    expect(screen.queryByText(/Everything is in a folder/)).not.toBeInTheDocument();
  });

  it("draws no bordered card around any of it", async () => {
    /*
     * Both empty states and the error were `rounded-lg border border-dashed
     * py-16 text-center`. A dashed rectangle in the middle of a page of
     * hairlines is the loudest thing on the screen, and the V2 rule is that
     * content sits on the canvas.
     */
    rows = [];
    const { container } = render(<LibraryPage />);

    await screen.findByText("Nothing here yet");
    expect(container.querySelectorAll(".border-dashed")).toHaveLength(0);
  });
});

describe("when a date window has emptied it", () => {
  /** Narrow to a real window, which is what makes the two empty states differ. */
  async function narrow() {
    rows = [];
    render(<LibraryPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Any time/ }));
    await userEvent.click(await screen.findByRole("button", { name: /Last 7 days/ }));
  }

  it("says the window excluded everything, not that the archive is empty", async () => {
    await narrow();

    expect(await screen.findByText(/Nothing from/)).toBeInTheDocument();
    expect(screen.queryByText("Nothing here yet")).not.toBeInTheDocument();
  });

  it("says the rest of the library is still there", async () => {
    await narrow();

    expect(
      await screen.findByText(/The rest of your library is still here/),
    ).toBeInTheDocument();
  });

  it("keeps the way to widen it", async () => {
    await narrow();

    await userEvent.click(await screen.findByRole("button", { name: "Show any time" }));

    expect(await screen.findByRole("button", { name: /Any time/ })).toBeInTheDocument();
  });

  it("invents no cross-filter arithmetic", async () => {
    /*
     * The reference reads "five meetings in Hiring and fourteen with Nina —
     * just none that are both". Two of those filters do not exist and each
     * count would be a second request.
     */
    await narrow();

    await screen.findByText(/Nothing from/);
    const text = document.body.textContent ?? "";
    for (const fake of ["Hiring", "Nina", "Clear every filter"]) {
      expect(text).not.toContain(fake);
    }
  });
});
