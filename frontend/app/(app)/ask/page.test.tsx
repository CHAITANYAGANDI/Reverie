import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatConversation, ChatMessage } from "@/lib/types";

/**
 * The workspace chat's handling of a conversation that disappears.
 *
 * This is a regression test for a real lock-up. Deleting the only exchange in a
 * thread also deletes the thread, and the page was still holding that thread's
 * id — so the refetch asked for a conversation that no longer existed, got a
 * 404, and every action afterwards failed. To the user the chat emptied itself
 * back to the starter prompts and then refused to delete anything, with an
 * error toast each time.
 *
 * Two defences are asserted here: acting on `conversationDeleted`, and healing
 * from a read error whatever caused it.
 */
const { chatQuery, deleteExchange, unwrap, createConversation, askChat } = vi.hoisted(() => ({
  chatQuery: vi.fn(),
  deleteExchange: vi.fn(),
  unwrap: vi.fn(),
  createConversation: vi.fn(),
  askChat: vi.fn(),
}));

let messages: ChatMessage[] = [];
let chatIsError = false;
/** What RTK Query would still be holding in `data` after a skip. */
let lastChatData: ChatMessage[] | undefined;

/**
 * The allowance the composer reads. Full, so these stay about chat.
 * `lib/allowance.test.ts` and `chat-composer.test.tsx` cover the spent case.
 */
vi.mock("@/lib/allowance", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/allowance")>();
  return {
    ...real,
    useAllowance: () => ({
      loading: false,
      unknown: false,
      minutesLeft: 100,
      importsLeft: 3,
      secondsLeft: 6000,
      canRecord: true,
      canImport: true,
    }),
  };
});

vi.mock("@/lib/api", () => ({
  // `currentData` and `isFetching` are what the page reads, and the pair is
  // modelled rather than collapsed into one field. RTK Query keeps the last
  // successful result in `data` when a query becomes *skipped* — which is how
  // this chat says "no thread is open" — so a mock that served `messages` from
  // both would hide the very state these tests are about.
  useGetWorkspaceChatQuery: (arg: unknown, options?: { skip?: boolean }) => {
    chatQuery(arg);
    const skipped = Boolean(options?.skip);
    if (!skipped) lastChatData = messages;
    return {
      data: lastChatData,
      currentData: skipped ? undefined : messages,
      isFetching: false,
      isError: chatIsError,
    };
  },
  useGetWorkspaceConversationsQuery: () => ({ data: conversations }),
  useGetWorkspaceSuggestionsQuery: () => ({ data: undefined }),
  useAskWorkspaceChatMutation: () => [
    (a: unknown) => {
      askChat(a);
      return { unwrap: async () => message({ conversationId: "cnv_new" }) };
    },
    { isLoading: false },
  ],
  useClearWorkspaceChatMutation: () => [vi.fn(), { isLoading: false }],
  useCreateWorkspaceConversationMutation: () => [
    () => {
      createConversation();
      return { unwrap: async () => ({ id: "cnv_new" }) };
    },
    { isLoading: false },
  ],
  useRenameConversationMutation: () => [vi.fn(), {}],
  useDeleteConversationMutation: () => [vi.fn(), {}],
  useDeleteChatExchangeMutation: () => [
    (a: unknown) => {
      deleteExchange(a);
      return { unwrap };
    },
    { isLoading: false },
  ],
  // The composer's two extras. Neither is what this file is about, but the
  // page cannot mount without them — see lib/use-workspace-chat.
  useGetChatModesQuery: () => ({ data: [] }),
  useGetMeetingsQuery: () => ({ data: { content: [], page: 0, size: 0, totalElements: 0, totalPages: 0 } }),
  useGetProjectsQuery: () => ({ data: [] }),
  useGetProjectMeetingsQuery: () => ({ data: [] }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

let conversations: ChatConversation[] = [];

import { activeChat, resetActiveChats, setActiveChat } from "@/lib/active-chat";
import { forgetChatsLeftBehind } from "@/lib/chat-route";
import { resetPromptRotation } from "@/lib/use-rotating-prompts";

import AskPage from "@/app/(app)/ask/page";

function message(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg_1",
    conversationId: "cnv_1",
    role: "user",
    content: "What is still open?",
    citations: [],
    createdAt: "2026-08-15T09:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // The thread a surface is on is module state, so that a question still being
  // answered survives a re-render. It must not outlive a test.
  resetActiveChats();
  // The suggestion row rotates, and its offset is module state that outlives an
  // unmount. Without this each test starts further into the pool than the last.
  resetPromptRotation();
  chatIsError = false;
  lastChatData = undefined;
  messages = [message(), message({ id: "msg_2", role: "assistant", content: "Three things." })];
  conversations = [
    {
      id: "cnv_1",
      meetingId: null,
      projectId: null,
      title: "Still open",
      messageCount: 2,
      createdAt: "2026-08-15T09:00:00Z",
      updatedAt: "2026-08-15T09:00:00Z",
    },
  ];
  unwrap.mockResolvedValue({ deletedMessages: 2, conversationDeleted: false });
});

/** The `conversationId` the page most recently asked the chat query for. */
function lastQueryArg() {
  return chatQuery.mock.calls.at(-1)?.[0];
}

describe("AskPage header", () => {
  it("offers no Clear all", () => {
    render(<AskPage />);

    // It deleted every conversation in the workspace archive — this page's and
    // the Home rail's, which this page never lists — from a header whose other
    // controls switch threads and start one. Deleting a thread at a time from
    // the picker, or an exchange from the message it belongs to, both survive.
    expect(screen.queryByRole("button", { name: /clear all/i })).not.toBeInTheDocument();
  });

  it("still gets you to another thread and to a new one", () => {
    render(<AskPage />);

    expect(screen.getByRole("button", { name: /previous chat history/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^new chat$/i })).toBeInTheDocument();
  });
});

describe("AskPage conversation state", () => {
  it("opens a new chat rather than resuming the last one", async () => {
    render(<AskPage />);

    // Changed deliberately. This used to assert that the page adopted the most
    // recent thread on open, which is what it did: reading history without
    // naming a thread returns the latest one, so every visit landed in a
    // conversation from days ago and a clean sheet was a button press you had
    // to know to look for.
    //
    // Nothing is read until a thread is chosen or a question creates one, and
    // the picker says so rather than naming a conversation you are not in.
    await waitFor(() => expect(screen.getByText("New chat")).toBeInTheDocument());
    expect(lastQueryArg()).toBeUndefined();
    expect(chatQuery).not.toHaveBeenCalledWith({ conversationId: "cnv_1" });
  });

  it("gives the first question a thread of its own", async () => {
    // Not just a cosmetic blank page. The server's rule for a question with no
    // thread named is "continue the most recent, or start one" — so a clean
    // sheet on screen would quietly append to the old conversation, which is
    // worse than resuming it openly.
    render(<AskPage />);

    // Found by its accessible name, not by a placeholder. The composer's
    // placeholder sentence is withdrawn -- it read "Ask anything about your
    // conversations" and spent the line somebody types on saying that the
    // box is a box. `aria-label="Ask a question"` is the name it always had.
    await userEvent.type(
      screen.getByLabelText("Ask a question"),
      "What is still open?{Enter}",
    );

    await waitFor(() => expect(createConversation).toHaveBeenCalled());
    expect(askChat).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "cnv_new" }),
    );
  });

  it("offers no New when the chat on screen is already a new one", async () => {
    messages = [];
    render(<AskPage />);

    // Pressing it would file an empty conversation into the history list and
    // leave the screen exactly as it was.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /new chat/i })).toBeDisabled(),
    );
  });

  it("offers New once the thread has something in it", async () => {
    setActiveChat("workspace:ask", "cnv_1");
    render(<AskPage />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /new chat/i })).toBeEnabled(),
    );
  });

  it("keeps reading the thread once one is chosen", async () => {
    // The other half: starting fresh must not mean the picker stops working.
    setActiveChat("workspace:ask", "cnv_1");
    render(<AskPage />);

    await waitFor(() => expect(lastQueryArg()).toEqual({ conversationId: "cnv_1" }));
  });

  it("drops the thread when deleting emptied it", async () => {
    // The delete invalidates the chat, and the refetch no longer has those
    // messages or that thread — modelled here, because a mock that kept
    // serving the deleted thread would let the page correctly re-adopt it and
    // the test would be asserting against a state the server cannot produce.
    unwrap.mockImplementation(async () => {
      messages = [];
      conversations = [];
      return { deletedMessages: 2, conversationDeleted: true };
    });
    setActiveChat("workspace:ask", "cnv_1");
    render(<AskPage />);
    await waitFor(() => expect(lastQueryArg()).toEqual({ conversationId: "cnv_1" }));

    await userEvent.click(screen.getAllByRole("button", { name: /delete this exchange/i })[0]);

    // The thread went with the exchange. Keeping its id is what made every
    // later request 404.
    await waitFor(() => expect(lastQueryArg()).toBeUndefined());
  });

  it("lands on a clean sheet rather than an older thread when one is emptied", async () => {
    // Changed deliberately. This used to assert that the page moved to the
    // remaining thread, reached by dropping the id and letting an unscoped
    // read return the most recent one. That is the same "resumed into an old
    // conversation" behaviour AI Chat now avoids everywhere else, and it is
    // more startling here than on open — the thread arrives unasked, in
    // response to a delete.
    //
    // The remaining thread is not lost; it is one click away in the picker.
    unwrap.mockImplementation(async () => {
      messages = [message({ id: "msg_9", conversationId: "cnv_2", content: "Older question" })];
      conversations = [{ ...conversations[0], id: "cnv_2", title: "Older" }];
      return { deletedMessages: 2, conversationDeleted: true };
    });
    setActiveChat("workspace:ask", "cnv_1");
    render(<AskPage />);
    await waitFor(() => expect(lastQueryArg()).toEqual({ conversationId: "cnv_1" }));

    await userEvent.click(screen.getAllByRole("button", { name: /delete this exchange/i })[0]);

    await waitFor(() => expect(lastQueryArg()).toBeUndefined());
    expect(await screen.findByText("New chat")).toBeInTheDocument();
  });

  it("keeps the thread when other exchanges remain", async () => {
    unwrap.mockResolvedValue({ deletedMessages: 2, conversationDeleted: false });
    setActiveChat("workspace:ask", "cnv_1");
    render(<AskPage />);
    await waitFor(() => expect(lastQueryArg()).toEqual({ conversationId: "cnv_1" }));

    await userEvent.click(screen.getAllByRole("button", { name: /delete this exchange/i })[0]);

    // Resetting here would jump the user out of the thread they are reading.
    await waitFor(() =>
      expect(deleteExchange).toHaveBeenCalledWith({ messageId: "msg_1", scope: "ME" }),
    );
    expect(lastQueryArg()).toEqual({ conversationId: "cnv_1" });
  });

  it("heals from a thread that vanished some other way", async () => {
    // Another tab, a stale id, a thread emptied elsewhere. Without this the
    // chat is stuck on 404 with no way out but a reload.
    setActiveChat("workspace:ask", "cnv_1");
    const { rerender } = render(<AskPage />);
    await waitFor(() => expect(lastQueryArg()).toEqual({ conversationId: "cnv_1" }));

    chatIsError = true;
    messages = [];
    rerender(<AskPage />);

    await waitFor(() => expect(lastQueryArg()).toBeUndefined());
  });

  it("does not loop when the unscoped read also fails", async () => {
    // The guard only fires while an id is held, so a server that is simply down
    // must not spin this effect.
    chatIsError = true;
    messages = [];
    conversations = [];
    render(<AskPage />);

    await waitFor(() => expect(lastQueryArg()).toBeUndefined());
    const calls = chatQuery.mock.calls.length;
    await new Promise((r) => setTimeout(r, 50));
    expect(chatQuery.mock.calls.length).toBe(calls);
  });
});

describe("a starter chip that is an opening rather than a question", () => {
  /**
   * Two of the six workspace prompts end in a space -- "Find every discussion
   * about ", "What did " -- because the reader finishes them. Sending one as
   * written would ask the model to search for nothing, so `ChatSuggestions`
   * routes them to `onCompose` instead of `onSend`.
   *
   * This page passed `() => undefined` for that, so those two chips were drawn,
   * were not disabled, and did nothing at all when clicked. Asserted here as
   * well as on the Home rail because the wiring is per surface: the shared hook
   * has no say in it, and the meeting page had it right the whole time.
   */
  async function showTheSecondRow() {
    messages = [];
    conversations = [];
    // The row moves along by three per visit, and the openings sit below the
    // first three. Mounting twice is how a second visit is spelled -- see
    // lib/use-rotating-prompts, where the offset is advanced in an effect so
    // the row on screen never moves under the cursor.
    render(<AskPage />).unmount();
    render(<AskPage />);
    await screen.findByRole("button", { name: "Find a mention" });
  }

  it("puts it in the composer instead of sending it", async () => {
    await showTheSecondRow();

    await userEvent.click(screen.getByRole("button", { name: "Find a mention" }));

    expect(screen.getByLabelText("Ask a question")).toHaveValue(
      "Find every discussion about ",
    );
    expect(askChat).not.toHaveBeenCalled();
    expect(createConversation).not.toHaveBeenCalled();
  });

  it("still sends the chip beside it, which is a whole question", async () => {
    await showTheSecondRow();

    await userEvent.click(
      screen.getByRole("button", { name: "Conflicting decisions" }),
    );

    await waitFor(() => expect(askChat).toHaveBeenCalled());
    expect(askChat.mock.calls[0][0].question).toMatch(/^Do any decisions/);
  });
});

/**
 * Leaving and coming back.
 *
 * <p>The product rule is that leaving this page and returning to it opens a new
 * chat. Where that is *not* implemented is here, and this block exists to pin
 * that down — see lib/chat-route.ts for the rule and lib/chat-route.test.tsx
 * for the cases.
 *
 * <p>The first version of it was implemented at this boundary: the page's own
 * unmount cleared the thread. It gave the right answer for `/ask` and for Home,
 * whose panels unmount exactly when their routes do, and the wrong one for a
 * meeting, whose chat is a tab and unmounts every time somebody opens the
 * outline. So the mechanism moved to the shell, which is the only thing that
 * sees a route change, and this page's lifetime stopped meaning anything.
 *
 * <p>Forgotten, not deleted, in either case: the conversation stays in the
 * archive and one click away in the picker.
 */
describe("what this page does not decide", () => {
  it("keeps its thread when the page component unmounts", () => {
    /*
     * INVERTED DELIBERATELY. This asserted the opposite one commit ago.
     *
     * <p>A page component unmounting is not the event the rule is about, and
     * treating it as one is what broke the meeting chat. Rendering this page
     * without the shell — which is what these tests do — is a surface with no
     * route boundary above it, and the thread should survive that untouched.
     */
    setActiveChat("workspace:ask", "cnv_1");
    const { unmount } = render(<AskPage />);
    expect(activeChat("workspace:ask")).toBe("cnv_1");

    unmount();

    expect(activeChat("workspace:ask")).toBe("cnv_1");
  });

  it("keeps the other surface's thread out of its picker", () => {
    // Home's pane and this page are keyed apart. They read the same meetings
    // through the same endpoints, so a shared key would have looked like it
    // worked — and a question asked on Home would have appeared here.
    setActiveChat("workspace:home", "cnv_home");

    render(<AskPage />);

    expect(activeChat("workspace:ask")).toBeNull();
    expect(activeChat("workspace:home")).toBe("cnv_home");
  });

  it("still lists a forgotten conversation in the history picker", async () => {
    /*
     * The other half of the rule, and the half worth proving on a surface that
     * actually renders the picker: resetting which thread is active must not
     * touch the archive. `forgetChatsLeftBehind` imports two module stores and
     * no endpoint — see its own tests — and this is what that looks like from
     * the outside.
     */
    setActiveChat("workspace:ask", "cnv_1");
    render(<AskPage />);

    act(() => forgetChatsLeftBehind("/home"));

    // Off the thread, and the thread still reachable.
    await waitFor(() => expect(screen.getByText("New chat")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /previous chat history/i }));
    expect(screen.getByRole("menuitem", { name: /Still open/ })).toBeInTheDocument();
  });
});

/**
 * The column the conversation is set in.
 *
 * <p>Not a rounder number for its own sake. 680px at the reading size is about
 * 74 characters, which is the measurement the whole V2 layout is built to
 * protect — and it is the same column a transcript and a brief are set in, so
 * moving between them is not a change of reading posture. What is new is the
 * 400px beside it, which holds the passages the answer was built on; 680 + 40 +
 * 400 is the 70rem document this page centres.
 *
 * <p>All three regions are pinned to it, because they have drifted apart
 * before: the thread at one width and the composer at another gives the box a
 * visible step relative to the answer above it, which reads as a rendering
 * fault. The header is in that list now and did not used to be — see the second
 * test.
 *
 * <p>`ResizeObserver` is stubbed globally as a no-op, because jsdom has no
 * layout to observe, so the panel never learns it is wide and these have to say
 * so. Which is the honest arrangement: the width is a real measurement of a
 * real element, and a test that wants the wide composition has to supply one.
 */
describe("the measure", () => {
  /**
   * Report a width once, synchronously, to whoever observes anything.
   *
   * <p>Fired from `observe` rather than from the constructor: the panel
   * constructs the observer and *then* observes its root, and a callback that
   * runs before the element is attached would be measuring nothing.
   */
  // `stubGlobal` is not undone between tests unless it is asked to be, and the
  // rest of this file relies on the setup's no-op observer.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubWidth(width: number) {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private cb: ResizeObserverCallback) {}
        observe() {
          this.cb(
            [{ contentRect: { width } } as unknown as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
        }
        unobserve() {}
        disconnect() {}
      },
    );
  }

  it("holds the thread and the composer to one document column", () => {
    stubWidth(1440);
    const { container } = render(<AskPage />);

    const regions = Array.from(container.querySelectorAll("[data-ask-region]"));
    expect(regions.map((r) => r.getAttribute("data-ask-region"))).toEqual([
      "header",
      "thread",
      "dock",
    ]);
    // One column, stated once per region rather than two numbers that agree by
    // coincidence.
    for (const name of ["thread", "dock"]) {
      const region = container.querySelector(`[data-ask-region="${name}"]`);
      expect(region?.querySelector(".max-w-\\[70rem\\]"), name).not.toBeNull();
    }
  });

  it("anchors the header to the panel's corners rather than to the column", () => {
    /*
     * CHANGED DELIBERATELY. This used to assert all three regions were held to
     * the 70rem column, header included.
     *
     * <p>In a 1600px window that put the conversation picker 240px in from the
     * left edge and New chat 240px short of the right, under a band that runs
     * from edge to edge — a row of chrome floating in the middle of the page
     * rather than the panel's own top. A header belongs to the surface it is
     * on. The reading measure is for reading, and it still holds the thread and
     * the composer below.
     */
    stubWidth(1440);
    const { container } = render(<AskPage />);

    const header = container.querySelector('[data-ask-region="header"]');
    expect(header?.querySelector(".max-w-\\[70rem\\]")).toBeNull();
    // And the picker really is inside that region rather than somewhere else.
    expect(header?.querySelector('button[aria-label="Previous chat history"]')).not.toBeNull();
  });

  it("sets the composer to the answer's measure, not the answer plus its sources", () => {
    /*
     * The composer was `70rem` — 1120px — while what sits above it is 680px of
     * answer and, 40px further right, 400px of quotes. So the box lined up with
     * the right-hand edge of the footnotes and overhung the prose by 440: the
     * widest element on the page, holding one line of placeholder.
     *
     * <p>42.5rem is the answer's own track. The box now begins where the prose
     * begins and ends where the prose ends.
     */
    stubWidth(1440);
    setActiveChat("workspace:ask", "cnv_1");
    const { container } = render(<AskPage />);

    const dock = container.querySelector('[data-ask-region="dock"]');
    expect(dock?.querySelector(".max-w-\\[42\\.5rem\\]")).not.toBeNull();
  });

  it("docks the composer at the bottom on an empty thread as well as a full one", () => {
    /*
     * REGRESSION. For one turn an empty thread centred the composer in the
     * panel, and it was reported on sight — on this page and in Home's pane.
     * The composer is the one control here, and putting it in the middle puts
     * it where it will never be again: the first question sends it to the foot,
     * so it moves the first time anybody uses it, and until then it sits in the
     * space the conversation is about to occupy.
     *
     * <p>Both states, in one test, because what matters is that they are the
     * same state. The empty thread is what this page opens on — it starts on a
     * clean sheet by design — and naming a conversation is what fills it.
     */
    stubWidth(1440);
    const empty = render(<AskPage />);
    expect(empty.container.querySelector('[data-ask-region="dock"]')?.className).toContain(
      "shrink-0",
    );
    expect(
      empty.container.querySelector('[data-ask-region="dock"]')?.className,
    ).not.toContain("justify-center");
    expect(empty.container.querySelector('[data-ask-region="thread"]')?.className).toContain(
      "flex-1",
    );
    empty.unmount();

    setActiveChat("workspace:ask", "cnv_1");
    const full = render(<AskPage />);
    expect(full.container.querySelector('[data-ask-region="dock"]')?.className).toContain(
      "shrink-0",
    );
    expect(full.container.querySelector('[data-ask-region="thread"]')?.className).toContain(
      "flex-1",
    );
  });

  it("centres the composer in the panel, in both states", () => {
    /*
     * Horizontally, and it is the panel's centre rather than the answer's left
     * edge.
     *
     * <p>Left-aligned in `COLUMN` was tried, on the reasoning that the box
     * belongs in the column its answer will appear in. `COLUMN` is 1120 because
     * it is the answer *and* its evidence rail -- and the composer's row has no
     * evidence rail, so a 680px box pinned to its left sat 220px off centre
     * with nothing to its right. It reads as slipped rather than as aligned,
     * and it was reported that way.
     *
     * <p>Asserted in both states, because that is the guarantee: the box does
     * not move when the first question is asked. `mx-auto` inside a centred
     * `max-w-[70rem]` is the panel's centre at every width above the
     * two-column threshold.
     */
    stubWidth(1440);
    const centred = ".mx-auto.max-w-\\[42\\.5rem\\]";

    const empty = render(<AskPage />);
    expect(
      empty.container.querySelector('[data-ask-region="dock"]')!.querySelector(centred),
      "an empty thread",
    ).not.toBeNull();
    empty.unmount();

    setActiveChat("workspace:ask", "cnv_1");
    const full = render(<AskPage />);
    expect(
      full.container.querySelector('[data-ask-region="dock"]')!.querySelector(centred),
      "a thread with turns in it",
    ).not.toBeNull();
  });

  it("draws the same wash every other page in the shell has", () => {
    // It was the one page without it: near-black from the band to the
    // composer, which is how it came to look like a different application.
    const { container } = render(<AskPage />);

    expect(container.querySelector(".v2-ambient")).not.toBeNull();
  });

  it("sets the answer to the prose measure and the evidence beside it", () => {
    stubWidth(1440);
    // A thread has to be open for there to be a turn: the page starts on a new
    // chat and reads nothing until one is named.
    setActiveChat("workspace:ask", "cnv_1");
    const { container } = render(<AskPage />);

    // 42.5rem is the 680px measure; 15-25rem is the evidence rail. Two tracks,
    // so an answer is read at the same line length as the transcript it came
    // from rather than at the width of the monitor.
    const turn = container.querySelector("article");
    expect(turn?.className).toContain("grid-cols-[minmax(0,42.5rem)_minmax(15rem,25rem)]");
  });

  it("stacks them instead when the panel is too narrow to hold both", () => {
    /*
     * The same panel is the 26rem side pane on Home, and it is a full-width
     * 768px pane on a tablet. Neither can hold both columns well: 416 cannot
     * hold them at all, and 768 resolves to `296px 400px` — the footnotes
     * wider than the answer. So below `TWO_COLUMN_AT` the sources go under the
     * answer they belong to.
     */
    stubWidth(420);
    setActiveChat("workspace:ask", "cnv_1");
    const { container } = render(<AskPage />);

    const turn = container.querySelector("article");
    expect(turn?.className).not.toContain("grid-cols-");
    // And nothing is centred in a column it does not fill.
    expect(container.querySelector(".max-w-\\[70rem\\]")).toBeNull();
  });

  it("sizes itself against the band rather than a hardcoded header", () => {
    // The chrome above is 48px and is published as `--band`. A page that
    // hardcodes the old 4rem scrolls its own composer off the bottom.
    const { container } = render(<AskPage />);

    expect(container.innerHTML).toContain("100vh-var(--band)");
  });
});
