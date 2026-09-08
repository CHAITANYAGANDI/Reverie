import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

/**
 * The composer, stubbed. It is the heaviest thing in the panel — the context
 * picker, the mode menu, the allowance — and none of it is what this file is
 * about. `chat-composer.test.tsx` owns it.
 */
vi.mock("@/components/chat-composer", () => ({
  ChatComposer: () => <textarea aria-label="Ask anything" />,
  NO_CONTEXT: { meetingIds: [], projectIds: [] },
}));

/** One stub for the whole workspace chat. Its own tests cover the wiring. */
const chat = {
  messages: [] as unknown[],
  conversations: [],
  conversationId: null,
  isNew: true,
  pending: null,
  showPrompts: false,
  setConversationId: vi.fn(),
  suggestions: undefined,
  modes: [],
  mode: "express",
  setMode: vi.fn(),
  context: { meetingIds: [], projectIds: [] },
  setContext: vi.fn(),
  meetings: [],
  projects: [],
  isLoading: false,
  asking: false,
  starting: false,
  clearing: false,
  deleting: false,
  send: vi.fn(),
  retry: vi.fn(),
  startNew: vi.fn(),
  clearAll: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  removeExchange: vi.fn(),
};
const useWorkspaceChat = vi.fn((_surface: string) => chat);
/**
 * How many times the chat has been *mounted*, which is not how many times the
 * hook has been called — it runs on every render, and the pane opening and
 * closing is a render of the thing above it.
 */
let mounts = 0;
vi.mock("@/lib/use-workspace-chat", async () => {
  const React = await import("react");
  return {
    useWorkspaceChat: (surface: string) => {
      React.useEffect(() => {
        mounts += 1;
      }, []);
      return useWorkspaceChat(surface);
    },
  };
});

import { openSidePane, closeSidePane, resetSidePane, useSidePane } from "@/components/side-pane";
import { WorkspaceAsk, WorkspaceAskPane } from "@/components/chat/workspace-ask";

/**
 * How the tests tell whether the chat is mounted.
 *
 * <p>It was `getByRole("heading", { name: "Ask Reverie" })` — the panel's
 * title, which no longer exists: the header identifies itself with the mark
 * alone now. The three region markers are what `AskPanel` always draws and are
 * the honest structural signal.
 */
const MOUNTED = '[data-ask-region="header"]';

/** Whether the shell would be showing the pane. */
function PaneState() {
  const pane = useSidePane();
  return <p>pane: {pane.open ? "open" : "closed"}</p>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mounts = 0;
  resetSidePane();
});

/**
 * HOME'S COPY, and when it is mounted.
 *
 * <p>Two opposing costs, and the mount latch is what settles them.
 *
 * <p>Mounting it with Home would put the workspace chat's five queries —
 * conversations, suggestions, modes, a page of meetings, the folders — on every
 * visit to the page the application opens on, to have a panel ready that most
 * visits never open.
 *
 * <p>Unmounting it when the pane closes would throw work away. A question
 * still being answered lives in a module store and would survive, but a
 * half-typed one, the chosen mode and the context chips are component state and
 * would not — so shutting the panel to read the list behind it would come back
 * to an empty box. Worse, it would make the panel's lifetime meaningful again,
 * which is the mistake lib/chat-route.ts exists to undo.
 */
describe("WorkspaceAskPane", () => {
  it("costs nothing until somebody asks for it", () => {
    render(<WorkspaceAskPane />);

    // Not merely hidden: not mounted, so the hook has not run and no request
    // has been made.
    expect(document.querySelector(MOUNTED)).toBeNull();
    expect(useWorkspaceChat).not.toHaveBeenCalled();
  });

  it("mounts the chat when the pane is opened", () => {
    render(<WorkspaceAskPane />);

    act(() => openSidePane());

    expect(document.querySelector(MOUNTED)).not.toBeNull();
    // Home's own thread, not `/ask`'s. See `ChatSurface`.
    expect(useWorkspaceChat).toHaveBeenCalledWith("home");
  });

  it("stays mounted when the pane is closed, so nothing typed is lost", () => {
    render(<WorkspaceAskPane />);
    act(() => openSidePane());

    act(() => closeSidePane());

    // The shell's aside is `hidden` when the pane is shut, so this costs
    // nothing on screen — and it is what makes closing and reopening resume
    // the same thread with the same box. See lib/chat-route.test.tsx for the
    // thread half of that.
    expect(document.querySelector(MOUNTED)).not.toBeNull();
  });

  it("resumes the same panel when the pane is opened again", () => {
    render(<WorkspaceAskPane />);
    act(() => openSidePane());
    act(() => closeSidePane());

    act(() => openSidePane());

    // Mounted once across open, close and open. The hook is *called* on every
    // render of it, which is why this counts mounts instead — the thing being
    // asserted is that the component was never torn down and rebuilt.
    expect(mounts).toBe(1);
  });
});

describe("the pane's way out", () => {
  it("shuts the pane", async () => {
    render(
      <>
        <PaneState />
        <WorkspaceAskPane />
      </>,
    );
    act(() => openSidePane());
    expect(screen.getByText("pane: open")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close Ask Reverie" }));

    expect(screen.getByText("pane: closed")).toBeInTheDocument();
  });
});

describe("the same chat as a route", () => {
  it("offers no way out, because there is nothing to shut", () => {
    render(<WorkspaceAsk surface="ask" variant="page" />);

    // `/ask` is a destination rather than a summoned surface.
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
    expect(useWorkspaceChat).toHaveBeenCalledWith("ask");
  });

  it("draws the maximise control and refuses it", () => {
    render(<WorkspaceAsk surface="ask" variant="page" />);

    /*
     * Already as big as this chat gets. Ordinarily a control that cannot act
     * is worse than no control, but the three surfaces share a header and a
     * maximise button simply missing from one of them reads as a panel that
     * has lost a feature. See `expandDisabled` in components/chat-history.
     */
    // Named for what it would do, which on this surface is nothing — see the
    // `aria-label` in components/chat-history.
    expect(screen.getByRole("button", { name: "This is already the full chat" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Expand the chat" })).not.toBeInTheDocument();
  });

  it("keeps its own thread identity separate from Home's", () => {
    render(<WorkspaceAsk surface="ask" variant="page" />);

    // The one thing `surface` does. It must never reach a request — both
    // surfaces read the same workspace scope on the server.
    expect(useWorkspaceChat).toHaveBeenCalledWith("ask");
    expect(useWorkspaceChat).not.toHaveBeenCalledWith("home");
  });
});
