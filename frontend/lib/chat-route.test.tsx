import { describe, it, expect, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { activeChat, resetActiveChats, setActiveChat, useActiveChat } from "@/lib/active-chat";
import { pendingTurn, resetPendingTurns, usePendingTurn } from "@/lib/pending-turn";
import { forgetChatsLeftBehind, useChatRouteBoundary } from "@/lib/chat-route";

/**
 * LEAVING A PAGE GIVES YOU A NEW CHAT — and nothing else does.
 *
 * <h2>Why these tests are here and not on the pages</h2>
 *
 * <p>The rule is one mechanism shared by three surfaces, and what makes it
 * correct or incorrect is entirely which *event* it keys off. The mistake it
 * replaced was keying off a component unmount, which is why the tests that
 * matter are the negative ones: a chat panel unmounting, a pane closing, a tab
 * changing. Those are all "the component went away without the route changing",
 * and they are stated here against the real scope keys and the real pathnames.
 *
 * <p>The meeting page's own suite cannot host them: it mocks
 * `@/lib/active-chat` away wholesale — `useActiveChat: () => ({ id: null, set:
 * () => {} })` — so nothing about thread identity is observable through it.
 * That mock predates this work and is not worth unpicking for 113 tests that
 * are about the document.
 *
 * <p>`window.history.pushState` is how a route change is made here. jsdom
 * implements it, and it is what `usePathname()` reflects in the application, so
 * the two stores are recording and comparing the same strings the browser
 * would give them.
 */

/** A chat panel: shows its thread, asks a question, unmounts like a tab. */
function Panel({ scope }: { scope: string }) {
  const [conversationId] = useActiveChat(scope);
  const pending = usePendingTurn(undefined, scope);
  return (
    <div>
      <p>
        {scope}: {conversationId ?? "new chat"}
        {pending.turn ? ` (asking: ${pending.turn.question})` : ""}
      </p>
      <button type="button" onClick={() => pending.begin("What is still open?")}>
        ask {scope}
      </button>
    </div>
  );
}

/** The shell: sees every route change, and outlives all of them. */
function Shell({ pathname, children }: { pathname: string; children?: React.ReactNode }) {
  useChatRouteBoundary(pathname);
  return <>{children}</>;
}

beforeEach(() => {
  resetActiveChats();
  resetPendingTurns();
  window.history.pushState({}, "", "/home");
});

/** Where the reader is, as both stores and the shell see it. */
function at(path: string) {
  act(() => {
    window.history.pushState({}, "", path);
  });
}

/**
 * A MEETING'S CHAT: the three cases the product rule names.
 *
 * <p>A and B are about things that are not navigation. C is the navigation.
 */
describe("a meeting's chat", () => {
  const ui = (path: string, panel = true) => (
    <Shell pathname={path}>{panel && <Panel scope="meeting:mtg_1" />}</Shell>
  );

  it("A. resumes the same thread when Ask is closed and reopened", () => {
    // Closing the pane unmounts nothing on a meeting — the shell's aside is
    // hidden and stays mounted — but the rule has to hold even if it did, so
    // this is stated as an unmount and a remount.
    at("/meetings/mtg_1");
    const { rerender } = render(ui("/meetings/mtg_1"));
    act(() => setActiveChat("meeting:mtg_1", "cnv_9"));

    // Ask closed: the panel goes, the route does not.
    rerender(ui("/meetings/mtg_1", false));
    // Ask reopened.
    rerender(ui("/meetings/mtg_1"));

    expect(screen.getByText("meeting:mtg_1: cnv_9")).toBeInTheDocument();
  });

  it("B. resumes the same thread across Summary, Transcript and Outline", () => {
    /*
     * The Outline tab is the one that actually unmounts the chat: it and the
     * chat are two `TabsContent` panels, and Radix unmounts the inactive one.
     * Summary/Transcript is a tab change on the document underneath, which
     * changes whether Outline is even offered.
     *
     * None of it touches the route, so none of it may touch the thread.
     */
    at("/meetings/mtg_1");
    const { rerender } = render(ui("/meetings/mtg_1"));
    act(() => setActiveChat("meeting:mtg_1", "cnv_9"));

    // Summary -> Transcript: the pane is still there.
    rerender(ui("/meetings/mtg_1"));
    // Outline opens: the chat panel unmounts.
    rerender(ui("/meetings/mtg_1", false));
    // Back to the chat tab.
    rerender(ui("/meetings/mtg_1"));

    expect(screen.getByText("meeting:mtg_1: cnv_9")).toBeInTheDocument();
    expect(activeChat("meeting:mtg_1")).toBe("cnv_9");
  });

  it("C. starts a new chat when the meeting route is left and returned to", () => {
    at("/meetings/mtg_1");
    const { rerender } = render(ui("/meetings/mtg_1"));
    act(() => setActiveChat("meeting:mtg_1", "cnv_9"));

    // Actually leave: Home, Library, anywhere.
    at("/home");
    rerender(ui("/home"));
    // And come back later.
    at("/meetings/mtg_1");
    rerender(ui("/meetings/mtg_1"));

    expect(screen.getByText("meeting:mtg_1: new chat")).toBeInTheDocument();
  });

  it("C. forgets it on the way out, not on the way back in", () => {
    /*
     * Which matters for a reason that is not cosmetic. If the thread were only
     * judged on arrival, the panel would render once holding the old
     * conversation id before the boundary cleared it — and `useGetChatQuery`
     * would fire a request for a conversation the surface is about to leave.
     * Clearing as the reader arrives *somewhere else* means the store is
     * already empty by the time they come back.
     */
    at("/meetings/mtg_1");
    const { rerender } = render(ui("/meetings/mtg_1", false));
    act(() => setActiveChat("meeting:mtg_1", "cnv_9"));

    at("/home");
    rerender(ui("/home", false));

    expect(activeChat("meeting:mtg_1")).toBeNull();
  });

  it("keeps another meeting's thread out of it", () => {
    at("/meetings/mtg_1");
    const { rerender } = render(ui("/meetings/mtg_1", false));
    act(() => setActiveChat("meeting:mtg_1", "cnv_9"));

    // Meeting A to meeting B is leaving A, so A is forgotten and B starts new.
    at("/meetings/mtg_2");
    rerender(ui("/meetings/mtg_2", false));

    expect(activeChat("meeting:mtg_1")).toBeNull();
    expect(activeChat("meeting:mtg_2")).toBeNull();
  });
});

describe("Home's pane and the /ask route", () => {
  it("resumes the thread when Home's pane is closed and reopened", () => {
    const ui = (panel: boolean) => (
      <Shell pathname="/home">{panel && <Panel scope="workspace:home" />}</Shell>
    );
    const { rerender } = render(ui(true));
    act(() => setActiveChat("workspace:home", "cnv_1"));

    rerender(ui(false));
    rerender(ui(true));

    expect(screen.getByText("workspace:home: cnv_1")).toBeInTheDocument();
  });

  it("starts a new chat when Home is left and returned to", () => {
    const ui = (path: string) => (
      <Shell pathname={path}>
        <Panel scope="workspace:home" />
      </Shell>
    );
    const { rerender } = render(ui("/home"));
    act(() => setActiveChat("workspace:home", "cnv_1"));

    at("/library");
    rerender(ui("/library"));
    at("/home");
    rerender(ui("/home"));

    expect(screen.getByText("workspace:home: new chat")).toBeInTheDocument();
  });

  it("starts a new chat when /ask is left and returned to", () => {
    const ui = (path: string) => (
      <Shell pathname={path}>
        <Panel scope="workspace:ask" />
      </Shell>
    );
    at("/ask");
    const { rerender } = render(ui("/ask"));
    act(() => setActiveChat("workspace:ask", "cnv_2"));

    at("/home");
    rerender(ui("/home"));
    at("/ask");
    rerender(ui("/ask"));

    expect(screen.getByText("workspace:ask: new chat")).toBeInTheDocument();
  });

  it("does not carry one surface's thread to the other on the way past", () => {
    // Home to /ask is leaving Home. `/ask` gets a new chat of its own rather
    // than adopting what was being asked in the pane.
    const ui = (path: string) => (
      <Shell pathname={path}>
        <Panel scope="workspace:home" />
        <Panel scope="workspace:ask" />
      </Shell>
    );
    const { rerender } = render(ui("/home"));
    act(() => setActiveChat("workspace:home", "cnv_1"));

    at("/ask");
    rerender(ui("/ask"));

    expect(screen.getByText("workspace:home: new chat")).toBeInTheDocument();
    expect(screen.getByText("workspace:ask: new chat")).toBeInTheDocument();
  });
});

describe("what a deep link is not", () => {
  it("treats a timecode on the same meeting as staying put", () => {
    /*
     * A citation in a meeting's own chat seeks the player, but the workspace
     * chat's citations are real links — `/meetings/mtg_1?t=122` — and the
     * summary's timecodes push the same shape of URL. The boundary compares
     * pathnames, which is what `usePathname()` gives it, so arriving at
     * `?t=122` on the meeting already being read is not a departure from it.
     */
    at("/meetings/mtg_1");
    act(() => setActiveChat("meeting:mtg_1", "cnv_9"));

    at("/meetings/mtg_1?t=122");
    act(() => forgetChatsLeftBehind("/meetings/mtg_1"));

    expect(activeChat("meeting:mtg_1")).toBe("cnv_9");
  });
});

describe("a question still in flight", () => {
  const ui = (path: string, panel = true) => (
    <Shell pathname={path}>{panel && <Panel scope="workspace:home" />}</Shell>
  );

  it("goes with the thread, so it cannot come back as a phantom", async () => {
    /*
     * The pending turn is a module store too, so it survives a navigation on
     * its own. Left behind after a reset it would be unreconcilable: it clears
     * when a user message the server did not have appears in `messages`, and
     * the surface is now on a *new* thread whose messages will never contain
     * it. The panel would show "Thinking…" over a blank chat until reload.
     */
    const { rerender } = render(ui("/home"));
    act(() => setActiveChat("workspace:home", "cnv_1"));
    await userEvent.click(screen.getByRole("button", { name: /ask workspace:home/ }));
    expect(screen.getByText(/asking: What is still open\?/)).toBeInTheDocument();

    at("/library");
    rerender(ui("/library"));

    expect(pendingTurn("workspace:home")).toBeNull();
  });

  it("goes even when it was asked before the thread existed", async () => {
    /*
     * `send()` calls `begin()` and only then creates the conversation, so for
     * one network round trip a scope has a question in flight and no thread.
     * Navigating in that window leaves nothing in the thread store to judge —
     * which is why the pending store records its own origin.
     */
    const { rerender } = render(ui("/home"));
    await userEvent.click(screen.getByRole("button", { name: /ask workspace:home/ }));
    expect(activeChat("workspace:home")).toBeNull();
    expect(pendingTurn("workspace:home")).not.toBeNull();

    at("/library");
    rerender(ui("/library"));

    expect(pendingTurn("workspace:home")).toBeNull();
  });

  it("stays while the reader stays", async () => {
    const { rerender } = render(ui("/home"));
    await userEvent.click(screen.getByRole("button", { name: /ask workspace:home/ }));

    // A pane closing, a tab changing: the panel goes, the route does not.
    rerender(ui("/home", false));

    expect(pendingTurn("workspace:home")).not.toBeNull();
  });
});

describe("the answer that lands after you have gone", () => {
  const ui = (path: string) => (
    <Shell pathname={path}>
      <Panel scope="workspace:home" />
    </Shell>
  );

  it("cannot re-adopt the thread behind the reset", () => {
    /*
     * A request is not aborted by leaving, so `send()` resolves and adopts the
     * conversation it was given whether or not anybody is looking. That write
     * happens *after* the boundary has run, so clearing on departure alone
     * would leave the thread adopted again — and coming back to the page would
     * resume it, which is the rule broken by exactly the mechanism meant to
     * enforce it.
     *
     * What saves it is that the late write stamps the origin of wherever the
     * reader now is, so the thread is stale the next time they arrive at the
     * page they asked on.
     */
    const { rerender } = render(ui("/home"));
    act(() => setActiveChat("workspace:home", "cnv_1"));

    at("/library");
    rerender(ui("/library"));
    // The answer arrives while the reader is on Library.
    act(() => setActiveChat("workspace:home", "cnv_1"));
    at("/home");
    rerender(ui("/home"));

    expect(screen.getByText("workspace:home: new chat")).toBeInTheDocument();
  });

  it("is kept when it lands on the page it was asked from", () => {
    /*
     * Deliberately allowed. If the reader is back on Home when their answer
     * arrives, it is a live answer to a question they asked and it appears —
     * `announceAnswer` does not even fire, because the path it was asked on is
     * the path they are on. Discarding it to satisfy the letter of the rule
     * would throw away the thing they were waiting for.
     */
    const { rerender } = render(ui("/home"));
    act(() => setActiveChat("workspace:home", "cnv_1"));

    at("/library");
    rerender(ui("/library"));
    at("/home");
    rerender(ui("/home"));
    // Now it lands.
    act(() => setActiveChat("workspace:home", "cnv_1"));

    expect(screen.getByText("workspace:home: cnv_1")).toBeInTheDocument();
  });
});

describe("re-entering the application", () => {
  it("forgets everything, wherever it came from", () => {
    /*
     * The shell only exists inside the application group, so a trip out to the
     * marketing page or the sign-in screen unmounts it — and no route change is
     * observed while away. Coming back to `/home`, an origin comparison alone
     * would find `/home` matching `/home` and resume the thread.
     *
     * A fresh mount of the shell means the group was entered, and anything
     * remembered belongs to a visit that ended.
     */
    const first = render(<Shell pathname="/home" />);
    act(() => setActiveChat("workspace:home", "cnv_1"));

    // Out to the landing page: the shell goes with it.
    first.unmount();
    // And back in.
    render(<Shell pathname="/home" />);

    expect(activeChat("workspace:home")).toBeNull();
  });

  it("does not forget the thread adopted after that first mount", () => {
    // The mount branch is a full clear, so it has to happen strictly before
    // anything can be adopted — otherwise every fresh load of Home would wipe
    // the first question asked on it.
    render(<Shell pathname="/home" />);

    act(() => setActiveChat("workspace:home", "cnv_1"));

    expect(activeChat("workspace:home")).toBe("cnv_1");
  });
});

describe("forgetChatsLeftBehind", () => {
  it("is a no-op when everything was adopted here", () => {
    act(() => setActiveChat("workspace:home", "cnv_1"));

    act(() => forgetChatsLeftBehind("/home"));

    expect(activeChat("workspace:home")).toBe("cnv_1");
  });

  it("forgets which thread is open and nothing else", () => {
    /*
     * Worth stating because it is the line this must not cross. Nothing here
     * calls an endpoint, deletes a conversation, or touches RTK Query — the
     * conversations remain on the server and in the history picker, and the
     * only thing forgotten is which of them a surface opens on. That is why
     * this module imports two stores and nothing else.
     */
    act(() => setActiveChat("workspace:home", "cnv_1"));

    act(() => forgetChatsLeftBehind("/library"));

    expect(activeChat("workspace:home")).toBeNull();
  });
});
