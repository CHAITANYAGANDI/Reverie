import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { AskPanel } from "@/components/chat/ask-panel";

function panel(props: Partial<React.ComponentProps<typeof AskPanel>> = {}) {
  return render(
    <AskPanel variant="pane" header={<p>header</p>} dock={<p>dock</p>} {...props}>
      <p>thread</p>
    </AskPanel>,
  );
}

describe("AskPanel", () => {
  it("draws the three regions in reading order", () => {
    const { container } = panel();

    // Header, thread, dock — the shape every Reverie chat has. The order is
    // asserted because the dock is the one region that must not scroll away:
    // a composer inside the thread walks off the bottom of a long conversation.
    const regions = Array.from(container.querySelectorAll("[data-ask-region]")).map((e) =>
      e.getAttribute("data-ask-region"),
    );
    expect(regions).toEqual(["header", "thread", "dock"]);
  });

  it("scrolls the thread and nothing else", () => {
    const { container } = panel();

    const thread = container.querySelector('[data-ask-region="thread"]')!;
    // `min-h-0` with `flex-1` is what makes this scroll instead of growing: a
    // flex child defaults to `min-height: auto`, which is how a long
    // conversation used to push the composer past the bottom of the window.
    expect(thread.className).toContain("min-h-0");
    expect(thread.className).toContain("overflow-y-auto");
    expect(container.querySelector('[data-ask-region="header"]')!.className).toContain(
      "shrink-0",
    );
    expect(container.querySelector('[data-ask-region="dock"]')!.className).toContain(
      "shrink-0",
    );
  });

  it("rules the header off from the conversation", () => {
    const { container } = panel();

    expect(container.querySelector('[data-ask-region="header"]')!.className).toContain(
      "border-b",
    );
  });

  it("leaves the rule out where the surface already drew one", () => {
    // The meeting pane has a row above this one — the Ask / Outline
    // tabs and the pane's close button — which carries a full-width rule of its
    // own. Measured with both: two hairlines 53px apart across a 416px rail,
    // which reads as a panel with two headers rather than one.
    const { container } = panel({ headerRule: false });

    expect(container.querySelector('[data-ask-region="header"]')!.className).not.toContain(
      "border-b",
    );
  });
});
