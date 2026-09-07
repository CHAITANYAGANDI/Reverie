import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The shell, and the eight things it is responsible for.
 *
 * <h2>Why this file exists now and did not before</h2>
 *
 * <p>`app-shell.tsx` had no tests at all, which was survivable while it was a
 * rail and a header that nothing else depended on. It is not survivable through
 * a rewrite: the shell is the only place in the app where the recorder, the
 * processing dock, the search overlay, two portal targets and the import
 * dialog's folder are wired together, and every one of those is a thing that
 * has to outlive a navigation. If the rewrite dropped one, nothing else in the
 * suite would notice — the pages that depend on them each mock the shell away.
 *
 * <p>So this is a wiring test, not a layout test. The band and the bottom tabs
 * have their own files; what is asserted here is that the shell hands them the
 * right state, keeps the portals mounted, and does the things only it can do.
 */
const { push } = vi.hoisted(() => ({ push: vi.fn() }));

let pathname: string;
/** What the recorder is holding. Drives the band, the tabs and the clearance. */
let recorderState: "idle" | "recording";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));

vi.mock("@/lib/recording-context", () => ({
  // Kept as a real wrapper rather than a passthrough stub: that it wraps the
  // shell rather than sitting inside it is the reason recording survives a
  // route change, and a stub would let that inversion pass unnoticed.
  RecordingProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recording-provider">{children}</div>
  ),
  useRecording: () => ({ state: recorderState }),
  useRecordingSession: () => ({ setReturnTo: vi.fn() }),
}));

/*
 * The five things the shell mounts but does not implement. Each is stubbed to
 * report the props the shell decides, which is the whole of the contract
 * between them.
 */
vi.mock("@/components/v2/app-band", () => ({
  AppBand: (props: { pathname: string; create: boolean; recording: boolean; onImport: () => void }) => (
    <header data-testid="band" data-create={String(props.create)} data-recording={String(props.recording)}>
      <button type="button" onClick={props.onImport}>
        Import
      </button>
      <span>{props.pathname}</span>
    </header>
  ),
}));
vi.mock("@/components/v2/mobile-tabs", () => ({
  MobileTabs: (props: { create: boolean; recording: boolean }) => (
    <nav data-testid="tabs" data-create={String(props.create)} data-recording={String(props.recording)} />
  ),
}));
vi.mock("@/components/search-command", () => ({
  SearchCommand: ({ open, initial }: { open: boolean; initial: string }) => (
    <div data-testid="search" data-open={String(open)} data-initial={initial} />
  ),
}));
vi.mock("@/components/import-dialog", () => ({
  ImportDialog: ({ open, projectId }: { open: boolean; projectId: string | null }) => (
    <div data-testid="import" data-open={String(open)} data-folder={projectId ?? ""} />
  ),
}));
vi.mock("@/components/recording-bar", () => ({
  RecordingBar: () => <div data-testid="recording-bar" />,
}));
vi.mock("@/components/processing-dock", () => ({
  ProcessingDock: () => <div data-testid="processing-dock" />,
}));
/*
 * Not mocked, and not rendered. The shell used to draw the folder's own
 * rename and delete from `chrome.folderId`; they are in the folder's own
 * masthead now, so the shell importing that component at all would be the
 * regression these two tests exist for.
 */

import { AppShell } from "@/components/app-shell";
import { HEADER_SLOT_ID, HeaderSlot } from "@/components/header-slot";
import { SIDE_PANE_ID, SidePane, openSidePane, resetSidePane } from "@/components/side-pane";
import { openSearch, resetSearchOverlay } from "@/lib/search-overlay";

function shell(children: React.ReactNode = <p>the page</p>) {
  return render(<AppShell>{children}</AppShell>);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetSearchOverlay();
  resetSidePane();
  pathname = "/home";
  recorderState = "idle";
});

describe("what it mounts on every page", () => {
  it("renders the page inside the band and the tabs", () => {
    shell();

    expect(screen.getByTestId("band")).toBeInTheDocument();
    expect(screen.getByTestId("tabs")).toBeInTheDocument();
    expect(screen.getByText("the page")).toBeInTheDocument();
  });

  it("keeps the recorder outside itself, so it survives a navigation", () => {
    // The provider wraps the shell rather than the other way round. Inverted,
    // the recorder would be remounted by anything that remounts the shell —
    // which is the one thing recording must not be.
    shell();

    const provider = screen.getByTestId("recording-provider");
    expect(provider).toContainElement(screen.getByTestId("band"));
  });

  it("docks the recording bar and the processing dock", () => {
    // Both outlive the page that started them: the recorder keeps running when
    // you leave /record, and the pipeline keeps running when you leave the
    // meeting. Whatever reports on them has to outlive that page too.
    shell();

    expect(screen.getByTestId("recording-bar")).toBeInTheDocument();
    expect(screen.getByTestId("processing-dock")).toBeInTheDocument();
  });

  it("keeps both portal targets mounted, even with nothing in them", () => {
    // Destroying either would leave the component that fills it with nowhere to
    // render and no way to find out when there was one.
    const { container } = shell();

    expect(container.querySelector(`#${HEADER_SLOT_ID}`)).toBeInTheDocument();
    expect(container.querySelector(`#${SIDE_PANE_ID}`)).toBeInTheDocument();
  });
});

describe("search", () => {
  it("opens on Ctrl-K from anywhere", async () => {
    // Bound on the window rather than on an input, so it works while the focus
    // is in a transcript, a chat box or nothing at all.
    shell();
    expect(screen.getByTestId("search")).toHaveAttribute("data-open", "false");

    await userEvent.keyboard("{Control>}k{/Control}");

    expect(screen.getByTestId("search")).toHaveAttribute("data-open", "true");
  });

  it("opens on Cmd-K too", async () => {
    shell();

    await userEvent.keyboard("{Meta>}k{/Meta}");

    expect(screen.getByTestId("search")).toHaveAttribute("data-open", "true");
  });

  it("carries a query handed to it from three components deep", () => {
    // "Search in folder" lives on a folder's row menu. It opens this box with
    // the filter already typed, which is why the overlay is a module store and
    // not state in here.
    shell();

    act(() => openSearch('in:"Q4 planning" '));

    expect(screen.getByTestId("search")).toHaveAttribute("data-initial", 'in:"Q4 planning" ');
  });
});

describe("import", () => {
  it("opens from the band", async () => {
    shell();
    expect(screen.getByTestId("import")).toHaveAttribute("data-open", "false");

    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(screen.getByTestId("import")).toHaveAttribute("data-open", "true");
  });

  it("files into the folder the page is inside", async () => {
    // Read from the path because the shell does not know what page it is
    // wrapping, and the folder is what somebody standing in one expects an
    // import to land in.
    pathname = "/folder/prj_1";
    shell();

    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(screen.getByTestId("import")).toHaveAttribute("data-folder", "prj_1");
  });

  it("files nowhere in particular anywhere else", async () => {
    shell();

    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(screen.getByTestId("import")).toHaveAttribute("data-folder", "");
  });
});

describe("the recorder's reach", () => {
  it("tells the band and the tabs to withhold Import and Record while one runs", () => {
    // The rule that has to survive navigation: wandering onto Home mid-meeting
    // must not put both buttons back over a live microphone. Both surfaces read
    // the same value, so they cannot disagree.
    recorderState = "recording";
    shell();

    expect(screen.getByTestId("band")).toHaveAttribute("data-create", "false");
    expect(screen.getByTestId("tabs")).toHaveAttribute("data-create", "false");
    expect(screen.getByTestId("band")).toHaveAttribute("data-recording", "true");
    expect(screen.getByTestId("tabs")).toHaveAttribute("data-recording", "true");
  });

  it("offers them again the moment the recorder is empty", () => {
    shell();

    expect(screen.getByTestId("band")).toHaveAttribute("data-create", "true");
    expect(screen.getByTestId("tabs")).toHaveAttribute("data-create", "true");
  });

  it("withholds them on the page that exists to record, before it starts", () => {
    pathname = "/record";
    shell();

    expect(screen.getByTestId("band")).toHaveAttribute("data-create", "false");
  });
});

describe("the page's own controls", () => {
  it("renders whatever a page puts in the header slot", () => {
    shell(<HeaderSlot>
      <button type="button">Export</button>
    </HeaderSlot>);

    const slot = document.getElementById(HEADER_SLOT_ID);
    expect(slot).toHaveTextContent("Export");
  });

  it("draws none of a folder's own actions, on a folder or anywhere else", () => {
    /*
     * THE SHELL IS OUT OF THIS ENTIRELY NOW.
     *
     * <p>It drew them from `chrome.folderId` at the right of a full-width row,
     * which put them about 340px clear of a centred 680px folder document —
     * chrome, to look at, rather than the folder's. They are in the folder's
     * masthead; see app/(app)/folder/[id]/page.test.tsx.
     *
     * <p>The band never carried them and must not start: it is 48px of global
     * chrome and the same shape on every screen, which is the whole reason it
     * can be trusted.
     */
    pathname = "/folder/prj_1";
    shell();

    expect(screen.queryByRole("button", { name: "Folder actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rename folder/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("band")).toBeInTheDocument();
  });

  it("still knows which folder it is in, because the import dialog needs it", () => {
    // `chrome.folderId` kept its other caller. Removing it with the actions
    // would have quietly sent every import to the top level.
    pathname = "/folder/prj_1";
    shell();

    expect(screen.getByTestId("import")).toHaveAttribute("data-folder", "prj_1");
  });
});

describe("the side pane", () => {
  it("takes no width on a page that has not filled it", () => {
    // A 26rem strip of empty card beside a meeting that is still processing is
    // a layout bug people report as a blank screen.
    const { container } = shell();

    const aside = container.querySelector("aside");
    expect(aside).toHaveClass("hidden");
  });

  it("stays closed when a page hands something over", async () => {
    /*
     * THIS ASSERTED THE OPPOSITE, and the reversal is the correction.
     *
     * <p>`open` defaulted to true, so filling the pane opened it — and the one
     * page that fills it is a meeting, so every READY meeting arrived as a
     * document beside a chat application. That is the split-pane shape the V2
     * study exists to remove.
     *
     * <p>The content is mounted all the same: the pane is hidden, never
     * unmounted, so a half-typed question survives and `SidePane` always has
     * somewhere to render.
     */
    const { container } = shell(<SidePane><p>Ask this meeting</p></SidePane>);

    expect(container.querySelector("aside")).toHaveClass("hidden");
    expect(document.getElementById(SIDE_PANE_ID)).toHaveTextContent("Ask this meeting");
  });

  it("opens on request, and closes again", async () => {
    // The whole of the new contract: it is a state somebody asks for. The page
    // asks -- `Ask` in the meeting's mode row calls exactly this.
    const { container } = shell(<SidePane><p>Ask this meeting</p></SidePane>);

    act(() => openSidePane());
    expect(container.querySelector("aside")).not.toHaveClass("hidden");

    await userEvent.click(screen.getByRole("button", { name: "Hide the side panel" }));
    expect(container.querySelector("aside")).toHaveClass("hidden");
  });
});

/**
 * ⌘K, from everywhere, exactly once.
 *
 * <h2>Two things the shell rewrite could have broken silently</h2>
 *
 * <p><b>The shortcut is bound on the window, by the shell.</b> Not on the search
 * button and not on any page, so it works while the focus is in a transcript, a
 * chat box, a folder name being renamed, or nothing at all. A rewrite that moved
 * the binding onto the band would have made it stop working on exactly the
 * screens where somebody is deep in something — which is every screen where it
 * matters.
 *
 * <p><b>And it must be bound once.</b> A duplicate registration is invisible in
 * use: `openSearch()` is idempotent, so two listeners open one box and nothing
 * looks wrong. It surfaces later, as a handler that outlives its component or a
 * second box that will not close. Counted directly, because there is no
 * behaviour to observe.
 */
describe("the search shortcut", () => {
  /** Every route the band is drawn on, including two with no page chrome. */
  const ROUTES = [
    "/home",
    "/library",
    "/ask",
    "/meetings/mtg_1",
    "/folder/prj_1",
    "/record",
    "/settings/plans",
    "/upload",
  ];

  it("opens search from every route in the app", async () => {
    for (const route of ROUTES) {
      pathname = route;
      const view = shell();

      await userEvent.keyboard("{Control>}k{/Control}");

      expect(screen.getByTestId("search"), route).toHaveAttribute("data-open", "true");
      view.unmount();
      resetSearchOverlay();
    }
  });

  it("registers exactly one keydown listener", () => {
    const added = vi.spyOn(window, "addEventListener");
    shell();

    const keydowns = added.mock.calls.filter(([type]) => type === "keydown");
    expect(keydowns).toHaveLength(1);
    added.mockRestore();
  });

  it("takes that listener away again on unmount", () => {
    // The other half of the same rule. A listener left behind by a shell that
    // has gone is what turns "bound once" into "bound n times" over a session.
    const removed = vi.spyOn(window, "removeEventListener");
    shell().unmount();

    expect(removed.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
    removed.mockRestore();
  });

  it("does not rebind it on a route change", () => {
    // The effect has an empty dependency list, and it has to keep one: a
    // navigation is not a reason to tear down a window listener.
    const view = shell();
    const added = vi.spyOn(window, "addEventListener");

    act(() => {
      pathname = "/library";
    });
    view.rerender(<AppShell><p>the page</p></AppShell>);

    expect(added.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(0);
    added.mockRestore();
  });
});

/**
 * The pane, and the control that puts it away.
 *
 * <p>It is the way OUT of the pane and nothing else. It used to render whenever
 * a page had filled the pane, open or closed, because the pane opened by
 * default: it was the only way to dismiss a 26rem column, so it had to be
 * there whenever the column could be. The V2 rewrite dropped the button
 * entirely and nothing failed — the pane still rendered, the chat still worked,
 * and the only thing missing was the way out.
 *
 * <p>Now the pane opens on request and the meeting's mode row has an `Ask`, so
 * the closed state has its own opener with its own context. Left as it was,
 * this button was a second one, unlabelled, alone on a row that cost 51px above
 * the document — measured at 1440 as a back link at y=142 against the
 * reference's y=91.
 */
describe("the side pane's toggle", () => {
  it("reserves nothing above the page while the pane is closed", () => {
    /*
     * THE MEASUREMENT THIS EXISTS FOR. A closed meeting rendered an otherwise
     * empty shell action row: nothing fills `HeaderSlot` any more, so the row's
     * only occupant was a control for a pane nobody had asked for, and its
     * `py-3` plus a 36px button pushed the whole document down.
     *
     * <p>Asserted as "no row", not "no button", because a zero-height row with
     * a hidden button in it would pass the narrower check and still cost the
     * pixels.
     */
    shell(<SidePane><p>Ask this meeting</p></SidePane>);

    expect(screen.queryByRole("button", { name: /side panel/ })).not.toBeInTheDocument();
    expect(document.getElementById(HEADER_SLOT_ID)?.parentElement?.children).toHaveLength(1);
  });

  it("is not offered on a page that has not filled the pane", () => {
    // A control for a thing that is not there.
    shell();

    expect(screen.queryByRole("button", { name: /side panel/ })).not.toBeInTheDocument();
  });

  it("appears as the way out once the page opens the pane", () => {
    // `Ask` is the way in. This is the way back.
    const { container } = shell(<SidePane><p>Ask this meeting</p></SidePane>);

    act(() => openSidePane());

    expect(container.querySelector("aside")).not.toHaveClass("hidden");
    expect(screen.getByRole("button", { name: "Hide the side panel" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("closes the pane, and takes itself away with it", async () => {
    const { container } = shell(<SidePane><p>Ask this meeting</p></SidePane>);
    act(() => openSidePane());

    await userEvent.click(screen.getByRole("button", { name: "Hide the side panel" }));

    expect(container.querySelector("aside")).toHaveClass("hidden");
    expect(screen.queryByRole("button", { name: /side panel/ })).not.toBeInTheDocument();
  });

  it("opens it again after a close, with the pane's content intact", async () => {
    const { container } = shell(<SidePane><p>Ask this meeting</p></SidePane>);
    act(() => openSidePane());
    await userEvent.click(screen.getByRole("button", { name: "Hide the side panel" }));

    act(() => openSidePane());

    expect(container.querySelector("aside")).not.toHaveClass("hidden");
    expect(document.getElementById(SIDE_PANE_ID)).toHaveTextContent("Ask this meeting");
  });

  it("keeps the pane mounted while it is closed", async () => {
    // Destroying it would throw away a half-typed question and leave `SidePane`
    // with nowhere to render. Hidden, never unmounted.
    shell(<SidePane><p>Ask this meeting</p></SidePane>);
    act(() => openSidePane());

    await userEvent.click(screen.getByRole("button", { name: "Hide the side panel" }));

    expect(document.getElementById(SIDE_PANE_ID)).toHaveTextContent("Ask this meeting");
  });
});
