import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NowActionItems } from "@/components/v2/now/action-items";
import type { ActionItems } from "@/components/v2/now/use-action-items";
import type { ActionItemResponse } from "@/lib/types";

/**
 * The margin's list, and the two views of it.
 *
 * <h2>Why this file can exist now</h2>
 *
 * <p>The query used to live inside this component, so testing it meant mocking
 * `@/lib/api`. It is a prop now — Home fetches it once and passes it down,
 * because Home has to know whether the margin has anything in it before it can
 * decide whether to draw a column for it. The side effect is that the whole of
 * this component's behaviour is drivable from a plain object.
 *
 * <p>What is asserted: the counts come from the arrays and cannot disagree with
 * the rows; both empty states are true statements about the list rather than
 * about the network; and the things somebody can do to the list — add, tick
 * off, put back — still reach the mutations they always did.
 */

function anItem(over: Partial<ActionItemResponse> = {}): ActionItemResponse {
  return {
    id: "ai_1",
    title: "Book the room",
    status: "OPEN",
    ownerName: null,
    dueDate: null,
    createdAt: "2026-09-07T09:00:00Z",
    ...over,
  } as ActionItemResponse;
}

let add: ReturnType<typeof vi.fn>;
let toggle: ReturnType<typeof vi.fn>;
let refetch: ReturnType<typeof vi.fn>;

function controller(over: Partial<ActionItems> = {}): ActionItems {
  const open = over.open ?? [];
  const done = over.done ?? [];
  return {
    state: over.state ?? "ready",
    open,
    done,
    occupied: over.occupied ?? true,
    add,
    toggle,
    creating: false,
    retrying: false,
    refetch,
    ...over,
  };
}

const margin = (over: Partial<ActionItems> = {}) =>
  render(<NowActionItems items={controller(over)} />);

beforeEach(() => {
  add = vi.fn().mockResolvedValue(undefined);
  toggle = vi.fn().mockResolvedValue(undefined);
  refetch = vi.fn();
});

describe("the two views", () => {
  it("counts each from its own array", () => {
    /*
     * The count and the rows are the same array, so they cannot drift. The
     * expander this replaces said "Completed (N)" from `done.length` while the
     * list above it came from `open` -- two truths, which happened to agree.
     */
    margin({
      open: [anItem({ id: "a" }), anItem({ id: "b" })],
      done: [anItem({ id: "c", status: "DONE" })],
    });

    expect(screen.getByRole("button", { name: /Open \(2\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Completed \(1\)/ })).toBeInTheDocument();
  });

  it("opens on Open", () => {
    margin({
      open: [anItem({ title: "Book the room" })],
      done: [anItem({ id: "c", title: "Send the deck", status: "DONE" })],
    });

    expect(screen.getByRole("button", { name: /Open/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Book the room")).toBeInTheDocument();
    expect(screen.queryByText("Send the deck")).not.toBeInTheDocument();
  });

  it("switches to the finished ones, and back", async () => {
    margin({
      open: [anItem({ title: "Book the room" })],
      done: [anItem({ id: "c", title: "Send the deck", status: "DONE" })],
    });

    await userEvent.click(screen.getByRole("button", { name: /Completed/ }));

    expect(screen.getByText("Send the deck")).toBeInTheDocument();
    expect(screen.queryByText("Book the room")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Open/ }));

    expect(screen.getByText("Book the room")).toBeInTheDocument();
  });

  it("draws no switch at all on an empty list", () => {
    // A tab bar over nothing is chrome describing nothing.
    margin({ open: [], done: [] });

    expect(screen.queryByRole("button", { name: /^(Open|Completed) \(/ })).not.toBeInTheDocument();
  });
});

describe("what it says when a view is empty", () => {
  it("says nothing is on the list, and where meeting commitments live", () => {
    margin({ open: [], done: [] });

    expect(screen.getByText(/Nothing on your list/)).toBeInTheDocument();
    expect(screen.getByText(/stays on that meeting/)).toBeInTheDocument();
  });

  it("says nothing is finished, which is a different fact", async () => {
    /*
     * "Nothing on your list" under Completed would be false: there is
     * something on the list, and none of it is done.
     */
    margin({ open: [anItem()], done: [] });

    await userEvent.click(screen.getByRole("button", { name: /Completed/ }));

    expect(screen.getByText("Nothing finished yet.")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing on your list/)).not.toBeInTheDocument();
  });
});

describe("changing the list", () => {
  it("ticks one off through the mutation it always used", async () => {
    const item = anItem({ title: "Book the room" });
    margin({ open: [item] });

    await userEvent.click(screen.getByRole("checkbox", { name: "Complete Book the room" }));

    expect(toggle).toHaveBeenCalledWith(item);
  });

  it("puts a finished one back", async () => {
    const item = anItem({ id: "c", title: "Send the deck", status: "DONE" });
    margin({ open: [], done: [item] });
    await userEvent.click(screen.getByRole("button", { name: /Completed/ }));

    await userEvent.click(screen.getByRole("checkbox", { name: "Reopen Send the deck" }));

    expect(toggle).toHaveBeenCalledWith(item);
  });

  it("adds what was typed, and comes back to Open to show it", async () => {
    // Filing the thing you just added behind a tab you are not looking at is
    // the same as losing it.
    margin({ open: [], done: [anItem({ id: "c", status: "DONE" })] });
    await userEvent.click(screen.getByRole("button", { name: /Completed/ }));

    await userEvent.click(screen.getByRole("button", { name: /Add/ }));
    await userEvent.type(screen.getByLabelText("New action item"), "Book the room{Enter}");

    expect(add).toHaveBeenCalledWith("Book the room");
    expect(screen.getByRole("button", { name: /Open/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("abandons the draft on Escape", async () => {
    margin({ open: [anItem()] });
    await userEvent.click(screen.getByRole("button", { name: /Add/ }));

    await userEvent.type(screen.getByLabelText("New action item"), "never mind{Escape}");

    expect(add).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("New action item")).not.toBeInTheDocument();
  });
});

describe("before and instead of an answer", () => {
  it("shows no list and no Add while it is still loading", () => {
    margin({ state: "loading" });

    expect(screen.queryByRole("button", { name: /^(Open|Completed) \(/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing on your list/)).not.toBeInTheDocument();
  });

  it("says the request failed rather than that the list is empty", () => {
    /*
     * The distinction this whole file's `resourceState` exists for: a dropped
     * connection must not produce a sentence about what somebody has committed
     * to.
     */
    margin({ state: "error" });

    expect(screen.getByText(/Couldn't load your action items/)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing on your list/)).not.toBeInTheDocument();
  });

  it("retries through the query it was given", async () => {
    margin({ state: "error" });

    await userEvent.click(screen.getByRole("button", { name: /Try again|Retry/i }));

    expect(refetch).toHaveBeenCalled();
  });
});

describe("what the margin never contains", () => {
  it("sells nothing, and links nowhere that does not exist", () => {
    margin({ open: [anItem()], done: [anItem({ id: "c", status: "DONE" })] });

    for (const gone of [
      /stay on top of your work/i,
      /learn more/i,
      /view all action items/i,
      // The reference's invented groupings.
      /\bInfrastructure\b/,
      /SmartSpend/i,
    ]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
  });
});
