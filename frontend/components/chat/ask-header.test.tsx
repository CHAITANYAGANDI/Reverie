import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AskHeader } from "@/components/chat/ask-header";

describe("AskHeader", () => {
  it("says what the panel is with the mark, and not in words", () => {
    const { container } = render(<AskHeader />);

    /*
     * INVERTED DELIBERATELY. This asserted an `h2` reading "Ask Reverie".
     *
     * <p>The words went and the mark stayed. Two things were wrong with them
     * in a 26rem rail: the panel's name is the least useful thing in a header
     * somebody opens deliberately, and it spent about eighty pixels saying
     * what the glyph beside it already said — pushing the conversation title,
     * which is the one piece of state up here that changes, out to the middle
     * of the row.
     */
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByText("Ask Reverie")).not.toBeInTheDocument();
    // One mark, and it is decorative: the panel is identified, not labelled.
    const mark = container.querySelector("svg");
    expect(mark).not.toBeNull();
    expect(mark!.getAttribute("aria-hidden")).toBe("true");
  });

  it("offers a way out where there is one, and none where there is not", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<AskHeader onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "Close Ask Reverie" }));
    expect(onClose).toHaveBeenCalledOnce();

    // `/ask` is a destination rather than a summoned surface, so there is
    // nothing to shut and no button that pretends there is.
    rerender(<AskHeader />);
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
  });

  it("keeps the way out inside the panel when the title is long", () => {
    /*
     * A REGRESSION TEST FOR A PANEL THAT COULD NOT BE CLOSED.
     *
     * <p>The actions region was `shrink-0`, which is the obvious thing to
     * write for a row of buttons — and it also holds the conversation's title,
     * which in a 26rem pane is the one thing here that has to give. Unable to
     * shrink, a title reading "Is the beta date still real?" pushed the row 55
     * pixels past the pane's right edge and took the close button with it:
     * measured at 1440, the button was at x=1451 in a 1440px window.
     *
     * <p>Asserted as classes rather than as geometry because jsdom implements
     * no layout — there is nothing here to measure a width of. The browser is
     * where this was found and where the fix was confirmed; this is what stops
     * it coming back. `shrink-0` on that region is the specific mistake, so it
     * is named.
     */
    render(<AskHeader onClose={vi.fn()} actions={<button type="button">archive</button>} />);

    const close = screen.getByRole("button", { name: "Close Ask Reverie" });
    const region = close.parentElement!;

    expect(region.className).toContain("min-w-0");
    expect(region.className).not.toContain("shrink-0");
    // The one thing in the row that must never be what gives.
    expect(close.className).toContain("shrink-0");
  });

  it("draws whatever the surface put in it, and nothing of its own", () => {
    render(
      <AskHeader
        scope={<span>This meeting</span>}
        actions={<button type="button">archive</button>}
      />,
    );

    expect(screen.getByText("This meeting")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "archive" })).toBeInTheDocument();
    // No scope control of its own. A meeting chat reads one transcript through
    // one endpoint and cannot widen, so a chevron here would promise something
    // the endpoint cannot serve.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
