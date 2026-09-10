import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Project, SearchFacets, SearchResponse } from "@/lib/types";
import { rememberSearch, readRecentSearches } from "@/lib/recent-searches";

/**
 * The search overlay.
 *
 * <p>It answers. That is the thing worth pinning down here, because it did not:
 * typing an ordinary word showed a blank panel, since the only thing the box
 * had to offer was completions for filter prefixes and "product" is not one. A
 * search box that displays nothing while you type reads as broken, and the
 * tests below are mostly about it not being able to become that again.
 *
 * <p>And it is the only search there is. There used to be a /search page behind
 * it, reached by pressing Enter — which is where the second failure lived:
 * Enter, and a click on a remembered search, both left this box for a page that
 * showed nothing. Enter opens a result now, and a remembered search runs here.
 * Both are asserted below, and so is the absence of anything that navigates to
 * a results page.
 *
 * <p>The rest is the grammar. And a half-typed filter never becomes a search:
 * `tag:bil` submitted as free text returns nothing and blames the archive.
 */
const { push, searchQuery, askReverie } = vi.hoisted(() => ({
  push: vi.fn(),
  searchQuery: vi.fn(),
  askReverie: vi.fn(),
}));

/*
 * The handoff, mocked to prove one thing: Search does not answer.
 *
 * <p>It has no chat client in it — no mutation, no citation, no thread — and
 * the Ask row's whole job is to put the words in the store the Ask surfaces
 * read and get out of the way. See lib/ask-handoff.
 */
vi.mock("@/lib/ask-handoff", () => ({ askReverie }));

const facets: SearchFacets = {
  speakers: ["Priya", "Marcus"],
  owners: ["Marcus"],
  tags: ["q4"],
  types: ["standup"],
  statuses: ["READY"],
};

const projects = [
  { id: "prj_1", name: "Q4 planning" },
] as unknown as Project[];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  // `Start recording` carries the page it was opened from, so it has one.
  usePathname: () => "/home",
}));

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ userId: "usr_1" }) }));

// The real store, not a mock: it is the thing being relied on here, and it
// reads and writes the jsdom localStorage that each test clears.

let results: SearchResponse;
let fetching = false;
/**
 * Answers for particular queries, over the top of `results`.
 *
 * <p>The panel now runs more than one search: the resting state asks for the
 * newest meetings with an empty term — which is a real request this API
 * supports — and the zero state asks the same search one word shorter. Keyed by
 * `q` so a test can say what each of them found.
 */
let byQuery: Record<string, SearchResponse> = {};

vi.mock("@/lib/api", () => ({
  useGetSearchFacetsQuery: () => ({ data: facets }),
  useGetProjectsQuery: () => ({ data: projects }),
  useSearchQuery: (args: { q: string }, opts?: { skip?: boolean }) => {
    if (opts?.skip) return { currentData: undefined, data: undefined, isFetching: false };
    searchQuery(args);
    const data = args.q in byQuery ? byQuery[args.q] : results;
    // `currentData` is what the panel reads, and the difference is the point:
    // it is the data for *these* arguments, so a settled response for "diar"
    // cannot be painted under "diarization" while the newer request is out.
    return { currentData: data, data, isFetching: fetching };
  },
}));

function response(over: Partial<SearchResponse> = {}): SearchResponse {
  return {
    query: "product",
    meetings: {
      total: 1,
      hits: [
        {
          id: "mtg_1",
          title: "Product marketing weekly",
          status: "READY",
          createdAt: "2026-08-10T09:00:00Z",
          durationSeconds: 1800,
          tags: [],
          summaryTemplate: "general",
          mentions: 3,
          titleMatch: true,
        },
      ],
    },
    people: { total: 0, hits: [] },
    decisions: { total: 0, hits: [] },
    risks: { total: 0, hits: [] },
    commitments: { total: 0, hits: [] },
    mentions: {
      total: 1,
      hits: [
        {
          segmentId: "seg_1",
          meetingId: "mtg_2",
          meetingTitle: "Weekly sync",
          meetingCreatedAt: "2026-07-28T10:00:00Z",
          speaker: "Priya",
          start: 942.4,
          text: "Ah, product announcements. So I appreciate Brian for adding this.",
        },
      ],
    },
    ...over,
  };
}

const NOTHING: SearchResponse = {
  query: "product",
  meetings: { total: 0, hits: [] },
  people: { total: 0, hits: [] },
  decisions: { total: 0, hits: [] },
  risks: { total: 0, hits: [] },
  commitments: { total: 0, hits: [] },
  mentions: { total: 0, hits: [] },
};

/** One decision and one person, for the two groups the old panel discarded. */
function withEverything(): SearchResponse {
  return response({
    decisions: {
      total: 2,
      hits: [
        {
          id: "ins_1",
          meetingId: "mtg_3",
          meetingTitle: "Transcription provider review",
          meetingCreatedAt: "2026-08-12T10:00:00Z",
          kind: "DECISION",
          text: "Production transcription moves to a provider that diarizes.",
        },
      ],
    },
    people: {
      total: 1,
      hits: [{ name: "Priya Raman", meetings: 4, segments: 90, mentions: 3, commitments: 1 }],
    },
  });
}

/** What the resting state's empty-term search answers with. */
const BROWSE: SearchResponse = {
  ...NOTHING,
  query: "",
  meetings: {
    total: 1,
    hits: [
      {
        id: "mtg_recent",
        title: "Yesterday's standup",
        status: "READY",
        createdAt: "2026-09-09T09:00:00Z",
        durationSeconds: 600,
        tags: [],
        summaryTemplate: "standup",
        mentions: 0,
        titleMatch: false,
      },
    ],
  },
};

import { SearchCommand } from "@/components/search-command";

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  results = response();
  byQuery = { "": BROWSE };
  fetching = false;
  // jsdom has no rAF scheduling worth waiting on; run the focus callback now.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

describe("opening", () => {
  it("shows nothing at all when closed", () => {
    render(<SearchCommand open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByLabelText("Search")).not.toBeInTheDocument();
  });

  it("offers what was searched before, once there is any", async () => {
    rememberSearch("usr_1", "tag:q4 budget");
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    // The commonest reason to open a search box is to run something close to
    // the last one.
    expect(screen.getByText(/Recent searches/i)).toBeInTheDocument();
    expect(screen.getByText("tag:q4 budget")).toBeInTheDocument();
  });

  it("runs a remembered search here, in the box it was typed into", async () => {
    rememberSearch("usr_1", "tag:q4 budget");
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    await userEvent.click(screen.getByText("tag:q4 budget"));

    // It used to navigate to /search with the query in the URL, which is how
    // clicking a recent search came to show nothing at all.
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Search")).toHaveValue("tag:q4 budget");
    // Straight away, without waiting out the settle: it was typed once already.
    expect(await screen.findByText(/marketing weekly/)).toBeInTheDocument();
  });

  it("gets out of the way the moment anything is typed", async () => {
    rememberSearch("usr_1", "stripe");
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Search"), "bil");

    expect(screen.queryByText(/Recent searches/i)).not.toBeInTheDocument();
  });

  it("can be forgotten from the box that shows it", async () => {
    rememberSearch("usr_1", "stripe");
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.queryByText(/Recent searches/i)).not.toBeInTheDocument();
    expect(readRecentSearches("usr_1")).toEqual([]);
  });

  it("opens onto something useful rather than a grey box", () => {
    /*
     * IT USED TO BE THE INPUT AND THE WORD "Esc to close".
     *
     * <p>An empty account with no search history got a 672px box with nothing
     * in it, which is the state the redesign exists to fix. What is here now is
     * three things that are all real: the newest meetings (a real empty-term
     * search this API answers), the workspace's own folders, and three actions
     * that already exist elsewhere in the app.
     *
     * <p>The worked examples and the "Try from: in: when: tag:" footer are
     * still gone. A help page inside the thing you opened in order to type is
     * read once and in the way every time after.
     */
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    expect(screen.getByText("Recent meetings")).toBeInTheDocument();
    expect(screen.getByText("Yesterday's standup")).toBeInTheDocument();
    expect(screen.getByText("Folders")).toBeInTheDocument();
    expect(screen.getByText("Q4 planning")).toBeInTheDocument();
    expect(screen.getByText("Do something")).toBeInTheDocument();

    expect(screen.queryByText(/Search everything at once/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Try$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Search everything/ })).not.toBeInTheDocument();
  });

  it("offers only actions the app actually has", async () => {
    /*
     * The reference screenshot's resting state lists `Go to Memory` and
     * `Import a file or a link`. Reverie has neither: there is no Memory
     * surface and no URL import — `/upload` takes a file. Asserted rather than
     * merely omitted, because both are one plausible-looking row away.
     */
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    expect(screen.getByText("Start recording")).toBeInTheDocument();
    expect(screen.getByText("Import a file")).toBeInTheDocument();
    expect(screen.getByText("Open settings")).toBeInTheDocument();

    expect(screen.queryByText(/Memory/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/or a link/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Promise/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/tracked subject/i)).not.toBeInTheDocument();
  });

  it("draws no counts against a folder, because it is not told any", () => {
    // "9 meetings · 4 tracked subjects" is two numbers `GET /projects` does not
    // return. A folder row is its name.
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    const folder = screen.getByText("Q4 planning").closest("button")!;
    expect(folder.textContent).toBe("Q4 planning");
  });

  it("starts recording through the route that carries a way back", async () => {
    const onOpenChange = vi.fn();
    render(<SearchCommand open onOpenChange={onOpenChange} />);

    await userEvent.click(screen.getByText("Start recording"));

    expect(push).toHaveBeenCalledWith("/record?r=%2Fhome");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("hands the import to the dialog the shell owns", async () => {
    const onImport = vi.fn();
    render(<SearchCommand open onOpenChange={vi.fn()} onImport={onImport} />);

    await userEvent.click(screen.getByText("Import a file"));

    // A callback rather than a route: importing is a dialog and there is no
    // /import page to push.
    expect(onImport).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("opens settings on its own route", async () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    await userEvent.click(screen.getByText("Open settings"));

    expect(push).toHaveBeenCalledWith("/settings");
  });

  it("takes the folder to the folder", async () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    await userEvent.click(screen.getByText("Q4 planning"));

    expect(push).toHaveBeenCalledWith("/folder/prj_1");
  });

  it("says what it searches, which is more than conversations", () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    expect(
      screen.getByPlaceholderText("Search meetings, transcripts, decisions, folders, tags"),
    ).toBeInTheDocument();
  });

  it("gives focus back to whatever opened it", async () => {
    /*
     * The dialog is a Radix portal now, which is what makes this true: the old
     * overlay was a plain div, so closing it left focus wherever the removed
     * subtree had it — nowhere — and the next Tab started from the top of the
     * document.
     */
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open search
          </button>
          <SearchCommand open={open} onOpenChange={setOpen} />
        </>
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open search" });

    await user.click(trigger);
    expect(screen.getByLabelText("Search")).toHaveFocus();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("keeps the caret in the box after the scope changes", async () => {
    /*
     * Radix hands focus back to the menu's trigger, which is right for a menu
     * and wrong inside a search box: the next thing anybody does after
     * narrowing a search is keep typing, and a caret on the scope button means
     * the arrow keys stop moving the selection. Found in a browser.
     */
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await user.type(screen.getByLabelText("Search"), "product");

    await user.click(await screen.findByRole("button", { name: /Scope: Everything/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Meetings/ }));

    await waitFor(() => expect(screen.getByLabelText("Search")).toHaveFocus());
  });

  it("puts the caret in the box without being asked", () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    // Opened by a keyboard shortcut from anywhere in the app, so the one thing
    // it must do is be ready to type into.
    expect(screen.getByLabelText("Search")).toHaveFocus();
  });
});

describe("suggesting", () => {
  it("offers a filter as soon as its name is recognisable", async () => {
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Search"), "ta");

    const list = await screen.findByRole("listbox", { name: /filter/i });
    expect(within(list).getByRole("option", { name: /tag:/ })).toBeInTheDocument();
  });

  it("offers the workspace's own tags, not a list to spell from memory", async () => {
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Search"), "tag:");

    const list = await screen.findByRole("listbox", { name: /filter/i });
    expect(within(list).getByRole("option", { name: /q4/ })).toBeInTheDocument();
  });

  it("offers nothing for a prefix the results page can no longer show", async () => {
    // `from:` and `owner:` went with the speaker and action-owner dropdowns.
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Search"), "from:");

    // Scoped to the suggestion list, which is not the only listbox in the
    // panel any more: the results are one too, and they are options in their
    // own right — see the note on `aria-activedescendant` in the dialog.
    expect(screen.queryByRole("listbox", { name: /filter/i })).not.toBeInTheDocument();
  });

  it("offers folders under in:, including none", async () => {
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Search"), "in:");

    const list = await screen.findByRole("listbox", { name: /filter/i });
    expect(within(list).getByRole("option", { name: /Q4 planning/ })).toBeInTheDocument();
    expect(within(list).getByRole("option", { name: /none/ })).toBeInTheDocument();
  });

  it("says nothing for an ordinary word", async () => {
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Search"), "stripe");

    expect(screen.queryByRole("listbox", { name: /filter/i })).not.toBeInTheDocument();
  });

  it("completes a chosen value into the box", async () => {
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    const input = screen.getByLabelText("Search") as HTMLInputElement;
    await user.type(input, "tag:q");
    await user.click(await screen.findByRole("option", { name: /q4/ }));

    await waitFor(() => expect(input.value).toBe("tag:q4 "));
  });
});

describe("answering", () => {
  it("shows results for an ordinary word instead of a blank panel", async () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");

    // The whole defect, in one assertion: "product" is not a filter prefix, so
    // before this the panel had nothing to draw and looked broken.
    // Matched on the unmarked half of the title: `highlight` splits it, so
    // "Product" is inside a <mark> and the text node is " marketing weekly".
    expect(await screen.findByText(/marketing weekly/)).toBeInTheDocument();
    expect(screen.getByText(/announcements/)).toBeInTheDocument();
  });

  it("says how many there are", async () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");

    expect(await screen.findByText("2 results")).toBeInTheDocument();
  });

  it("marks the term inside the title and inside the sentence", async () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");

    await screen.findByText(/marketing weekly/);
    // Two hits, two marks: without them a result is a claim that the word is in
    // there somewhere. Queried off the body rather than the render container,
    // because the dialog is a portal now — which is also what gives it a focus
    // trap and an accessible name.
    expect(document.body.querySelectorAll("mark").length).toBeGreaterThanOrEqual(2);
  });

  it("opens a conversation on click", async () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");

    await userEvent.click(await screen.findByText(/marketing weekly/));

    expect(push).toHaveBeenCalledWith("/meetings/mtg_1");
  });

  it("opens a sentence at the second it was said", async () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");

    await userEvent.click(await screen.findByText(/announcements/));

    // A mention you cannot jump to is an assertion that the word is in an hour
    // of audio somewhere.
    expect(push).toHaveBeenCalledWith("/meetings/mtg_2?t=942");
  });

  it("walks the list with the arrow keys and opens with Enter", async () => {
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await user.type(screen.getByLabelText("Search"), "product");
    await screen.findByText(/marketing weekly/);

    /*
     * THE ORDER CHANGED, AND SO DID THIS.
     *
     * <p>Transcript passages come before meetings now: "the exact words
     * somebody said" is a better answer to a typed phrase than "a meeting where
     * those words occur somewhere". So the selection starts on the sentence and
     * one press down reaches the meeting.
     */
    await user.keyboard("{ArrowDown}{Enter}");

    expect(push).toHaveBeenCalledWith("/meetings/mtg_1");
  });

  it("walks back up again, and stops rather than wrapping", async () => {
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await user.type(screen.getByLabelText("Search"), "product");
    await screen.findByText(/marketing weekly/);

    // Down to the meeting, back up to the sentence, and then two more presses
    // that cannot go past the Ask row at the top.
    await user.keyboard("{ArrowDown}{ArrowUp}{ArrowUp}{ArrowUp}{Enter}");

    /*
     * It stopped on the Ask row at the top rather than wrapping round to the
     * last result — which is how somebody opens the wrong thing while holding a
     * key down. Reaching Ask by arrow and pressing Enter is what asks; nothing
     * was opened.
     */
    expect(askReverie).toHaveBeenCalledWith("product");
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/ask");
  });

  it("opens the best result on Enter, without the arrows being touched", async () => {
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await user.type(screen.getByLabelText("Search"), "product");
    await screen.findByText(/marketing weekly/);

    await user.keyboard("{Enter}");

    /*
     * The sentence, at the second it was said — the first *result*, not the
     * first row. The Ask row is drawn above it, as the reference does, and is
     * deliberately not what the selection starts on: Enter is the key somebody
     * presses without looking, and it must not spend metered AI minutes on a
     * question a search box phrased. `⌘↵` is the one that asks.
     */
    expect(push).toHaveBeenCalledWith("/meetings/mtg_2?t=942");
  });

  it("does nothing on Enter before any result has arrived", async () => {
    const user = userEvent.setup();
    fetching = true;
    results = NOTHING;
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    const onOpenChange = vi.fn();
    await user.type(screen.getByLabelText("Search"), "product");

    await user.keyboard("{Enter}");

    // Enter on a list that is not there should leave the box open rather than
    // close it on nothing, which is what made this feel broken.
    expect(push).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
  });

  it("remembers a search that ended in a click, not only one that reached the page", async () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");
    await userEvent.click(await screen.findByText(/marketing weekly/));

    // What somebody typed is what they will want back tomorrow; whether they
    // happened to find it on the first page does not change that.
    expect(readRecentSearches("usr_1")).toEqual(["product"]);
  });

  it("says how much of the archive it is not showing, and offers no page for it", async () => {
    results = response({ mentions: { total: 40, hits: response().mentions.hits } });
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");
    await screen.findByText(/marketing weekly/);

    // Two of forty-one drawn. "See all results" opened a page that could show
    // them; with the page gone, saying so beats a button that goes nowhere.
    expect(screen.getByText("2 of 41")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /See all/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Search everything/ })).not.toBeInTheDocument();
  });

  it("says nothing matched, and what to try instead", async () => {
    results = NOTHING;
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");

    // It used to point at /search, which paid for an embedding and could find a
    // passage that meant this. With the page gone there is nowhere to send
    // somebody whose wording was wrong, so the advice has to be usable here.
    expect(await screen.findByText(/Nothing matched/)).toBeInTheDocument();
    expect(screen.getByText(/tag:/)).toBeInTheDocument();
    expect(screen.queryByText(/open it below/i)).not.toBeInTheDocument();
  });

  it("does not search the archive for a term before there is one", () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    // One request goes out on open and it is the resting state's own: an empty
    // term, which this API reads as "the newest meetings". Nothing is searched
    // *for* until something is typed.
    const terms = searchQuery.mock.calls.map((c) => (c[0] as { q: string }).q);
    expect(terms.filter((q) => q !== "")).toEqual([]);
  });

  it("searches once the typing settles, not once per keystroke", async () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");

    await waitFor(() => expect(searchQuery).toHaveBeenCalled());
    // Seven keystrokes must not be seven searches across every transcript.
    const terms = searchQuery.mock.calls.map((c) => (c[0] as { q: string }).q);
    expect(terms).not.toContain("produc");
  });

  it("asks for every group it can draw, and none it cannot", async () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");

    /*
     * FOUR, WHERE IT USED TO ASK FOR TWO.
     *
     * <p>`GET /search` answers with six groups and the old panel rendered
     * `meetings` and `mentions`, so decisions and people were being computed by
     * Postgres and thrown away on every search. Risks and commitments are still
     * not asked for, because nothing draws them — naming the groups is what
     * keeps the request and the panel honest with each other.
     */
    // The resting state's own empty-term request goes out first, so this waits
    // for the one that carries the term rather than reading whatever was last.
    const args = await waitFor(() => {
      const last = searchQuery.mock.calls.at(-1)?.[0] as { groups?: string[]; q: string };
      expect(last.q).toBe("product");
      return last;
    });
    expect(args.groups).toEqual(["meetings", "mentions", "decisions", "people"]);
    expect(args.groups).not.toContain("risks");
    expect(args.groups).not.toContain("commitments");
  });

  it("searches for what a filter leaves behind, not for the filter", async () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "tag:q4 product");

    await waitFor(() => {
      const args = searchQuery.mock.calls.at(-1)?.[0] as { q: string; tag?: string };
      expect(args.q).toBe("product");
      expect(args.tag).toBe("q4");
    });
  });
});

describe("showing what is narrowed", () => {
  it("puts a chip up for each filter, so the narrowing is never invisible", async () => {
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Search"), "tag:q4 stripe");

    expect(await screen.findByText("tag: q4")).toBeInTheDocument();
  });
});

describe("searching", () => {
  it("carries the filters into the request, not into a URL", async () => {
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Search"), "tag:q4 stripe");

    // The filter is applied to the search this box runs. It used to be encoded
    // into /search?tag=q4&q=stripe and handed to a page.
    await waitFor(() =>
      expect(searchQuery).toHaveBeenCalledWith(
        expect.objectContaining({ q: "stripe", tag: "q4" }),
      ),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("completes a half-typed filter on Enter instead of searching for it", async () => {
    // `tag:q` submitted as free text returns nothing and looks like the
    // archive is empty.
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    const input = screen.getByLabelText("Search") as HTMLInputElement;
    await user.type(input, "tag:q");
    await user.keyboard("{Enter}");

    expect(push).not.toHaveBeenCalled();
    await waitFor(() => expect(input.value).toBe("tag:q4 "));
  });

  it("opens a result on Enter once there is nothing left to complete", async () => {
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Search"), "stripe");
    await screen.findByText(/marketing weekly/);
    await user.keyboard("{Enter}");

    // The transcript passage, which is the first result in the new order.
    await waitFor(() => expect(push).toHaveBeenCalledWith("/meetings/mtg_2?t=942"));
  });

  it("closes on Escape without searching", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={onOpenChange} />);

    await user.type(screen.getByLabelText("Search"), "stripe");
    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(push).not.toHaveBeenCalled();
  });
});

describe("the groups the old panel discarded", () => {
  it("draws decisions and people, which the API was already answering with", async () => {
    /*
     * THE FINDING BEHIND THE REDESIGN.
     *
     * <p>`GET /search` returns six groups. The old panel rendered two and
     * narrowed the request to those two, so `meeting_insights` and the
     * speaker index were never asked and never seen. Both are real tables with
     * real queries behind them — see `SearchRepository.insights` and
     * `.people`.
     */
    results = withEverything();
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");

    expect(await screen.findByText("Decisions")).toBeInTheDocument();
    // Matched past the highlight: "product" is a prefix of "Production", so
    // `Marked` splits that first word into a <mark> and a text node.
    expect(screen.getByText(/transcription moves to a provider/)).toBeInTheDocument();
    expect(screen.getByText("People")).toBeInTheDocument();
    expect(screen.getByText("Priya Raman")).toBeInTheDocument();
  });

  it("puts the true total against each heading, not the number drawn", async () => {
    results = withEverything();
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");

    // Two decisions exist and one came back. The heading says two, because that
    // is what the archive holds — the API's own `total`.
    const heading = (await screen.findByText("Decisions")).closest("div")!;
    expect(heading.textContent).toContain("2");
  });

  it("draws no heading over an empty group", async () => {
    // `results` has no decisions and no people in it.
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");

    await screen.findByText(/marketing weekly/);
    expect(screen.queryByText("Decisions")).not.toBeInTheDocument();
    expect(screen.queryByText("People")).not.toBeInTheDocument();
  });

  it("calls the transcript group what Reverie calls a transcript", async () => {
    /*
     * NOT "Moments", which is the reference's label for this group. `moments`
     * is already a Reverie noun with a different meaning — the highlights,
     * bookmarks and notes somebody puts on a transcript themselves, with their
     * own table and endpoints. Two meanings for one word is worse than
     * departing from a screenshot.
     */
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");

    expect(await screen.findByText("Transcripts")).toBeInTheDocument();
    expect(screen.queryByText("Moments")).not.toBeInTheDocument();
  });

  it("says nothing about a decision having been reversed", async () => {
    /*
     * The reference marks one decision `Reversed`. `meeting_insights` stores a
     * kind and a text and nothing about a decision being revisited, so the
     * badge could only be invented — and a decision wrongly shown as current is
     * the most expensive thing this panel could get wrong.
     */
    results = withEverything();
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");

    await screen.findByText("Decisions");
    expect(screen.queryByText(/Reversed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/settled/i)).not.toBeInTheDocument();
  });

  it("finds a folder and a tag by name, and takes each somewhere real", async () => {
    /*
     * Neither is a server-side result group: `GET /search` takes a folder and a
     * tag as *filters* and never answers with one. Both lists are real and
     * already loaded for the `in:` and `tag:` completions, so matching them
     * here is a filter over held data rather than a search pretending to be one.
     */
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await user.type(screen.getByLabelText("Search"), "q4");

    // `Tags` first: `Folders` is also a heading in the resting state, so
    // waiting on it would resolve before the search had run at all.
    expect(await screen.findByText("Tags")).toBeInTheDocument();
    expect(screen.getByText("Folders")).toBeInTheDocument();

    // A tag narrows the search it was found by; there is no tag page to open.
    await user.click(screen.getByText("q4"));
    expect(push).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText("Search")).toHaveValue('tag:"q4" '));
  });

  it("runs a person's name as the search that finds what they said", async () => {
    // There is no person page in Reverie, so the row does the one honest thing
    // a name can do here.
    results = withEverything();
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await user.type(screen.getByLabelText("Search"), "product");

    await user.click(await screen.findByText("Priya Raman"));

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Search")).toHaveValue("Priya Raman");
  });
});

describe("the scope", () => {
  it("starts on everything", async () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");

    expect(await screen.findByRole("button", { name: /Scope: Everything/ })).toBeInTheDocument();
  });

  it("is not offered before there is a query to scope", () => {
    // On an empty box it would be a control that changes nothing about a list
    // of folders and actions.
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /Scope:/ })).not.toBeInTheDocument();
  });

  it("narrows the request, and keeps the query while it does", async () => {
    const user = userEvent.setup();
    results = withEverything();
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await user.type(screen.getByLabelText("Search"), "product");
    await screen.findByText("Decisions");

    await user.click(screen.getByRole("button", { name: /Scope: Everything/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Decisions/ }));

    // The words are still there — switching scope is not a new search.
    expect(screen.getByLabelText("Search")).toHaveValue("product");
    await waitFor(() => {
      const args = searchQuery.mock.calls.at(-1)?.[0] as { groups?: string[]; q: string };
      expect(args.groups).toEqual(["decisions"]);
      expect(args.q).toBe("product");
    });
    // And only that group is drawn. Scoped to the listbox, because the scope
    // control now says "Decisions" as well.
    const list = screen.getByRole("listbox", { name: "Results" });
    expect(within(list).getByText("Decisions")).toBeInTheDocument();
    expect(within(list).queryByText("Transcripts")).not.toBeInTheDocument();
  });

  it("offers no scope for a group nothing draws", async () => {
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await user.type(screen.getByLabelText("Search"), "product");
    await user.click(await screen.findByRole("button", { name: /Scope: Everything/ }));

    // Risks and commitments are answered by the API and drawn by nothing. A
    // scope that empties the panel is worse than one option fewer.
    expect(screen.queryByRole("menuitem", { name: /Risks/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Action items/ })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Transcripts/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Folders/ })).toBeInTheDocument();
  });
});

describe("handing over to Ask Reverie", () => {
  it("offers to ask, for any real query", async () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");

    expect(await screen.findByText(/Ask Reverie about “product”/)).toBeInTheDocument();
  });

  it("offers nothing to ask about an empty box", () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    expect(screen.queryByText(/Ask Reverie about/)).not.toBeInTheDocument();
  });

  it("hands the query over and goes to the Ask route", async () => {
    const onOpenChange = vi.fn();
    render(<SearchCommand open onOpenChange={onOpenChange} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");

    await userEvent.click(await screen.findByText(/Ask Reverie about “product”/));

    // The same words, through the store the Ask surfaces read, and then the
    // one Ask surface reachable from everywhere.
    expect(askReverie).toHaveBeenCalledWith("product");
    expect(push).toHaveBeenCalledWith("/ask");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("asks on the modifier, and opens the result without it", async () => {
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await user.type(screen.getByLabelText("Search"), "product");
    await screen.findByText(/marketing weekly/);

    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(askReverie).toHaveBeenCalledWith("product");
    expect(push).toHaveBeenCalledWith("/ask");
  });

  it("hands over the term rather than the filters typed around it", async () => {
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Search"), "tag:q4 product");
    await user.click(await screen.findByText(/Ask Reverie about “product”/));

    // `tag:q4` is this box's grammar and means nothing to a chat that has no
    // tag filter. The question is the words.
    expect(askReverie).toHaveBeenCalledWith("product");
  });

  it("answers nothing itself", async () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");

    // Search is retrieval; Ask is synthesis. The row says what Ask will do and
    // this panel never does it: no answer, no citation, no thread.
    const ask = await screen.findByText(/Ask Reverie about “product”/);
    expect(ask.closest("button")!.textContent).toContain("answers with citations");
    expect(screen.queryByText(/According to/)).not.toBeInTheDocument();
  });
});

describe("when nothing matched", () => {
  beforeEach(() => {
    results = NOTHING;
  });

  it("says so honestly, and invents no statistics", async () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "onboarding funnel");

    expect(await screen.findByText(/Nothing matched “onboarding funnel”/)).toBeInTheDocument();
    /*
     * The reference reads "Reverie searched 68 transcripts, 41 hours of speech,
     * every decision and every promise". This API returns no transcript count,
     * no total duration and no promises, so all four numbers would be invented.
     */
    expect(screen.queryByText(/\d+ transcripts/)).not.toBeInTheDocument();
    expect(screen.queryByText(/hours of speech/)).not.toBeInTheDocument();
    expect(screen.queryByText(/every promise/)).not.toBeInTheDocument();
    // And it does not claim nobody said the words: a title, a tag and a folder
    // name are in this search too.
    expect(screen.queryByText(/Nothing was said/)).not.toBeInTheDocument();
  });

  it("offers to ask the same question rather than leaving a dead end", async () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "onboarding funnel");

    await userEvent.click(await screen.findByText(/Ask Reverie about “onboarding funnel”/));

    expect(askReverie).toHaveBeenCalledWith("onboarding funnel");
  });

  it("asks on Enter, because there is nothing left to open", async () => {
    const user = userEvent.setup();
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await user.type(screen.getByLabelText("Search"), "onboarding funnel");
    await screen.findByText(/Nothing matched/);

    await user.keyboard("{Enter}");

    expect(askReverie).toHaveBeenCalledWith("onboarding funnel");
    expect(push).toHaveBeenCalledWith("/ask");
  });

  it("shows the same search one word shorter, when there is one", async () => {
    /*
     * A REAL BROADER SEARCH, NOT A SIMILAR-LOOKING GUESS.
     *
     * <p>The server ANDs the terms, so "onboarding funnel" returning nothing
     * says nothing about "onboarding". Dropping the last word is the same
     * search, wider — which is why its results can be shown as results.
     */
    byQuery = { "": BROWSE, onboarding: response() };
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "onboarding funnel");

    expect(await screen.findByText(/broader search “onboarding”/)).toBeInTheDocument();
    expect(screen.getByText(/marketing weekly/)).toBeInTheDocument();
  });

  it("offers no broader search for a single word, and no invented ones", async () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "zzzz");

    await screen.findByText(/Nothing matched/);
    // The reference's "Or try onboarding · language step · usage bar" chips
    // come from a suggestion engine this product does not have. A clean zero
    // state with Ask beats four invented words.
    expect(screen.queryByText(/broader search/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Or try$/)).not.toBeInTheDocument();
  });
});

describe("guardrails", () => {
  it("introduces none of the concepts the screenshots invented", async () => {
    /*
     * Memory, Promises, tracked subjects and URL import are all in the
     * reference and none of them are in Reverie. Asserted across both states,
     * because each is one plausible-looking row away.
     */
    results = withEverything();
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    const rest = document.body.textContent ?? "";

    await userEvent.type(screen.getByLabelText("Search"), "product");
    await screen.findByText(/marketing weekly/);
    const typed = document.body.textContent ?? "";

    for (const text of [rest, typed]) {
      expect(text).not.toMatch(/Memory/i);
      expect(text).not.toMatch(/promise/i);
      expect(text).not.toMatch(/tracked subject/i);
      expect(text).not.toMatch(/decision drift/i);
      expect(text).not.toMatch(/or a link/i);
      expect(text).not.toMatch(/hours of speech/i);
    }
  });

  it("wears the Reverie AI mark on the Ask row and nowhere else", async () => {
    /*
     * The orb means "you are entering Reverie's intelligence", not "a model was
     * involved in producing this". A transcript passage was found by Postgres.
     */
    results = withEverything();
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");
    await screen.findByText(/marketing weekly/);

    const marks = document.body.querySelectorAll("[data-ai-mark]");
    expect(marks).toHaveLength(1);
    expect(marks[0].closest("button")!.textContent).toContain("Ask Reverie about");
  });

  it("has a name, a description and one listbox for its results", async () => {
    render(<SearchCommand open onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search"), "product");

    // Radix supplies the dialog semantics; what is added is the combobox
    // relationship, because a listbox driven without moving focus cannot be
    // described any other way.
    expect(await screen.findByRole("dialog", { name: "Search Reverie" })).toBeInTheDocument();
    const input = screen.getByLabelText("Search");
    expect(input).toHaveAttribute("role", "combobox");
    expect(input).toHaveAttribute("aria-controls", "search-results");
    await waitFor(() =>
      expect(input.getAttribute("aria-activedescendant")).toMatch(/^mention-/),
    );
  });
});
