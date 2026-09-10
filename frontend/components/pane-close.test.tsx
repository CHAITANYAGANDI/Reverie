import { describe, it, expect, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PaneClose } from "@/components/pane-close";
import {
  openSidePane,
  resetSidePane,
  toggleSidePaneExpanded,
  useSidePane,
} from "@/components/side-pane";

/**
 * The pane's own way out.
 *
 * <h2>What this file is really guarding</h2>
 *
 * <p>Nothing about this button is interesting on its own. What is interesting is
 * where it is <em>not</em>: it used to be in the shell's action row above the
 * page, which meant the shell had to keep that row alive whenever the pane was
 * open — so opening a meeting's chat moved the meeting document down 60px, and
 * closing it moved the document back up.
 *
 * <p>The shell's side of that is asserted in components/app-shell.test (the
 * header reserves nothing, open or closed). This side is the other half: the
 * control still exists, it still closes, and it does not open.
 */

/** Reports the store, so a click can be checked against what it did. */
function Harness() {
  const pane = useSidePane();
  return (
    <>
      <PaneClose />
      <p data-testid="state">
        {pane.open ? "open" : "closed"}/{pane.expanded ? "maximised" : "a column"}
      </p>
    </>
  );
}

beforeEach(() => {
  resetSidePane();
});

describe("PaneClose", () => {
  it("says what it hides, not what it is", () => {
    /*
     * "Hide AI chat" rather than "Close side panel". A side pane is a shell
     * concept; the thing on the screen is a chat, and a screen reader
     * announcing the layout primitive would be naming the implementation.
     */
    render(<PaneClose />);

    expect(screen.getByRole("button", { name: "Hide AI chat" })).toBeInTheDocument();
  });

  it("takes the label of whatever is in the pane", () => {
    // The meeting is the only occupant today. It should not be the last.
    render(<PaneClose label="Hide the outline" />);

    expect(screen.getByRole("button", { name: "Hide the outline" })).toBeInTheDocument();
  });

  it("closes the pane", async () => {
    render(<Harness />);
    act(() => openSidePane());
    expect(screen.getByTestId("state")).toHaveTextContent("open");

    await userEvent.click(screen.getByRole("button", { name: "Hide AI chat" }));

    expect(screen.getByTestId("state")).toHaveTextContent("closed");
  });

  it("cannot open it", async () => {
    /*
     * THE REASON IT IS NOT A TOGGLE. It renders inside the pane, so it is only
     * ever pressed on an open one -- but a control labelled "Hide" that shows
     * on a second press is a control that lies, and the shell's old button was
     * a toggle. Pressed on a closed pane this does nothing at all.
     */
    render(<Harness />);
    expect(screen.getByTestId("state")).toHaveTextContent("closed");

    await userEvent.click(screen.getByRole("button", { name: "Hide AI chat" }));

    expect(screen.getByTestId("state")).toHaveTextContent("closed");
  });

  it("leaves the maximised shape alone", async () => {
    /*
     * `expanded` is a remembered shape rather than a visibility: a pane put
     * away while maximised comes back maximised, which is what closing it from
     * the shell always did. Resetting it here would quietly change the pane's
     * size on a press labelled "Hide".
     */
    render(<Harness />);
    act(() => openSidePane());
    act(() => toggleSidePaneExpanded());
    expect(screen.getByTestId("state")).toHaveTextContent("maximised");

    await userEvent.click(screen.getByRole("button", { name: "Hide AI chat" }));

    expect(screen.getByTestId("state")).toHaveTextContent("closed/maximised");
  });
});
