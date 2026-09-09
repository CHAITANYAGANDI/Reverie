import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ActionItemListQuery, ActionItemResponse } from "@/lib/types";

/**
 * The hook behind the margin, and specifically the two questions it asks.
 *
 * <h2>The bug this file is about</h2>
 *
 * <p>Ticking an action item off in Home's margin struck it through and then it
 * was gone — not under Completed, not there after a reload, and the Completed
 * count stayed at zero however much you finished.
 *
 * <p>The write was fine and the component was fine. This hook asked with
 * `status: undefined` meaning "give me both views and I will split them", and
 * an omitted `status` is `OPEN_ANY` at the server — everything *unfinished*.
 * So the finished half of the list was never fetched, and the item you had
 * just finished dropped out of the only response that mentioned it.
 *
 * <p>`components/v2/now/action-items.test` covers what the margin draws, and
 * covers it by handing the component two arrays directly — which is right for
 * testing the rows and is exactly why this went unnoticed for as long as it
 * did. What is under test here is the pair of requests and how their two
 * answers are combined.
 */

const calls = vi.hoisted(() => ({ queries: [] as ActionItemListQuery[] }));

/**
 * Per-status responses, so a test can fail one half and answer the other.
 *
 * <p>`items` is what RTK holds, and holding nothing is its own case: absent
 * `items` means `data === undefined`. So `{ error: true }` is a request that
 * failed with nothing behind it, and `{ items: [...], error: true }` is a
 * background refresh that failed over rows already on screen — two states that
 * `resourceState` answers differently and that a single `error` flag cannot
 * tell apart.
 */
type Half = { items?: ActionItemResponse[]; loading?: boolean; error?: boolean };
let openHalf: Half;
let doneHalf: Half;

function answer({ items, loading, error }: Half) {
  return {
    data: items && {
      content: items,
      page: 0,
      size: 100,
      totalElements: items.length,
      totalPages: 1,
    },
    isLoading: loading === true,
    isFetching: loading === true,
    isError: error === true,
    isSuccess: items !== undefined && !loading && !error,
    isUninitialized: false,
    refetch: vi.fn(),
  };
}

vi.mock("@/lib/api", () => ({
  useGetActionItemsQuery: (q: ActionItemListQuery) => {
    calls.queries.push(q);
    return answer(q.status === "DONE" ? doneHalf : openHalf);
  },
  usePatchActionItemMutation: () => [vi.fn(() => ({ unwrap: () => Promise.resolve({}) })), {}],
  useCreateStandaloneActionItemMutation: () => [
    vi.fn(() => ({ unwrap: () => Promise.resolve({}) })),
    { isLoading: false },
  ],
}));

import { useActionItems, combinedPresence } from "@/components/v2/now/use-action-items";

function anItem(over: Partial<ActionItemResponse> = {}): ActionItemResponse {
  return {
    id: "ai_1",
    meetingId: null,
    meetingTitle: null,
    title: "Send the deck",
    ownerName: null,
    dueDate: null,
    dueStatus: null,
    status: "OPEN",
    sourceSentence: null,
    commentCount: 0,
    createdAt: new Date().toISOString(),
    ...over,
  } as ActionItemResponse;
}

/** Renders the hook and prints what it returned, for reading off the DOM. */
function Probe() {
  const items = useActionItems();
  return (
    <div>
      <span data-testid="state">{items.state}</span>
      <span data-testid="open">{items.open.map((i) => i.title).join("|")}</span>
      <span data-testid="done">{items.done.map((i) => i.title).join("|")}</span>
    </div>
  );
}

function read(id: "state" | "open" | "done") {
  return screen.getByTestId(id).textContent;
}

beforeEach(() => {
  calls.queries = [];
  openHalf = { items: [] };
  doneHalf = { items: [] };
});

describe("what the margin asks the server for", () => {
  it("asks for the finished items as well as the open ones", () => {
    /*
     * THE FIX. Two requests, in the two words the API has: `OPEN_ANY` and
     * `DONE`. There is no third word — `status=` is not "no filter" either,
     * because Spring substitutes the parameter's default for an empty value as
     * well as for a missing one.
     */
    render(<Probe />);

    expect(calls.queries.map((q) => q.status).sort()).toEqual(["DONE", "OPEN_ANY"]);
  });

  it("never asks with no status, which would ask for the open ones twice", () => {
    // The bug, spelled as the request that caused it.
    render(<Probe />);

    for (const q of calls.queries) {
      expect(q.status).toBeDefined();
    }
  });

  it("asks only for what nobody's transcript produced", () => {
    // Unchanged, and the rule this list exists under: a commitment made in a
    // meeting is read on that meeting, beside the sentence it came from.
    render(<Probe />);

    for (const q of calls.queries) {
      expect(q.standalone).toBe(true);
    }
  });

  it("bounds both halves the same, so neither truncates first", () => {
    render(<Probe />);

    expect(calls.queries.map((q) => q.size)).toEqual([100, 100]);
  });
});

describe("the two answers, combined", () => {
  it("puts a finished item under done and an open one under open", () => {
    openHalf = { items: [anItem({ id: "ai_o", title: "Still to do" })] };
    doneHalf = { items: [anItem({ id: "ai_d", title: "Finished", status: "DONE" })] };
    render(<Probe />);

    expect(read("open")).toBe("Still to do");
    expect(read("done")).toBe("Finished");
    expect(read("state")).toBe("ready");
  });

  it("keeps an in-progress item open, because it is still outstanding", () => {
    // `OPEN_ANY` is what the request says, so the server does this split and
    // the hook does not have to. Asserted anyway: a later change back to
    // `status=OPEN` would silently hide half of somebody's list.
    openHalf = { items: [anItem({ status: "IN_PROGRESS", title: "Half written" })] };
    render(<Probe />);

    expect(read("open")).toBe("Half written");
    expect(read("done")).toBe("");
  });

  it("is empty only when both halves answered and both were empty", () => {
    render(<Probe />);

    expect(read("state")).toBe("empty");
  });

  it("waits for the second half rather than drawing the first", () => {
    // Otherwise the margin renders Open with rows and Completed as "Nothing
    // finished yet." while the request that would have filled it is still out.
    openHalf = { items: [anItem()] };
    doneHalf = { loading: true };
    render(<Probe />);

    expect(read("state")).toBe("loading");
  });

  it("says the region failed when either half failed", () => {
    /*
     * THE COST OF SPLITTING THE LIST, PAID HERE.
     *
     * <p>With one request a half-answer was impossible. With two, the finished
     * half can fail while the open half succeeds — and `ready` would then draw
     * "Nothing finished yet." under Completed on the strength of a request
     * that never came back. That is the exact lie lib/resource-state exists to
     * prevent, so `combinedPresence` refuses to call the pair settled until
     * both have answered and the region reports the failure with a retry.
     */
    openHalf = { items: [anItem()] };
    doneHalf = { error: true };
    render(<Probe />);

    expect(read("state")).toBe("error");
  });

  it("holds what is on screen through a failed background refresh", () => {
    // The other side of the same rule: a refetch that fails over data already
    // fetched keeps the data. Both halves still have their content, so there
    // is nothing missing to be honest about.
    openHalf = { items: [anItem()] };
    doneHalf = { items: [anItem({ id: "ai_d", status: "DONE" })], error: true };
    render(<Probe />);

    expect(read("state")).toBe("ready");
  });
});

describe("combinedPresence", () => {
  it("does not settle for one answer out of two", () => {
    expect(combinedPresence("some", "unknown")).toBe("unknown");
    expect(combinedPresence("unknown", "none")).toBe("unknown");
  });

  it("counts rows in either half as rows", () => {
    expect(combinedPresence("none", "some")).toBe("some");
    expect(combinedPresence("some", "none")).toBe("some");
  });

  it("is empty only when both are", () => {
    expect(combinedPresence("none", "none")).toBe("none");
  });
});
