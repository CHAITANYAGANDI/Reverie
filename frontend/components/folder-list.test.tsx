import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Project } from "@/lib/types";

/**
 * The folder list.
 *
 * <p>The row is the whole of it: a name, how much is in it, when it last
 * changed, and the two things you can do to it. Two of those are worth
 * guarding.
 *
 * <p><i>Deleting a folder must never read as deleting its meetings.</i> The
 * confirmation says what survives, because "delete" over a folder full of
 * recordings reads as worse than it is — and somebody who believes it keeps
 * folders they do not want.
 *
 * <p><i>The star outranks the sort.</i> Whichever column header was last
 * clicked, a starred folder is first; it is the only thing here that is a
 * statement about what somebody is working on rather than about the data.
 *
 * <h2>Three files' worth of rules, and one route that came back</h2>
 *
 * <p>This was `app/(app)/folders/page.test.tsx`, then
 * `components/folder-table.test.tsx` when the list moved to the top of Library,
 * and the route exists again — the list is a page and the Library margin is a
 * glance at it. Every assertion those files held is below.
 *
 * <p>What changed with the V2 composition is the drawing, so the assertions
 * about the drawing changed with it: the two column headers ("Name", "Last
 * Updated") are a chip, and the ordering that always put starred folders first
 * is now two headed groups instead of an order nobody could see.
 *
 * <p>The second half came from `components/folder-tree.test.tsx`, the navigation
 * rail's folder section, which is retired with the rail. It is here because it
 * held a rule this list did not have and needed: `projects ?? []` reads *no
 * answer* as *the answer is none*, so an unresolved request, a first load, a
 * dropped connection and a 500 all drew "No folders yet" — a confident sentence
 * about somebody's account, produced by a failure to reach the server. Losing
 * those tests with the component would have quietly un-fixed that.
 */
const { update, remove, confirm, refetch } = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
  refetch: vi.fn(),
}));

let folders: Project[] | undefined;
let loading: boolean;
let fetching: boolean;
let errored: boolean;

vi.mock("@/lib/api", () => ({
  useGetProjectsQuery: () => ({
    data: folders,
    isLoading: loading,
    isFetching: fetching || loading,
    isError: errored,
    isSuccess: !loading && !errored && folders !== undefined,
    isUninitialized: false,
    refetch,
  }),
  useUpdateProjectMutation: () => [
    (arg: unknown) => {
      update(arg);
      return { unwrap: () => Promise.resolve({}) };
    },
    { isLoading: false },
  ],
  useDeleteProjectMutation: () => [
    (id: string) => {
      remove(id);
      return { unwrap: () => Promise.resolve({ unfiledMeetings: 3 }) };
    },
    { isLoading: false },
  ],
  useCreateProjectMutation: () => [() => ({ unwrap: () => Promise.resolve({}) }), { isLoading: false }],
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { FolderList } from "@/components/folder-list";

function folder(over: Partial<Project> = {}): Project {
  return {
    id: "prj_1",
    name: "Meetings",
    description: "",
    color: "",
    favorite: false,
    meetingCount: 1,
    createdAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-08-01T09:00:00Z",
    ...over,
  };
}

/**
 * The folder rows, in order.
 *
 * <p>By href rather than by role: the masthead carries a "Library" link back up
 * a level, and `getAllByRole("link")[0]` was picking that up the moment this
 * page grew a breadcrumb.
 */
function folderNames(): string[] {
  return Array.from(document.querySelectorAll('a[href^="/folder/"]')).map(
    (el) => el.textContent ?? "",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  folders = [folder()];
  loading = false;
  fetching = false;
  errored = false;
  window.confirm = confirm;
  confirm.mockReturnValue(true);
});

describe("the list", () => {
  it("shows each folder and how much is in it", () => {
    render(<FolderList />);

    expect(screen.getByText("Meetings")).toBeInTheDocument();
    expect(screen.getByText("1 meeting")).toBeInTheDocument();
  });

  it("counts in the plural when it should", () => {
    folders = [folder({ meetingCount: 4 })];
    render(<FolderList />);

    expect(screen.getByText("4 meetings")).toBeInTheDocument();
  });

  it("links a folder to itself", () => {
    render(<FolderList />);

    expect(screen.getByRole("link", { name: /Meetings/ })).toHaveAttribute(
      "href",
      "/folder/prj_1",
    );
  });

  it("lists only folders — the conversations are the list underneath", () => {
    // This was once the only meeting list there was, and carried a row for
    // meetings in no folder. Library lists everything below it now, so nothing
    // is hidden by leaving them out.
    render(<FolderList />);

    expect(screen.queryByText(/No folder/)).not.toBeInTheDocument();
  });

  it("says what a folder is for when there are none", () => {
    folders = [];
    render(<FolderList />);

    expect(screen.getByText("No folders yet")).toBeInTheDocument();
    expect(
      screen.getByText(/group conversations around the work they belong to/),
    ).toBeInTheDocument();
  });

  it("shows a folder's own description, and never invented prose", () => {
    /*
     * `description` is a real column on Project. The reference's row prose —
     * "The beta date, the migration runbook and the SSO risk all live here" —
     * is a summary of tracked cross-meeting state, which does not exist.
     */
    folders = [folder({ description: "Everything about the beta." })];
    render(<FolderList />);

    expect(screen.getByText("Everything about the beta.")).toBeInTheDocument();
    for (const invented of [/tracked/i, /instalment/i, /promise/i, /risk open/i]) {
      expect(document.body.textContent ?? "").not.toMatch(invented);
    }
  });
});

describe("ordering", () => {
  it("opens on what changed most recently", () => {
    folders = [
      folder({ id: "old", name: "Older", updatedAt: "2026-01-01T09:00:00Z" }),
      folder({ id: "new", name: "Newer", updatedAt: "2026-08-10T09:00:00Z" }),
    ];
    render(<FolderList />);

    expect(folderNames()[0]).toContain("Newer");
  });

  it("sorts by name when that order is chosen", async () => {
    /*
     * The control is a chip in the masthead rather than two column headers over
     * one column. The order it produces is unchanged.
     */
    folders = [
      folder({ id: "b", name: "Beta", updatedAt: "2026-08-10T09:00:00Z" }),
      folder({ id: "a", name: "Alpha", updatedAt: "2026-01-01T09:00:00Z" }),
    ];
    render(<FolderList />);

    await userEvent.click(screen.getByRole("button", { name: "Order the folders" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Name" }));

    expect(folderNames()[0]).toContain("Alpha");
  });

  it("names the order for what it actually sorts by", () => {
    /*
     * The reference calls this chip "Recently used". `updatedAt` moves when a
     * folder is renamed, starred or filed into, and never when it is opened —
     * nothing records being used, so that label would promise a history this
     * product does not keep.
     */
    folders = [folder({ id: "a" }), folder({ id: "b", name: "Other" })];
    render(<FolderList />);

    expect(screen.getByRole("button", { name: "Order the folders" })).toHaveTextContent(
      "Recently updated",
    );
    expect(document.body.textContent ?? "").not.toMatch(/Recently used/);
  });

  it("puts a starred folder first, whichever order is chosen", () => {
    folders = [
      folder({ id: "recent", name: "Recent", updatedAt: "2026-08-10T09:00:00Z" }),
      folder({ id: "pinned", name: "Pinned", favorite: true, updatedAt: "2026-01-01T09:00:00Z" }),
    ];
    render(<FolderList />);

    expect(folderNames()[0]).toContain("Pinned");
  });
});

describe("the two groups", () => {
  it("heads the starred ones, and everything else separately", () => {
    // The order was always this; the headings are what make it visible.
    folders = [
      folder({ id: "pinned", name: "Pinned", favorite: true }),
      folder({ id: "plain", name: "Plain" }),
    ];
    render(<FolderList />);

    expect(screen.getByRole("heading", { name: "Starred" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Everything else" })).toBeInTheDocument();
  });

  it("draws no Starred heading when nothing is starred", () => {
    // A heading over no rows describes the layout rather than the data.
    folders = [folder({ id: "plain", name: "Plain" })];
    render(<FolderList />);

    expect(screen.queryByRole("heading", { name: "Starred" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Everything else" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "All folders" })).toBeInTheDocument();
  });
});

describe("how the page names itself", () => {
  it("counts the folders it actually has", () => {
    folders = [folder({ id: "a" }), folder({ id: "b", name: "Two" })];
    render(<FolderList />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("2 folders");
  });

  it("says one folder in the singular", () => {
    render(<FolderList />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("1 folder");
  });

  it("says none when there are none", () => {
    folders = [];
    render(<FolderList />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("No folders yet");
  });

  it("claims no count while the answer is unknown", () => {
    /*
     * "No folders yet" is a claim about the account, and a request that has not
     * come back is not evidence for it — so the page is headed by what it is
     * until there is a number that is true.
     */
    folders = undefined;
    loading = true;
    render(<FolderList />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Folders");
    expect(screen.queryByText("No folders yet")).not.toBeInTheDocument();
  });

  it("says where it sits, and offers the way back up", () => {
    render(<FolderList />);

    expect(screen.getByText("Library \u00b7 folders")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Library/ })).toHaveAttribute("href", "/library");
  });

  it("is not a table", () => {
    // "Name / Last Updated" were two column headers doubling as the sort, over
    // what was really one column.
    render(<FolderList />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Last Updated" })).not.toBeInTheDocument();
  });
});

describe("the row menu", () => {
  async function openMenu() {
    render(<FolderList />);
    await userEvent.click(screen.getByRole("button", { name: "Actions for Meetings" }));
  }

  it("stars a folder", async () => {
    await openMenu();

    await userEvent.click(screen.getByRole("menuitem", { name: /Star folder/ }));

    expect(update).toHaveBeenCalledWith({ id: "prj_1", body: { favorite: true } });
  });

  it("offers to take the star off one that has it", async () => {
    folders = [folder({ favorite: true })];
    await openMenu();

    await userEvent.click(screen.getByRole("menuitem", { name: /Remove star/ }));

    expect(update).toHaveBeenCalledWith({ id: "prj_1", body: { favorite: false } });
  });

  it("opens the rename form on the folder it was opened from", async () => {
    await openMenu();

    await userEvent.click(screen.getByRole("menuitem", { name: /Rename Folder/ }));

    expect(await screen.findByRole("heading", { name: "Rename folder" })).toBeInTheDocument();
  });

  it("says the meetings survive before deleting the folder", async () => {
    await openMenu();

    await userEvent.click(screen.getByRole("menuitem", { name: /Delete Folder/ }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith("prj_1"));
    // The sentence people read at the moment they are deciding.
    expect(confirm.mock.calls[0][0]).toMatch(/are kept/);
  });

  it("deletes nothing when the confirmation is declined", async () => {
    confirm.mockReturnValue(false);
    await openMenu();

    await userEvent.click(screen.getByRole("menuitem", { name: /Delete Folder/ }));

    expect(remove).not.toHaveBeenCalled();
  });
});

describe("creating", () => {
  /*
   * THIS USED TO ASSERT THE OPPOSITE, and the reversal is deliberate.
   *
   * <p>The button was in the top bar, and the old file said so: "It is in the
   * top bar on this page, where Import and Record sit everywhere else." That was
   * right while the bar belonged to the page. It does not any more — what is up
   * there is a global band carrying the same five controls on every screen in
   * the app, and a New folder button in it would offer one page's action from
   * all of them.
   *
   * <p>So the list took its own action back, and what these pin is the thing
   * that made the old arrangement worth writing down: there is exactly ONE of
   * them above the list, never two a centimetre apart.
   */
  it("puts a New folder button beside the heading, and only one", () => {
    render(<FolderList />);

    expect(screen.getAllByRole("button", { name: /New folder/ })).toHaveLength(1);
  });

  it("opens the dialog from it", async () => {
    render(<FolderList />);

    await userEvent.click(screen.getByRole("button", { name: /New folder/ }));

    expect(await screen.findByRole("heading", { name: "Create a folder" })).toBeInTheDocument();
  });

  it("keeps one in the empty state, where it is being explained", async () => {
    folders = [];
    render(<FolderList />);

    // Two now, and that is not what the old file argued against: the heading
    // button and the one inside the explanation are a page-length apart, and
    // somebody reading "a folder groups meetings by the work they belong to" is
    // going to press the thing directly under it rather than scroll back.
    const buttons = screen.getAllByRole("button", { name: /New folder/ });
    expect(buttons).toHaveLength(2);
    await userEvent.click(buttons[1]);

    expect(await screen.findByRole("heading", { name: "Create a folder" })).toBeInTheDocument();
  });
});

/**
 * No answer is not the answer "none".
 *
 * <h2>The bug, which this list had and the rail's version did not</h2>
 *
 * <p>It decided what to draw with `folders ?? []` guarded only by `isLoading`.
 * So an unresolved request, a dropped connection and a 500 all arrived as a
 * list of length zero and were drawn exactly like an account with no folders —
 * "No folders yet", with an explanation of what folders are for, shown to
 * somebody who has twenty of them.
 *
 * <p>`isLoading` does not cover it either: it is true only for the very first
 * load of a cache entry. A refetch sets `isFetching`; an error sets neither.
 *
 * <p>The rule: the empty state is a *claim about the account*, and only a
 * settled, successful, genuinely empty response may make it.
 */
describe("when the request does not simply succeed", () => {
  const EMPTY = "No folders yet";

  it("shows a skeleton before the first answer, not an empty list", () => {
    folders = undefined;
    loading = true;
    const { container } = render(<FolderList />);

    expect(screen.queryByText(EMPTY)).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("does not claim an empty account when there is simply no data yet", () => {
    // The exact `?? []` case, with no error to mask it: every other test here
    // with no data also has an error, and the error branch answers first — so
    // mutating the rule to treat undefined as empty would leave them passing.
    folders = undefined;
    render(<FolderList />);

    expect(screen.queryByText(EMPTY)).not.toBeInTheDocument();
  });

  it("says the request failed, and offers a retry", async () => {
    folders = undefined;
    errored = true;
    render(<FolderList />);

    expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't load your folders/);
    expect(screen.queryByText(EMPTY)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(refetch).toHaveBeenCalled();
  });

  it("keeps backend detail off the screen", () => {
    folders = undefined;
    errored = true;
    render(<FolderList />);

    expect(screen.queryByText(/500/)).not.toBeInTheDocument();
  });

  it("keeps the folders on screen when a background refetch fails", () => {
    // Known-good rows beat a failed refresh. Throwing away the good copy
    // because the new one did not arrive is strictly worse than showing it.
    errored = true;
    render(<FolderList />);

    expect(screen.getByText("Meetings")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the folders on screen during a background refetch", () => {
    fetching = true;
    render(<FolderList />);

    expect(screen.getByText("Meetings")).toBeInTheDocument();
  });

  it("still draws the empty state for an account that genuinely has none", () => {
    // The fix must not make the empty state unreachable — that would trade a
    // false negative for a permanent skeleton on a new account.
    folders = [];
    render(<FolderList />);

    expect(screen.getByText(EMPTY)).toBeInTheDocument();
  });

  it("hides the order control while the failure is on screen", () => {
    // A control for a list that is not there.
    folders = undefined;
    errored = true;
    render(<FolderList />);

    expect(
      screen.queryByRole("button", { name: "Order the folders" }),
    ).not.toBeInTheDocument();
  });

  it("offers no order to choose between one folder", () => {
    render(<FolderList />);

    expect(
      screen.queryByRole("button", { name: "Order the folders" }),
    ).not.toBeInTheDocument();
  });
});
