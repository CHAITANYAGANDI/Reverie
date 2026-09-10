import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  askReverie,
  clearAskHandoff,
  resetAskHandoff,
  useAskHandoff,
} from "@/lib/ask-handoff";

/**
 * The one thing Search and Ask share.
 *
 * <p>Search is deterministic retrieval; Ask is synthesis over the same archive.
 * What passes between them is a string, and this is the whole of the channel —
 * which is the point: a search box that called the chat API would be a second
 * chat client, with its own idea of what a citation is.
 */
beforeEach(() => {
  resetAskHandoff();
});

describe("the handoff", () => {
  it("carries the question to whoever is listening", () => {
    const { result } = renderHook(() => useAskHandoff());
    expect(result.current).toBeNull();

    act(() => askReverie("why did we change the provider"));

    expect(result.current?.text).toBe("why did we change the provider");
  });

  it("trims, and refuses to carry nothing", () => {
    const { result } = renderHook(() => useAskHandoff());

    act(() => askReverie("  diarization  "));
    expect(result.current?.text).toBe("diarization");

    act(() => askReverie("   "));
    // Still the first one: an empty handoff would clear a real question and
    // put an empty box on screen where an answer was being asked for.
    expect(result.current?.text).toBe("diarization");
  });

  it("is a different handoff every time, even for the same words", () => {
    /*
     * Search "diarization", read the answer, come back and do it again. A store
     * keyed on the text alone would swallow the second attempt, which is the
     * same bug `ChatComposer` keys its own effect on a nonce to avoid.
     */
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useAskHandoff());

      act(() => askReverie("diarization"));
      const first = result.current!.nonce;

      act(() => {
        vi.advanceTimersByTime(5);
        askReverie("diarization");
      });

      expect(result.current!.nonce).not.toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is cleared once it has been taken", () => {
    // Otherwise coming back to /ask next week types last week's search into the
    // box: the surface's own state is gone by then, but a module store is not.
    const { result } = renderHook(() => useAskHandoff());

    act(() => askReverie("diarization"));
    act(() => clearAskHandoff());

    expect(result.current).toBeNull();
  });

  it("tells every listener at once", () => {
    const a = renderHook(() => useAskHandoff());
    const b = renderHook(() => useAskHandoff());

    act(() => askReverie("diarization"));

    // Two Ask surfaces exist — the side pane and `/ask` — and only one is
    // mounted at a time, but the store must not care which.
    expect(a.result.current?.text).toBe("diarization");
    expect(b.result.current?.text).toBe("diarization");
  });
});
