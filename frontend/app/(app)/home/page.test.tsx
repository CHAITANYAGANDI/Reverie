import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MeetingResponse, MeetingListQuery, Page } from "@/lib/types";

/**
 * Now — the greeting, the list, and the two screens an empty list can be.
 *
 * <h2>What left this file, and what it left behind</h2>
 *
 * <p>There was a scope picker above the list with two options: <i>Recent
 * Conversations</i> (`unfiled=true` — everything outside your folders) and
 * <i>All Conversations</i>. It is gone, and so is the parameter: <i>All</i> is
 * a page now (**Library**), and <i>Recent</i> asks for the newest twenty
 * <em>wherever they are filed</em>. Roughly half the tests below used to drive
 * that control or explain what it hid.
 *
 * <p>Three groups went, and each is accounted for:
 *
 * <ul>
 *   <li><b>"the wire says unfiled"</b> — <b>inverted</b>, not dropped. The
 *       assertion now is that this page never sends the parameter, which is the
 *       guard that makes every screen below unnecessary: with no filter, no
 *       filed meeting can be missing from Now.</li>
 *   <li><b>"a stored choice survives a visit and not a sign-in"</b> — re-asked
 *       of the date window. The production defect was a value stored under
 *       session 1 still being reported as ready under session 2, which is a
 *       property of `useStickyPreference` and not of the scope. The window goes
 *       through the identical machinery.</li>
 *   <li><b>"an empty Recent must say which filter emptied it"</b> — the three
 *       screens that answered this (everything-is-filed, the contradiction, the
 *       unresolved probe) are <b>unreachable</b>, because the filter they
 *       explained does not exist. The probe that fed them is gone with them.
 *       The rule underneath — <i>only a settled, successful, genuinely empty
 *       response may claim an empty account</i> — is untouched and has a whole
 *       describe block of its own below. That is the rule the production bug
 *       was about.</li>
 * </ul>
 *
 * <p>What can no longer be asked here is what happens when All is chosen. That
 * is `app/(app)/library/page.test.tsx`.
 */
const query = vi.hoisted(() => ({ last: null as MeetingListQuery | null }));
/*
 * EVERY PER-MEETING REQUEST THIS PAGE MAKES.
 *
 * <p>Recorded so a list of twenty rows can be asserted to cost the same two
 * calls as a list of one. The reference draws a sentence of summary under each
 * title and there is no summary on the list payload, so the tempting fix is a
 * request per row -- which on Home is twenty round trips before the page is
 * readable. Entries with `skip` are not requests: a finished meeting opens no
 * poll, and `useLiveMeetingStatus` passes `skip: done` for exactly that.
 */
const perMeeting = vi.hoisted(() => ({ calls: [] as { id: string; skip: boolean }[] }));
/*
 * What state the margin's query is in. Its own file drives the component
 * directly; here it decides which of loading, failed and settled Home is
 * laying out around -- the geometry has to be the same in all three.
 */
const actionItems = vi.hoisted(() => ({ state: "ready" as "ready" | "loading" | "error" }));
/** The retry button is wired to this. */
const refetch = vi.hoisted(() => vi.fn());

let rows: MeetingResponse[];
/** How many exist behind the page. Drives the "showing the newest N" line. */
let total: number | null;
let loading: boolean;
/* ---------------------------------------------------------------------------
 * The states a naive mock cannot express.
 *
 * A mock returning `{ data, isLoading }` is exactly the subset of RTK Query the
 * page used when it had this bug -- so it agreed with the bug. A failed request
 * and an empty one were indistinguishable to both, and no test could tell them
 * apart either.
 * ------------------------------------------------------------------------ */

/** A refetch is in flight over whatever is cached. */
let fetching: boolean;
/** The request settled as rejected. */
let errored: boolean;
/** Nothing usable is cached -- `data` is undefined, not an empty page. */
let noData: boolean;
/** What Settings knows about the person. The masthead greets from it. */
let displayName: string | null;
/** The standalone action items. Empty unless a test puts something on the list. */
let tasks: { id: string; title: string; status: string }[];

function aPage(content: MeetingResponse[], total = content.length): Page<MeetingResponse> {
  return { content, page: 0, size: 50, totalElements: total, totalPages: 1 };
}

/** An RTK Query result with every flag the page reads, kept mutually consistent. */
function result<T>(data: T | undefined, opts: {
  isLoading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
} = {}) {
  const isLoading = opts.isLoading ?? false;
  const isFetching = opts.isFetching ?? isLoading;
  const isError = opts.isError ?? false;
  return {
    data,
    isLoading,
    isFetching,
    isError,
    // RTK sets exactly one of these. Success means settled and not rejected --
    // note it stays true during a background refetch that has stale data, which
    // is why `isFetching` has to be read separately.
    isSuccess: !isLoading && !isError && data !== undefined,
    isUninitialized: false,
    error: isError ? { status: 500, data: { message: "boom" } } : undefined,
    refetch,
  };
}

vi.mock("@/lib/api", () => ({
  // The per-meeting poll that a processing row runs underneath its socket
  // subscription. Home lists meetings; only the rows that are still being
  // processed reach for this, and none of these tests is about one -- so what
  // it is here for is to be counted. See `perMeeting` above.
  useGetMeetingQuery: (id: string, options?: { skip?: boolean }) => {
    perMeeting.calls.push({ id, skip: options?.skip === true });
    return { data: undefined };
  },
  useGetMeetingsQuery: (q: MeetingListQuery, options?: { skip?: boolean }) => {
    if (options?.skip) {
      return {
        data: undefined,
        isLoading: false,
        isFetching: false,
        isError: false,
        isSuccess: false,
        isUninitialized: true,
        error: undefined,
        refetch,
      };
    }
    query.last = q;
    // Filtering happens in the query, so the mock returns what it was asked
    // for. Asserting on the request is the point: a client-side filter would
    // pass a test that fed it both kinds of row and hid one.
    if (loading) return result<Page<MeetingResponse>>(undefined, { isLoading: true });
    // An error keeps whatever was cached -- RTK does not throw the last good
    // page away -- so `noData` is what separates "failed with nothing" from
    // "failed over meetings already on screen".
    const data = noData ? undefined : aPage(rows, total ?? rows.length);
    return result(data, { isFetching: fetching, isError: errored });
  },
  // The masthead's greeting. Settings first, then the identity provider, then
  // nothing -- never the user id.
  useGetPreferencesQuery: () => ({ data: displayName === null ? {} : { displayName } }),
  /*
   * The margin's own list. It used to live behind `SidePane`, which these tests
   * stubbed away wholesale; it is part of the page now, so its query has to be
   * answered.
   *
   * <p>Settled, and empty by default, because most of these tests are not
   * about it — the action items have their own file. Empty no longer decides
   * Home's composition: the margin is drawn either way now, which is the
   * correction the describe block at the bottom of this file is about.
   */
  useGetActionItemsQuery: () => {
    const loadingNow = actionItems.state === "loading";
    const erroredNow = actionItems.state === "error";
    return {
      // Undefined rather than an empty page in both unsettled states, because
      // that is what RTK holds and it is the distinction `resourceState`
      // exists to keep: no answer is not the answer "none".
      data: loadingNow || erroredNow ? undefined : { content: tasks, totalElements: tasks.length },
      isLoading: loadingNow,
      isFetching: loadingNow,
      isError: erroredNow,
      isSuccess: !loadingNow && !erroredNow,
      isUninitialized: false,
      refetch: () => {},
    };
  },
  usePatchActionItemMutation: () => [vi.fn(), { isLoading: false }],
  useCreateStandaloneActionItemMutation: () => [vi.fn(), { isLoading: false }],
  // The margin's row menu. One real action behind a real endpoint, which is
  // the only reason the menu is drawn -- see components/v2/now/action-items.
  useDeleteActionItemMutation: () => [
    vi.fn(() => ({ unwrap: () => Promise.resolve() })),
    { isLoading: false },
  ],
}));

// `isLoaded` and `sessionKey` are not decoration: the date window is remembered
// per sign-in, and nothing reads what was remembered until auth says which
// sign-in this is.
const auth = vi.hoisted(() => ({ sessionKey: "sess_1" }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    userId: "usr_1",
    mode: "clerk",
    profile: { name: "", email: "", imageUrl: "" },
    sessionKey: auth.sessionKey,
    isLoaded: true,
  }),
}));
/*
 * Now mounts no pane. The stub stays because `SidePane` is still the meeting
 * page's, and a test file that silently starts rendering a real one because a
 * stub was tidied away is how the pane would come back unnoticed. The two panel
 * stubs that used to sit here went with the panels.
 */
vi.mock("@/components/side-pane", () => ({ SidePane: () => null }));

import HomePage from "@/app/(app)/home/page";

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

/**
 * What the mock last recorded.
 *
 * <p>A function, not `query.last` directly: a test that clears it and then
 * re-renders is narrowed to `null` by the compiler, which cannot know that
 * rendering writes to it. Reading through a call returns the declared type.
 */
function lastQuery(): MeetingListQuery | null {
  return query.last;
}

/** The per-meeting requests that were actually made, skips excluded. */
function perMeetingCalls(): { id: string; skip: boolean }[] {
  return perMeeting.calls.filter((c) => !c.skip);
}

beforeEach(() => {
  query.last = null;
  perMeeting.calls = [];
  actionItems.state = "ready";
  refetch.mockClear();
  loading = false;
  fetching = false;
  errored = false;
  noData = false;
  rows = [aMeeting()];
  total = null;
  displayName = null;
  tasks = [];
  // The window outlives a page now, so without this it would outlive a test and
  // the order the suite happened to run in would decide what Home opened on.
  // See lib/preference-store.ts.
  window.localStorage.clear();
  auth.sessionKey = "sess_1";
});

/**
 * The list this page shows, and the parameter it must never send again.
 *
 * <p>`unfiled=true` is what Recent used to mean: a folder filter under a name
 * about time. It made this page lie in a way nobody would report as a bug —
 * record a meeting inside a folder, and it is filed there and gone from Recent,
 * which is not what recent means.
 *
 * <p>So the assertion is inverted rather than deleted, and it is on the wire
 * rather than on the label. Both halves have been wrong at different times: a
 * label reading Recent over a query that fetched everything, and a query
 * narrowed in the browser over rows that had already come back.
 *
 * <p>This test is load-bearing for the whole file. Three empty-state screens
 * were deleted along with `unfiled`, and a fourth went with the date window,
 * on the grounds that nothing here can hide a meeting any more. This page now
 * sends `page` and `size` and nothing else. If any narrowing parameter comes
 * back, that stops being true and those screens are needed again — so this is
 * the guard that has to fail first.
 */
describe("what Home asks for", () => {
  it("never asks the server to hide filed conversations", () => {
    render(<HomePage />);

    expect(lastQuery()?.unfiled).toBeUndefined();
  });

  it("keeps showing a conversation that has been filed into a folder", () => {
    /*
     * THE GUARANTEE, AS A ROW RATHER THAN AS A SENTENCE.
     *
     * <p>This is the bug in the form somebody would actually hit it: record a
     * meeting inside a folder, and under `unfiled=true` it was filed there and
     * gone from the page called Recent. `projectId` is what "filed" means on
     * the wire -- see `MeetingListQuery.unfiled` -- so a row carrying one must
     * still be on this page.
     *
     * <p>The lede used to say so in words and no longer does; the approved
     * copy is the reference's sentence. This assertion and the two beside it
     * are what hold the promise now, which is the right place for it: prose
     * cannot fail when the query changes underneath it.
     */
    rows = [
      aMeeting({ id: "mtg_filed", title: "Filed away", projectId: "prj_1" }),
      aMeeting({ id: "mtg_loose", title: "Never filed", projectId: null }),
    ];
    render(<HomePage />);

    expect(screen.getByRole("link", { name: /Filed away/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Never filed/ })).toBeInTheDocument();
    // And nothing that could have hidden either of them went over the wire.
    expect(lastQuery()?.unfiled).toBeUndefined();
    expect(lastQuery()?.from).toBeUndefined();
    expect(lastQuery()?.to).toBeUndefined();
    // The whole query, so a new narrowing parameter cannot arrive unnoticed.
    expect(Object.keys(lastQuery() ?? {}).sort()).toEqual(["page", "size"]);
  });

  it("asks for a short page, which is what makes it recent", () => {
    // The bound is the difference between this page and Library — both ask the
    // same question of the same endpoint, and this one asks for the top of the
    // answer. A page of fifty here would make the two lists the same list.
    render(<HomePage />);

    expect(lastQuery()?.size).toBe(20);
    expect(lastQuery()?.page).toBe(0);
  });

  it("does not offer a way to widen it to the whole workspace", () => {
    // That is Library, a place in the band. A second control here doing the
    // same thing is the duplicate archive this redesign exists to remove.
    render(<HomePage />);

    expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();
    expect(screen.queryByText("All Conversations")).not.toBeInTheDocument();
  });
});

/**
 * The label under the heading, and the line under the list.
 *
 * <p>The label used to carry the whole explanation for a list that hid filed
 * meetings, and the file it lived in said in as many words: <i>do not drop
 * this line</i>. It has nothing to explain away now — so what it says instead
 * is the one thing about this list that is not obvious, which is that filing a
 * conversation does not take it off the page.
 *
 * <p>The truncation line is the new load-bearing one. A page showing twenty of
 * two hundred conversations, with nothing at the bottom saying so, is a list
 * somebody scrolls to the end of and believes — the same lie as a filter that
 * does not name itself, one level along.
 */
describe("the lines that explain the list", () => {
  it("says what the page is, in the approved words", () => {
    /*
     * MOVED, NOT DROPPED. This used to assert `/wherever they are filed/` in
     * the lede -- the clause that replaced `unfiled=true`, kept in the copy on
     * the grounds that it was the page's one statement of the guarantee.
     *
     * <p>It was the wrong place for it. A subtitle restating a guarantee does
     * not hold the guarantee: the query does, and to somebody who never saw
     * the bug the clause reads as an odd thing to volunteer. So the assertion
     * is on the real behaviour now, in `what Home asks for` above -- the wire
     * carries no narrowing parameter, and a conversation that HAS been filed
     * still appears in the list -- and what is checked here is the copy, which
     * is the approved sentence exactly.
     */
    render(<HomePage />);

    expect(
      screen.getByText("Recent conversations and anything that needs your attention."),
    ).toBeInTheDocument();
  });

  it("no longer claims the list is what is outside your folders", () => {
    // It was true and is not. Leaving it would describe a filter that was
    // removed precisely because the description was the only thing carrying it.
    render(<HomePage />);

    expect(screen.queryByText(/outside your folders/i)).not.toBeInTheDocument();
  });

  it("admits when it is showing only the newest of many", () => {
    rows = Array.from({ length: 20 }, (_, i) => aMeeting({ id: `mtg_${i}`, title: `Meeting ${i}` }));
    total = 214;
    render(<HomePage />);

    expect(screen.getByText(/Showing the 20 most recent of/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All of them are in Library/ })).toHaveAttribute(
      "href",
      "/library",
    );
  });

  it("says nothing about truncation when nothing is truncated", () => {
    // A page that always claims to be a subset is as uninformative as one that
    // never does.
    rows = [aMeeting()];
    render(<HomePage />);

    expect(screen.queryByText(/most recent of/)).not.toBeInTheDocument();
  });
});

describe("the list", () => {
  it("shows every row it was given", () => {
    rows = Array.from({ length: 25 }, (_, i) => aMeeting({ id: `mtg_${i}`, title: `Meeting ${i}` }));

    render(<HomePage />);

    // "For you" cut the list at twenty. Nothing said so, so the twenty-first
    // meeting of the day was simply absent.
    expect(screen.getByText("Meeting 24")).toBeInTheDocument();
  });
});

/**
 * Where you are in the day, and whether anything needs a person.
 *
 * <p>The V2 concept had a "Needs you" block here built from cross-meeting
 * memory, which does not exist — the migrations dropped the tables. What
 * replaced it is derived from the list already on screen and costs no request,
 * which is the constraint that makes it impossible for it to be wrong.
 */
describe("the masthead", () => {
  it("greets by first name", async () => {
    displayName = "Priya Raman";
    render(<HomePage />);

    // First name only. "Good morning, Priya Raman" is a form letter.
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      /^Good (morning|afternoon|evening), Priya\.$/,
    );
  });

  it("greets without a name rather than with an id", async () => {
    // An opaque key in the place a name goes does not read as "you". It reads
    // as somebody else's account, which is exactly how it was reported.
    render(<HomePage />);

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/^Good (morning|afternoon|evening)\.$/);
    expect(screen.queryByText(/usr_1/)).not.toBeInTheDocument();
  });

  it("gathers what is still being made under its own heading", async () => {
    rows = [
      aMeeting({ id: "a", status: "TRANSCRIBING" }),
      aMeeting({ id: "b", status: "SUMMARIZING" }),
      aMeeting({ id: "c", status: "READY" }),
    ];
    render(<HomePage />);

    /*
     * The count used to be a sentence in the masthead, several sections above
     * the rows it was counting. It is now the heading over exactly those rows,
     * which is the one place it cannot drift from them.
     */
    expect(await screen.findByRole("heading", { name: "In progress" })).toBeInTheDocument();
    expect(screen.getByText("2 conversations are still being made")).toBeInTheDocument();
  });

  it("puts what failed under Needs attention, and nothing else there", async () => {
    // The one thing on this screen that genuinely needs a human, and previously
    // findable only by scrolling for a red badge.
    rows = [
      aMeeting({ id: "a", status: "FAILED" }),
      aMeeting({ id: "b", status: "TRANSCRIBING" }),
    ];
    render(<HomePage />);

    expect(await screen.findByRole("heading", { name: "Needs attention" })).toBeInTheDocument();
    expect(screen.getByText("1 conversation needs attention")).toBeInTheDocument();

    /*
     * A conversation still being made is the product working. Filing it under a
     * heading that says it needs a person is how a real failure gets scrolled
     * past, so the two are counted separately and never merged.
     */
    expect(screen.getByRole("heading", { name: "In progress" })).toBeInTheDocument();
    expect(screen.getByText("1 conversation is still being made")).toBeInTheDocument();
  });

  it("says nothing at all when nothing needs anything", async () => {
    rows = [aMeeting({ status: "READY" })];
    render(<HomePage />);

    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/still being made/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Needs attention" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "In progress" })).not.toBeInTheDocument();
  });

  it("claims nothing before the list has arrived", () => {
    // `undefined` is not an empty list. A masthead that reports "0 still being
    // made" from a request that has not answered is the same class of bug as an
    // empty state over a failed one.
    loading = true;
    render(<HomePage />);

    expect(screen.queryByText(/still being made/)).not.toBeInTheDocument();
  });
});

/**
 * Nothing to show, and which of the two reasons it is.
 *
 * <p>There were four screens here. Three of them existed to explain
 * `unfiled=true` — that the meetings were in folders, or that they could not
 * be because there are none, or that the probe deciding between those had not
 * answered. The filter is gone and so are they: nothing on this page hides a
 * conversation, so an empty list means the window is empty or the account is,
 * and both are known from the response already on screen.
 *
 * <p>The rule those screens were built on is a different thing and is not
 * touched. It has its own block further down: an empty list is a *claim about
 * the account*, and only a settled, successful, genuinely empty response may
 * make it.
 */
describe("when there is nothing to show", () => {
  /*
   * ONE EMPTY SCREEN, WHERE THERE WERE TWO.
   *
   * <p>Two tests stood here: a window that emptied the list said "Nothing from
   * Today" and offered a way to widen it, and only a genuinely empty account
   * got the first-minute screen. The window is gone, so there is one way for
   * this list to be empty and it is the account — which is what makes the
   * remaining assertion unconditional rather than a branch.
   */
  it("says the account is empty, because that is the only way it can be", async () => {
    rows = [];

    render(<HomePage />);

    /*
     * The first minute, from `09-now-first.html`: the heading carries it rather
     * than a bordered box in the middle of the page. `find`, because the
     * greeting waits for a clock the server does not have.
     */
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      /^Nothing here yet/,
    );
    expect(screen.getByRole("link", { name: /Record a meeting/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Import a recording/ })).toBeInTheDocument();
  });

  it("never claims a folder is hiding anything", () => {
    // The screen this replaces. It was correct while Recent meant unfiled;
    // saying it now would send somebody hunting through folders for meetings
    // that are already on this page.
    rows = [];

    render(<HomePage />);

    expect(screen.queryByText("Everything is in a folder")).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing outside your folders")).not.toBeInTheDocument();
  });

  it("points a genuinely empty account at the two ways to start", () => {
    rows = [];

    render(<HomePage />);

    expect(screen.getByRole("link", { name: /Record/ })).toHaveAttribute(
      "href",
      "/record?r=%2Fhome",
    );
    expect(screen.getByRole("link", { name: /Import/ })).toHaveAttribute("href", "/upload");
  });
});


/**
 * Never tell somebody their archive is empty because a request failed.
 *
 * <h2>The bug</h2>
 *
 * <p>Home showed "No conversations — Record / Import" to accounts with hundreds
 * of meetings, over a picker still reading "All Conversations" and "Any time".
 *
 * <p>It decided with `groupByDay(data?.content ?? [])` and
 * `groups.length === 0`, guarded only by `isLoading`. The `?? []` is the whole
 * fault: it reads *no answer* as *the answer is none*. A failed request, a
 * refetch in flight, and a genuinely empty workspace all became the same screen
 * — and `isLoading` does not cover the first two, because it is true only for
 * the very first load of a cache entry. A refetch sets `isFetching`; an error
 * sets neither.
 *
 * <p>The rule these pin: the empty screen is a *claim about the account*, and
 * only a settled, successful, genuinely empty response is allowed to make it.
 */
describe("what Home shows when the request does not simply succeed", () => {
  /* The first-minute screen's own call to action. The heading that used to
     carry this ("No conversations") is gone — the masthead says it now, and it
     waits for a clock, which a synchronous assertion cannot. This link does
     not. */
  const EMPTY = /Record a meeting/;
  const LOAD_ERROR = /couldn.t load your conversations/i;

  it("does not claim an empty account when the request failed and left no data", () => {
    // The production symptom, at its root: data undefined, isLoading false.
    errored = true;
    noData = true;

    render(<HomePage />);

    expect(screen.queryByRole("link", { name: EMPTY })).not.toBeInTheDocument();
    expect(screen.getByText(LOAD_ERROR)).toBeInTheDocument();
  });

  it("offers a retry on a failed request, wired to refetch", async () => {
    errored = true;
    noData = true;

    render(<HomePage />);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("announces the failure to assistive technology", () => {
    errored = true;
    noData = true;

    render(<HomePage />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("keeps backend detail off the screen", () => {
    // The mock's error carries `status: 500` and `message: "boom"`. Neither is
    // any use to a reader, and both describe the shape of the backend on a page
    // anybody signed in can reach.
    errored = true;
    noData = true;

    render(<HomePage />);

    expect(screen.queryByText(/500/)).not.toBeInTheDocument();
    expect(screen.queryByText(/boom/i)).not.toBeInTheDocument();
  });

  it("does not claim an empty account when there is simply no data yet", () => {
    /*
     * The exact `?? []` bug, with no error to mask it. Every other test here
     * that has no data also has an error, and the error branch answers first --
     * so mutating the rule to treat undefined as empty left all of them passing.
     * Measured, not assumed. See lib/home-list-state.test.ts.
     */
    noData = true;

    render(<HomePage />);

    expect(screen.queryByRole("link", { name: EMPTY })).not.toBeInTheDocument();
  });

  it("shows the skeleton before the first response, not an empty message", () => {
    loading = true;

    const { container } = render(<HomePage />);

    expect(screen.queryByRole("link", { name: EMPTY })).not.toBeInTheDocument();
    expect(screen.queryByText(LOAD_ERROR)).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("does not confirm an empty account while a refetch over an empty page is in flight", () => {
    // The cached page says zero, but a request that may replace it is running.
    // Announcing an empty account now is a guess that is about to be checked.
    rows = [];
    fetching = true;

    render(<HomePage />);

    expect(screen.queryByRole("link", { name: EMPTY })).not.toBeInTheDocument();
  });

  it("keeps meetings on screen during a background refetch", () => {
    // Replacing a list somebody is reading with a skeleton, because a refresh
    // they did not ask for is running, is the other half of this bug.
    rows = [aMeeting({ id: "mtg_keep", title: "Still here" })];
    fetching = true;

    render(<HomePage />);

    expect(screen.getByText("Still here")).toBeInTheDocument();
  });

  it("keeps meetings on screen when a background refetch fails", () => {
    // Known-good rows beat a failed refresh. Throwing away the good copy
    // because the new one did not arrive is strictly worse than showing it.
    rows = [aMeeting({ id: "mtg_keep", title: "Still here" })];
    errored = true;

    render(<HomePage />);

    expect(screen.getByText("Still here")).toBeInTheDocument();
    expect(screen.queryByText(LOAD_ERROR)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: EMPTY })).not.toBeInTheDocument();
  });

  it("allows the empty screen once the request settles successfully with nothing", () => {
    // The fix must not make the empty state unreachable -- that would trade a
    // false negative for a permanent skeleton on a genuinely new account.
    rows = [];

    render(<HomePage />);

    expect(screen.getByRole("link", { name: EMPTY })).toBeInTheDocument();
  });

  it("shows meetings on a successful non-empty response", () => {
    rows = [aMeeting({ id: "mtg_a", title: "Tuesday design review" })];

    render(<HomePage />);

    expect(screen.getByText("Tuesday design review")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: EMPTY })).not.toBeInTheDocument();
  });
});

/**
 * A meeting still being made, in the list it already belongs to.
 *
 * <p>The rule these hold: the processing row is the *same* row. Not a separate
 * "Processing" section above the list, not a card of its own, and not a second
 * bar floating over the corner of the page — one meeting, one place, which it
 * keeps from the moment it is saved until it is ready.
 */
describe("a meeting that is still processing", () => {
  it("says so inline, with the stage, and invents no percentage", () => {
    rows = [aMeeting({ id: "mtg_p", title: "Recording — 8/26/2026", status: "SUMMARIZING" })];

    render(<HomePage />);

    // "Processing · Generating summary…", on the row's own metadata line, so a
    // row being made is exactly as tall as a finished one.
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByText("Generating summary…")).toBeInTheDocument();

    /*
     * No bar. The one it replaces read a percentage derived from *which stage*
     * the job was in, which is a figure nobody measured — the server reports a
     * stage, and the stage is what is shown.
     */
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("keeps the title, the time and the duration it always had", () => {
    // Additive. The row does not become a different kind of object while it is
    // being made.
    rows = [aMeeting({ id: "mtg_p", title: "Recording — 8/26/2026",
      status: "TRANSCRIBING", durationSeconds: 16 })];

    render(<HomePage />);

    expect(screen.getByText("Recording — 8/26/2026")).toBeInTheDocument();
    expect(screen.getByText(/0m 16s/)).toBeInTheDocument();
  });

  it("still opens the normal meeting page when clicked", () => {
    // Not a disabled row, and not a different route. The meeting exists and has
    // a page from the moment it is created.
    rows = [aMeeting({ id: "mtg_p", title: "Recording", status: "QUEUED" })];

    render(<HomePage />);

    expect(screen.getByRole("link", { name: /Recording/ })).toHaveAttribute(
      "href",
      "/meetings/mtg_p",
    );
  });

  it("draws no processing UI on a finished meeting", () => {
    rows = [aMeeting({ id: "mtg_r", title: "Done", status: "READY" })];

    render(<HomePage />);

    expect(screen.queryByText("Processing")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("draws no processing UI on a failed meeting either", () => {
    // FAILED is terminal. A bar over it would be a job that is going to finish.
    rows = [aMeeting({ id: "mtg_f", title: "Broken", status: "FAILED" })];

    render(<HomePage />);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    // The status, not a cause. A cause invented to fill the line would send
    // somebody looking for a problem that may not be theirs.
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("marks the rows being made and leaves the rest alone", () => {
    rows = [
      aMeeting({ id: "mtg_a", title: "One", status: "TRANSCRIBING" }),
      aMeeting({ id: "mtg_b", title: "Two", status: "READY" }),
      aMeeting({ id: "mtg_c", title: "Three", status: "EXTRACTING" }),
    ];

    render(<HomePage />);

    // Two of the three, and the finished one carries no state at all.
    expect(screen.getAllByText("Processing")).toHaveLength(2);
    expect(screen.getByText("2 conversations are still being made")).toBeInTheDocument();
  });
});


/**
 * The composition Now was corrected to, and the things it must never grow back.
 *
 * <p>Two shapes were removed and both are the kind that return quietly. The
 * persistent AI pane beside the list was a second application standing next to
 * the first — and a second workspace chat, with a whole destination of its own
 * already in the band. The rounded card per conversation was the V1 list
 * wearing V2 colours.
 *
 * <p>What replaces them is the reference geometry: a measure, a margin, and one
 * scroll. The margin is part of this page, which is the whole distinction — a
 * pane has a border and a scrollbar and belongs to the shell; a margin stops
 * where its content stops.
 */
describe("the shape of Now", () => {
  it("lays the page out on Home's own frame, not the reading spread", async () => {
    /*
     * `.v2-spread` is built around `--measure`, the 680px reading column, and
     * this page widened it to 780 with a variable override. Home reads nothing
     * -- it is a list of rows and a margin -- and at the reference width the
     * spread put the whole composition in the middle of the window with 236px
     * of nothing down each side. `.v2-home` is the frame with the reference's
     * numbers in it; see app/globals.css.
     */
    const { container } = render(<HomePage />);
    await screen.findByRole("heading", { level: 1 });

    expect(container.querySelector(".v2-home")).toBeInTheDocument();
    expect(container.querySelector(".v2-spread")).toBeNull();
    // And no `--measure` override left behind on it.
    expect(container.innerHTML).not.toContain("--measure:");
  });

  it("puts the two regions in one grid row, so neither spans the other", async () => {
    /*
     * The masthead used to carry `min-[1160px]:col-span-2`, which is why the
     * margin began under the Ask launcher rather than beside the greeting --
     * and why the drawing before that needed a 186px spacer to fake the
     * alignment by hand. Both are gone, and both must stay gone: the alignment
     * is the grid's now and cannot drift.
     */
    const { container } = render(<HomePage />);
    await screen.findByRole("heading", { level: 1 });

    const frame = container.querySelector(".v2-home");
    expect(frame).toBeInTheDocument();
    expect(frame!.innerHTML).not.toContain("col-span-2");
    // Two children, and the second is the margin.
    expect(frame!.children).toHaveLength(2);
    expect(frame!.children[1].hasAttribute("data-home-margin")).toBe(true);
  });

  it("lays one wash behind the whole page rather than one per column", async () => {
    /*
     * A gradient per region puts a seam down the middle of the page, and a
     * fill behind the margin makes it a panel -- which is the one thing this
     * composition is not. One element, before the frame, so ordinary paint
     * order puts it underneath without a `z-index` anywhere.
     */
    const { container } = render(<HomePage />);
    await screen.findByRole("heading", { level: 1 });

    const washes = container.querySelectorAll(".v2-ambient");
    expect(washes).toHaveLength(1);
    expect(washes[0].getAttribute("aria-hidden")).toBe("true");
    expect(washes[0].className).toContain("pointer-events-none");
    // Behind, not inside: the frame is its next sibling.
    expect(washes[0].nextElementSibling?.className).toContain("v2-home");
  });

  it("mounts no side pane, so the margin cannot become a second application", async () => {
    render(<HomePage />);
    await screen.findByRole("heading", { level: 1 });

    /*
     * `SidePane` is stubbed to render nothing in this file, so its absence
     * cannot be seen in the DOM. What can be seen is the tab bar that only ever
     * existed to choose between the two things inside it.
     */
    expect(screen.queryByRole("tab", { name: /AI Chat/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Action Items/i })).not.toBeInTheDocument();
  });

  it("keeps the workspace Ask reachable, once", async () => {
    render(<HomePage />);
    await screen.findByRole("heading", { level: 1 });

    // One door to one Ask. Not a composer that starts a thread of its own here
    // and a second thread at /ask.
    const launcher = screen.getByRole("link", { name: /Ask Reverie about your meetings/ });
    expect(launcher).toHaveAttribute("href", "/ask");
    expect(screen.queryByRole("textbox", { name: /ask/i })).not.toBeInTheDocument();
  });

  it("draws one glyph in the launcher and no keyboard badge", async () => {
    /*
     * The reference puts a Reverie mark at each end of this control and a `⌘ J`
     * keycap inside it. Two marks read as a logo pasted twice, and a keycap on
     * a link that navigates promises a shortcut that does not exist.
     */
    const { container } = render(<HomePage />);
    await screen.findByRole("heading", { level: 1 });

    const launcher = screen.getByRole("link", { name: /Ask Reverie about your meetings/ });
    expect(launcher.querySelectorAll("svg")).toHaveLength(1);
    expect(launcher.querySelector("kbd")).toBeNull();
    expect(container.querySelector("kbd")).toBeNull();
  });

  it("keeps your own list on the page rather than behind a tab", async () => {
    tasks = [{ id: "ai_1", title: "Book the room", status: "OPEN" }];
    render(<HomePage />);
    await screen.findByRole("heading", { level: 1 });

    expect(screen.getByRole("heading", { name: "Action items" })).toBeInTheDocument();
  });

  it("keeps the margin at zero items, and does not re-centre the page", async () => {
    /*
     * INVERTED, DELIBERATELY. This used to assert the opposite: no standalone
     * items drew no margin at all and the conversation list re-centred, on the
     * grounds that a column existing to say it is empty is worse than no
     * column.
     *
     * <p>That gave Home two different compositions decided by a list most
     * accounts' is empty -- so adding the first action item moved every row on
     * the screen, and the page somebody uses twenty times a day changed shape
     * under them. The column is part of Home's frame now. What is empty is the
     * list inside it, and the sentence says so.
     */
    tasks = [];
    const { container } = render(<HomePage />);
    await screen.findByRole("heading", { level: 1 });

    expect(screen.getByRole("heading", { name: "Action items" })).toBeInTheDocument();
    // Both counts, at zero. They are facts about the list, and true ones.
    expect(screen.getByRole("button", { name: /Open \(0\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Completed \(0\)/ })).toBeInTheDocument();
    // The frame is the same frame, with the margin in it either way.
    expect(container.querySelector("[data-home-margin]")).toBeInTheDocument();
  });

  it("keeps the margin while the list is still loading, and when it fails", async () => {
    // The geometry has to be stable across every state this column can be in,
    // or the page moves as answers arrive.
    tasks = [];
    actionItems.state = "loading";
    const { container, unmount } = render(<HomePage />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("heading", { name: "Action items" })).toBeInTheDocument();
    expect(container.querySelector("[data-home-margin]")).toBeInTheDocument();
    // Nothing is claimed about the counts before an answer arrives.
    expect(screen.queryByRole("button", { name: /Open \(/ })).not.toBeInTheDocument();
    unmount();

    actionItems.state = "error";
    render(<HomePage />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("heading", { name: "Action items" })).toBeInTheDocument();
    expect(screen.getByText(/Couldn't load your action items/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open \(/ })).not.toBeInTheDocument();
  });

  it("carries no filter row where the reference draws one", async () => {
    /*
     * The reference puts Recent / My conversations / Shared with me / Starred
     * between the launcher and the list. None of them exists: Home asks for
     * the newest RECENT_SIZE conversations and Library is the archive with the
     * filtering in it.
     *
     * <p>Asserted as controls rather than as words, because "Recent
     * conversations..." is the subtitle and must survive.
     */
    tasks = [{ id: "ai_1", title: "Book the room", status: "OPEN" }];
    render(<HomePage />);
    await screen.findByRole("heading", { level: 1 });

    for (const label of [/^Recent$/, /My conversations/, /Shared with me/, /Starred/]) {
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
  });

  it("sells nothing in the margin", async () => {
    // The reference ends the margin with "Stay on top of your work" and a
    // "Learn more" link. Marketing inside the product, standing where
    // whitespace belongs.
    tasks = [{ id: "ai_1", title: "Book the room", status: "OPEN" }];
    render(<HomePage />);
    await screen.findByRole("heading", { level: 1 });

    expect(screen.queryByText(/stay on top of your work/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/learn more/i)).not.toBeInTheDocument();
    /* And no link to a page of all action items. The reference ends the column
       with one; `app/(app)` has no action-items route, so it would go nowhere.
       Re-audited for this correction -- see the report. */
    expect(screen.queryByText(/view all action items/i)).not.toBeInTheDocument();
  });

  it("puts no card, fill or border behind either region", async () => {
    /*
     * The page feels full because of geometry, type and two hairlines. A panel
     * behind the margin would make it the bordered side pane this composition
     * replaced, and a card behind the list would bring back the V1 shape.
     */
    tasks = [{ id: "ai_1", title: "Book the room", status: "OPEN" }];
    const { container } = render(<HomePage />);
    await screen.findByRole("heading", { level: 1 });

    const margin = container.querySelector("[data-home-margin]")!;
    for (const banned of ["rounded-", "bg-surface", "bg-white/", "border ", "border-"]) {
      expect(margin.getAttribute("class") ?? "").not.toContain(banned);
    }
  });

  it("says nothing the product cannot do", async () => {
    const { container } = render(<HomePage />);
    await screen.findByRole("heading", { level: 1 });

    /*
     * The reference fills this page with the memory layer: "What Reverie
     * noticed", a decision reversed, a promise slipped twice, a risk open
     * thirteen days. None of it exists. The composition was taken and the
     * content was not.
     */
    for (const word of [
      /\bmemory\b/i,
      /decision reversed/i,
      /decision drift/i,
      /decision history/i,
      /commitment/i,
      /promise/i,
      /slipped/i,
      /since (your |the )?last meeting/i,
      /what reverie noticed/i,
    ]) {
      expect(container.textContent ?? "").not.toMatch(word);
    }
  });

  it("draws conversations as rows rather than as cards", async () => {
    rows = [aMeeting({ id: "mtg_a", title: "Tuesday design review" })];
    const { container } = render(<HomePage />);
    await screen.findByRole("heading", { level: 1 });

    const row = screen.getByRole("link", { name: /Tuesday design review/ });
    // A hairline between rows, not a border around each one. `rounded-lg
    // border` per row is the V1 list shape that this correction removed.
    expect(row.className).not.toContain("border");
    // And it still goes where it always went.
    expect(row).toHaveAttribute("href", "/meetings/mtg_a");
    expect(container.querySelector(".v2-home")).toBeInTheDocument();
  });

  it("draws its rows at Home's size, which Library's are not", async () => {
    /*
     * `size="home"`: a 16px glyph in a column of its own, a 16px title and
     * 16px of air above and below. The archive keeps its 15px row at 12px of
     * padding and no glyph column, and the default on the component is
     * `"list"`, so this assertion is what would fail if Home stopped asking.
     */
    // With a duration, because the metadata line is drawn only when there is
    // a fact to put in it -- a row with nothing to say renders no empty line.
    rows = [aMeeting({ id: "mtg_a", title: "Tuesday design review", durationSeconds: 1920 })];
    render(<HomePage />);
    await screen.findByRole("heading", { level: 1 });

    const row = screen.getByRole("link", { name: /Tuesday design review/ });
    expect(row.className).toContain("py-4");
    expect(row.querySelector("[data-row-title]")?.className).toContain("v2-home-title");
    expect(row.querySelector("[data-row-meta]")?.className).toContain("v2-home-meta");
    // A glyph in a column of its own, which is Home's indent.
    expect(row.querySelector("svg")?.getAttribute("class")).toContain("h-4");
  });

  it("asks for nothing per row, so a wide list is still one request", async () => {
    /*
     * The reference draws a sentence of summary under every title. There is no
     * summary on `MeetingResponse` and no speaker count either, and the only
     * ways to put them on screen are a request per row or an invention. This
     * is the guard against the first: twenty rows, and the page still makes
     * exactly the two calls it makes with one.
     */
    rows = Array.from({ length: 20 }, (_, i) => aMeeting({ id: `mtg_${i}`, title: `Meeting ${i}` }));
    render(<HomePage />);
    await screen.findByRole("heading", { level: 1 });

    expect(perMeetingCalls()).toHaveLength(0);
  });
});
