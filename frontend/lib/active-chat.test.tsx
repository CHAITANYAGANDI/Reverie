import { describe, it, expect, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, act } from "@testing-library/react";
import {
  activeChat,
  chatOrigins,
  forgetActiveChats,
  resetActiveChats,
  setActiveChat,
  useActiveChat,
} from "@/lib/active-chat";

/**
 * Which thread each chat surface is on, and how long it stays on it.
 *
 * **A thread belongs to one surface.** The pane Home opens and the `/ask` route
 * read the same meetings through the same endpoints and are still two screens,
 * so they are keyed apart (`workspace:home`, `workspace:ask`). They shared one
 * key while Home's expand button navigated to /ask and the two had to be one
 * conversation; the pane maximises in place now.
 *
 * **A thread survives its component.** Every surface's chat unmounts for
 * reasons that have nothing to do with navigation — the side pane closes, the
 * pane is maximised, a meeting's Outline tab opens — and the conversation has
 * to be there when it comes back. That is why this is a module store and not
 * `useState`, and the tests for it are the mount/unmount/remount ones below.
 *
 * **`resetOnLeave` is gone.** It cleared the thread on the chat component's
 * unmount, which is an accurate implementation of a different rule: the product
 * rule is about leaving a *page*. It looked right on Home and `/ask`, whose
 * panels unmount exactly when their routes do, and it was wrong on a meeting,
 * whose panel is a tab. What replaced it is `origins` — recorded here, judged
 * in lib/chat-route.ts, and tested there.
 */

/** A surface that shows a scope's thread and can be unmounted like a panel. */
function Surface({ scope }: { scope: string }) {
  const [conversationId] = useActiveChat(scope);
  return <p>{scope}: {conversationId ?? "new chat"}</p>;
}

beforeEach(() => {
  resetActiveChats();
  window.history.pushState({}, "", "/home");
});

describe("a surface", () => {
  it("starts on a new chat", () => {
    render(<Surface scope="workspace:home" />);

    expect(screen.getByText("workspace:home: new chat")).toBeInTheDocument();
  });

  it("stays on its thread while you are on the page", () => {
    render(<Surface scope="workspace:home" />);

    act(() => setActiveChat("workspace:home", "cnv_1"));

    expect(screen.getByText("workspace:home: cnv_1")).toBeInTheDocument();
  });

  it("keeps its thread when its panel unmounts and comes back", () => {
    // Closing the side pane, maximising it, or opening a meeting's Outline tab.
    // None of those is navigation, and all of them unmount a chat panel.
    const panel = render(<Surface scope="workspace:home" />);
    act(() => setActiveChat("workspace:home", "cnv_1"));

    panel.unmount();
    render(<Surface scope="workspace:home" />);

    expect(screen.getByText("workspace:home: cnv_1")).toBeInTheDocument();
  });
});

describe("where a thread was adopted", () => {
  it("is recorded with it", () => {
    window.history.pushState({}, "", "/meetings/mtg_1");

    act(() => setActiveChat("meeting:mtg_1", "cnv_9"));

    // lib/chat-route.ts is the only reader. What it needs is "was this adopted
    // somewhere I no longer am?", which a pathname answers and an unmount
    // does not.
    expect(chatOrigins().get("meeting:mtg_1")).toBe("/meetings/mtg_1");
  });

  it("is refreshed even when the thread does not change", () => {
    /*
     * `send()` adopts the thread twice — once before awaiting the answer and
     * once from the response — and the second call is the one that can land
     * after the reader has navigated away. It sets the same id, so a no-op
     * guard would leave the origin pointing at the page they asked on, and
     * coming back there would resume a thread the rule says is stale.
     */
    act(() => setActiveChat("workspace:home", "cnv_1"));
    window.history.pushState({}, "", "/library");

    act(() => setActiveChat("workspace:home", "cnv_1"));

    expect(chatOrigins().get("workspace:home")).toBe("/library");
  });

  it("goes when the thread does", () => {
    act(() => setActiveChat("workspace:home", "cnv_1"));

    act(() => setActiveChat("workspace:home", null));

    expect(chatOrigins().has("workspace:home")).toBe(false);
  });
});

describe("forgetting a thread", () => {
  it("leaves the surface on a new chat", () => {
    render(<Surface scope="workspace:home" />);
    act(() => setActiveChat("workspace:home", "cnv_1"));

    act(() => forgetActiveChats(["workspace:home"]));

    expect(screen.getByText("workspace:home: new chat")).toBeInTheDocument();
  });

  it("touches no other scope", () => {
    render(
      <>
        <Surface scope="meeting:mtg_1" />
        <Surface scope="workspace:home" />
      </>,
    );
    act(() => {
      setActiveChat("meeting:mtg_1", "cnv_9");
      setActiveChat("workspace:home", "cnv_1");
    });

    act(() => forgetActiveChats(["workspace:home"]));

    expect(activeChat("meeting:mtg_1")).toBe("cnv_9");
    expect(activeChat("workspace:home")).toBeNull();
  });

  it("is quiet about a scope that was not on one", () => {
    render(<Surface scope="workspace:home" />);

    // No thread, so nothing to forget and nothing to notify about.
    act(() => forgetActiveChats(["workspace:ask"]));

    expect(screen.getByText("workspace:home: new chat")).toBeInTheDocument();
  });
});

describe("the two workspace surfaces", () => {
  /*
   * Home's pane and the `/ask` route read the same meetings through the same
   * endpoints, and used to share one key — so a question asked in the pane
   * appeared on the page, and the page's answers appeared in the pane. That was
   * deliberate once: Home's expand button navigated to /ask, and losing the
   * thread there would have thrown away a half-typed question. The pane
   * maximises in place now, so nothing was left holding it up.
   *
   * Keyed apart, they are independent. What stays shared is the archive — one
   * conversation list, one set of endpoints — which is why the keys share a
   * prefix rather than being unrelated strings.
   */

  it("does not show the pane's conversation on the full page", () => {
    render(<Surface scope="workspace:home" />);
    act(() => setActiveChat("workspace:home", "cnv_asked_on_home"));

    render(<Surface scope="workspace:ask" />);

    expect(screen.getByText("workspace:ask: new chat")).toBeInTheDocument();
    expect(activeChat("workspace:ask")).toBeNull();
  });

  it("does not show the full page's conversation in the pane", () => {
    render(<Surface scope="workspace:ask" />);
    act(() => setActiveChat("workspace:ask", "cnv_asked_on_ask"));

    render(<Surface scope="workspace:home" />);

    expect(screen.getByText("workspace:home: new chat")).toBeInTheDocument();
  });

  it("keeps each surface on its own thread at the same time", () => {
    render(
      <>
        <Surface scope="workspace:home" />
        <Surface scope="workspace:ask" />
      </>,
    );

    act(() => setActiveChat("workspace:home", "cnv_1"));
    act(() => setActiveChat("workspace:ask", "cnv_2"));

    expect(screen.getByText("workspace:home: cnv_1")).toBeInTheDocument();
    expect(screen.getByText("workspace:ask: cnv_2")).toBeInTheDocument();
  });

  it("starts both from a clean sheet on a reload", () => {
    act(() => setActiveChat("workspace:home", "cnv_1"));
    act(() => setActiveChat("workspace:ask", "cnv_2"));

    // Nothing is persisted — the store is a module-level map, so a page load is
    // the reset. `resetActiveChats` is that, made callable.
    act(() => resetActiveChats());

    expect(activeChat("workspace:home")).toBeNull();
    expect(activeChat("workspace:ask")).toBeNull();
    expect(chatOrigins().size).toBe(0);
  });
});

describe("a meeting's chat", () => {
  it("keeps its thread across the panel unmounting", () => {
    const visit = render(<Surface scope="meeting:mtg_1" />);
    act(() => setActiveChat("meeting:mtg_1", "cnv_9"));
    visit.unmount();

    render(<Surface scope="meeting:mtg_1" />);

    // The Outline tab, and the thing most likely to be broken by a careless
    // change to the hook above: all three scopes go through it.
    expect(screen.getByText("meeting:mtg_1: cnv_9")).toBeInTheDocument();
  });

  it("keeps one meeting's thread separate from another's", () => {
    render(
      <>
        <Surface scope="meeting:mtg_1" />
        <Surface scope="meeting:mtg_2" />
      </>,
    );

    act(() => setActiveChat("meeting:mtg_1", "cnv_9"));

    expect(screen.getByText("meeting:mtg_1: cnv_9")).toBeInTheDocument();
    expect(screen.getByText("meeting:mtg_2: new chat")).toBeInTheDocument();
  });
});
