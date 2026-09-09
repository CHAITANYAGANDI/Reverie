import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The band — forty-eight pixels, and the whole of the permanent chrome.
 *
 * <p>It replaced a 256px rail and a 64px header, so the risk it carries is not
 * that it looks wrong. It is that something the rail held was quietly dropped
 * in the move: the bell, the account, the way to Import, the way to Record. A
 * control that is gone from a redesign does not fail loudly — it is simply
 * never found again.
 *
 * <p>So this file is a census. Everything that has to be reachable from every
 * page is asserted to be reachable, and the one rule that takes anything away
 * is asserted to take it away for the right reason.
 */
const { push, start, setReturnTo, toastError } = vi.hoisted(() => ({
  push: vi.fn(),
  start: vi.fn(),
  setReturnTo: vi.fn(),
  toastError: vi.fn(),
}));

/** What the recorder is holding, and whether the account may record at all. */
let recorderState: "idle" | "recording";
let refusal: string | null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/home",
}));

vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

vi.mock("@/lib/recording-context", () => ({
  useRecording: () => ({ state: recorderState, start }),
  useRecordingSession: () => ({ setReturnTo }),
}));

vi.mock("@/lib/allowance", () => ({
  useAllowance: () => ({}),
  recordRefusal: () => refusal,
}));

// The two ends of the band draw their own data. Neither is what this file is
// about, and both would drag the whole API layer in with them.
vi.mock("@/components/notification-bell", () => ({
  NotificationBell: () => <button type="button">Notifications</button>,
}));
vi.mock("@/components/account-menu", () => ({
  AccountMenu: () => <button type="button">Priya Raman</button>,
}));

import { AppBand } from "@/components/v2/app-band";
import { openSearch, resetSearchOverlay, useSearchOverlay } from "@/lib/search-overlay";

/**
 * Reads the store the way the shell does.
 *
 * <p>The overlay is a module store rather than component state, precisely so
 * that something three components deep can open it. There is no `getState` to
 * peek at, and there should not be — so the test subscribes the same way the
 * real subscriber does.
 */
function Probe() {
  const overlay = useSearchOverlay();
  return <p data-testid="overlay">{overlay.open ? `open:${overlay.initial}` : "closed"}</p>;
}

function band(over: Partial<React.ComponentProps<typeof AppBand>> = {}) {
  return render(
    <>
      <AppBand pathname="/home" create recording={false} onImport={() => {}} {...over} />
      <Probe />
    </>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetSearchOverlay();
  recorderState = "idle";
  refusal = null;
});

describe("what is always there", () => {
  it("carries the three places", () => {
    band();

    const nav = screen.getByRole("navigation", { name: "Places" });
    const names = Array.from(nav.querySelectorAll("a")).map((a) => a.textContent);
    /*
     * A noun, like the two beside it. The V2 reference puts Memory in this slot
     * and Memory does not exist, so the slot carries the real third
     * destination — and it has been renamed twice for the same reason each
     * time. "Ask" is a bare verb in a row of destinations. "Ask Reverie"
     * collided with the control that opens the chat *in place* on Home and on
     * a meeting: two things on one screen with that name, one of which
     * navigates away and one of which does not. "Reverie AI" names the
     * destination; the panels are opened by a button labelled `Ask Reverie`,
     * which is a verb phrase beside this noun phrase rather than a repeat of
     * it. (That button read `AI` for a while, as the cheaper way out of the
     * same collision.)
     */
    expect(names).toEqual(["Home", "Library", "Reverie AI"]);
  });

  it("sends each place to its own page", () => {
    band();

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/home");
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("href", "/library");
    expect(screen.getByRole("link", { name: "Reverie AI" })).toHaveAttribute("href", "/ask");
  });

  it("wears the product's identity in the corner, never the AI orb", () => {
    /*
     * THE ABSENCE THAT MATTERS.
     *
     * <p>Reverie has two marks and this corner is the first one: it answers
     * "which product am I using?", which is what a logo in a corner has meant
     * for as long as there have been corners. The orb answers "where is
     * Reverie's assistant?" and belongs on the controls that open it.
     *
     * <p>Asserted as an absence because the failure is a plausible one — the
     * orb is the newer and better-looking mark, and putting it here would make
     * the whole application look like an AI feature.
     */
    band();

    const home = screen.getByRole("link", { name: "Reverie — home" });
    const mark = home.querySelector("svg")!;

    expect(home.querySelector("[data-ai-mark]")).toBeNull();
    /*
     * And it is drawn at the size the band has room for. 44px of *visible
     * lens*, where it was an 18px square box painting a 15px-wide, 11px-tall
     * drawing — a favicon in the corner of a premium interface, which is how
     * it was reported. The box was the ceiling, not the band: the lens is
     * 1.75 times as wide as it is tall, so a square element is a quarter empty
     * above and below the drawing. `crop` makes the element the drawing, which
     * is what let this grow at all — see `lensBox` in mark-geometry.
     */
    expect(mark.getAttribute("width")).toBe("42");
    expect(mark.getAttribute("viewBox")).not.toBe("0 0 32 32");
    expect(Number(mark.getAttribute("height"))).toBeLessThan(28);
    /* Five bars, not the artwork's nine. The nine-bar cut is a *display* cut —
       at 42px it is 3px bars on a 5px pitch against a 1.9px ribbon, so the
       waveform swamps the lens and the mark reads as a cluster of vertical
       bars. Only the hero, at 264px, is large enough for it. See the boundary
       note in mark-geometry. */
    expect(mark.querySelectorAll("rect")).toHaveLength(5);
  });

  it("takes the mark home", () => {
    // The one thing a logo in a corner has meant for as long as there have
    // been corners.
    band();

    // By its exact name: "Reverie AI" also matches /Reverie/, and a loose
    // pattern that starts matching a second element is a test that fails for a
    // reason unrelated to the thing it is about.
    expect(screen.getByRole("link", { name: "Reverie — home" })).toHaveAttribute(
      "href",
      "/home",
    );
  });

  it("keeps the bell and the account, which the rail used to hold", () => {
    band();

    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Priya Raman" })).toBeInTheDocument();
  });

  it("keeps the bell on a page that offers no way to make a meeting", () => {
    /*
     * It used to be grouped with the avatar, past the rule. Moving it in
     * beside Record and Import put it inside the `create` guard for a moment,
     * which would have taken notifications off every page that withholds those
     * two -- while a recording is in hand, most obviously. It is a sibling of
     * that group, not a member of it: no page has a reason to withhold it,
     * because it is not about making anything.
     */
    band({ create: false });

    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: RECORD })).not.toBeInTheDocument();
  });

  it("puts the bell before the rule and the account after it", () => {
    // The avatar is the band's only filled circle and the only thing in it
    // that opens a menu about the account, so alone after the rule it
    // terminates the row -- which is where an account control is looked for.
    band();

    const bell = screen.getByRole("button", { name: "Notifications" });
    const account = screen.getByRole("button", { name: "Priya Raman" });
    // `compareDocumentPosition` rather than reading the tree, because what is
    // being asserted is the reading order and not the nesting.
    expect(bell.compareDocumentPosition(account)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("shows no keyboard badge in the search field", async () => {
    /*
     * There was a `⌘K` keycap at the far end of it. What it did was put a
     * second bordered thing inside a field whose whole job is to look like one
     * open space, at the end where the eye lands after reading the
     * placeholder -- and it was wrong on Windows and Linux, where the binding
     * is Ctrl.
     *
     * <p>The shortcut is unaffected: it is bound on the shell, not on this
     * button, which is why removing the badge costs nothing.
     */
    band();

    const search = screen.getByRole("button", { name: "Search" });
    expect(search.querySelector("kbd")).toBeNull();
    expect(search).not.toHaveTextContent("K");
  });

  it("opens search", async () => {
    band();
    expect(screen.getByTestId("overlay")).toHaveTextContent("closed");

    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(screen.getByTestId("overlay")).toHaveTextContent("open:");
  });

  it("offers search on Account Settings too", () => {
    // The old header stripped it there, on the grounds that search finds
    // meetings and settings pages have none. True, and it made the chrome
    // change shape on one of the most deliberate navigations in the app —
    // which in a band that is otherwise identical everywhere reads as a fault.
    band({ pathname: "/settings/plans" });

    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  });
});

describe("marking where you are", () => {
  it("marks the place you are on, and only that one", () => {
    band({ pathname: "/library" });

    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Reverie AI" })).not.toHaveAttribute("aria-current");
  });

  it("keeps the parent marked one level down, without claiming to be it", () => {
    // Inside a meeting, Library is where you came from. Claiming `aria-current`
    // would be a lie about which page this is; marking nothing at all is a
    // navigation that goes blank exactly where people spend most of their time.
    band({ pathname: "/meetings/mtg_1" });

    const library = screen.getByRole("link", { name: "Library" });
    expect(library).not.toHaveAttribute("aria-current");
    expect(library).toHaveAttribute("data-parent");
  });

  it("marks nothing on a page that is not a place", () => {
    band({ pathname: "/record" });

    for (const name of ["Home", "Library", "Reverie AI"]) {
      expect(screen.getByRole("link", { name })).not.toHaveAttribute("aria-current");
    }
  });
});

/**
 * What Record is called now.
 *
 * <p>It drew the word `Record` beside a mic, inside an outlined pill. Both
 * went: an outlined square beside an outlined pill is a pair of boxes, and
 * once the boxes are gone a word beside a glyph is a pair of unlike things.
 * The name moved to `aria-label`, which is where the Import glyph beside it
 * had always kept its own, so the two are now found the same way.
 */
const RECORD = "Record a conversation";

describe("Import and Record", () => {
  it("offers both when there is nothing in hand", () => {
    band();

    expect(screen.getByRole("button", { name: "Import a recording" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: RECORD })).toBeInTheDocument();
  });

  it("opens the import dialog rather than navigating", async () => {
    // A file arrives more often than anything else creates a meeting, and it
    // should not cost leaving whatever is on screen.
    const onImport = vi.fn();
    band({ onImport });

    await userEvent.click(screen.getByRole("button", { name: "Import a recording" }));

    expect(onImport).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("withholds both while a recording is in hand", () => {
    // The rule with a consequence rather than an opinion. Record would be
    // offering to start what is already running, and Import would be a file
    // picker over a live microphone.
    band({ create: false, recording: true });

    expect(screen.queryByRole("button", { name: "Import a recording" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: RECORD })).not.toBeInTheDocument();
  });

  it("goes to /record carrying the page it was pressed on", async () => {
    band({ pathname: "/folder/prj_1" });

    await userEvent.click(screen.getByRole("button", { name: RECORD }));

    // The folder has to survive: by save time the pathname is /record, and
    // "which folder am I in" has no answer.
    expect(push).toHaveBeenCalledWith("/record?r=%2Ffolder%2Fprj_1");
    expect(setReturnTo).toHaveBeenCalledWith("/folder/prj_1");
    expect(start).toHaveBeenCalled();
  });

  it("explains a refusal instead of opening the microphone", async () => {
    // Checked here as well as on /record, because this is where the microphone
    // is actually opened. Navigating first would put the browser's permission
    // prompt in front of somebody about to be told they cannot record anyway.
    refusal = "You have used your 100 minutes.";
    band();

    await userEvent.click(screen.getByRole("button", { name: RECORD }));

    expect(toastError).toHaveBeenCalledWith("You have used your 100 minutes.");
    expect(push).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it("says why, rather than going dead", () => {
    // A disabled button explains nothing, and the reason is the whole of what
    // somebody needs here.
    refusal = "You have used your 100 minutes.";
    band();

    const button = screen.getByRole("button", { name: RECORD });
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("title", "You have used your 100 minutes.");
  });
});

describe("while recording", () => {
  it("turns, rather than growing a pill beside everything else", () => {
    // The docked bar at the bottom carries the waveform, the clock and the two
    // buttons that end the recording. A second statement of the same fact up
    // here was a smaller copy of a thing already on screen; what the band adds
    // is ambient — you cannot look at any page without seeing it.
    const { container } = band({ create: false, recording: true });

    expect(container.querySelector("header")).toHaveAttribute("data-recording", "true");
  });

  it("is unmarked when nothing is being recorded", () => {
    const { container } = band();

    expect(container.querySelector("header")).not.toHaveAttribute("data-recording");
  });
});

describe("the search store", () => {
  it("is the same one anything else in the app opens", () => {
    // "Search in folder" opens this from a menu three components deep, with a
    // query already in it. A local `useState` in the band could not be reached
    // from there, and the button and the shortcut would drift into two boxes.
    band();

    act(() => openSearch("acme"));

    expect(screen.getByTestId("overlay")).toHaveTextContent("open:acme");
  });
});

/**
 * The slot the reference filled with something that does not exist.
 *
 * <p>`design-demo/final/07-now.html` draws the band as Now / Library / Memory.
 * Memory is not implemented — the migrations dropped the tables it was read
 * from — so the third slot carries the real destination. These pin the absence,
 * because a nav is exactly the place a future feature gets added as a disabled
 * word "so it is ready", and a disabled word in a row of three is a promise the
 * product cannot keep.
 */
describe("no future destination in the band", () => {
  it("offers Memory nowhere, by any of its names", () => {
    const { container } = band();

    for (const word of [
      /\bmemory\b/i,
      /decision drift/i,
      /commitment/i,
      /promise/i,
      /decision history/i,
    ]) {
      expect(container.textContent ?? "").not.toMatch(word);
    }
  });

  it("routes the third place to the workspace Ask that exists", () => {
    band();

    // Not a new chat, not a modal, not a placeholder: the destination the
    // product already has, with its thread, its composer and its citations.
    expect(screen.getByRole("link", { name: "Reverie AI" })).toHaveAttribute("href", "/ask");
  });
});

/**
 * The centre column.
 *
 * <p>Search sat in the right-hand group behind a flex spacer, which put it
 * wherever the left group happened to end — visibly off centre, and drifting
 * with the length of the place names. The band is a three-column grid now, so
 * the middle column is the middle of the window whatever the two sides weigh.
 */
describe("where Search sits", () => {
  it("is its own column between the two groups", () => {
    const { container } = band();

    const row = container.querySelector("header > div");
    expect(row?.className).toContain("grid-cols-[1fr_auto_1fr]");

    // Three children: left group, Search, right group. A fourth would mean
    // something had been dropped back into the row beside the centre column.
    expect(row?.children).toHaveLength(3);
    expect(row?.children[1]).toContainElement(
      screen.getByRole("button", { name: "Search" }),
    );
  });

  it("keeps Record out of the accent colour, and out of a box", () => {
    // The palette's own rule: the accent means "Reverie noticed this", not
    // "this is the primary button". A filled iris pill on every page spends it
    // on a control nobody asked for yet.
    band();

    const record = screen.getByRole("button", { name: RECORD });
    expect(record.className).not.toContain("bg-brand");
    // And no stroke either. What says it is operable is the fill it takes on
    // hover, which is the idiom the bell and the search field already used.
    expect(record.className).not.toContain("shadow-[inset");
    expect(screen.getByRole("button", { name: "Import a recording" }).className).not.toContain(
      "shadow-[inset",
    );
  });
});
