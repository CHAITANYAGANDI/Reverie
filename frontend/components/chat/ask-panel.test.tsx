import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { AskPanel, AskTurn } from "@/components/chat/ask-panel";

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

  it("keeps the composer at the foot of the panel, in every state", () => {
    /*
     * THE ONE PLACE IT GOES.
     *
     * <p>There was an `empty` prop for a turn, which handed the dock the space
     * an empty thread was not using and centred it there — a blank-sheet
     * arrangement borrowed from other chat products. It put the one control on
     * the page somewhere it would never be again: the first question sent it to
     * the bottom, so the composer moved the first time anybody used it.
     *
     * <p>So the thread takes the space and scrolls, the composer holds the
     * foot, and there is no state in which that is not true. Asserted with no
     * props at all, because there is no longer a prop that could change it.
     */
    const { container } = panel();

    const thread = container.querySelector('[data-ask-region="thread"]')!;
    const dock = container.querySelector('[data-ask-region="dock"]')!;
    expect(thread.className).toContain("flex-1");
    expect(dock.className).toContain("shrink-0");
    expect(dock.className).not.toContain("justify-center");
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

/**
 * One exchange, as one band of the document.
 *
 * <p>The thread was `space-y-9` and nothing else. That is enough separation for
 * two turns and not for six: seventy pixels under a paragraph is a paragraph
 * break, and a second question read as the answer's next paragraph. The
 * evidence column had it worse — two independent stacks of text down the page,
 * agreeing about their tops by arithmetic and with nothing saying which quote
 * belonged to which answer.
 */
describe("AskTurn", () => {
  function turn(props: Partial<React.ComponentProps<typeof AskTurn>> = {}) {
    return render(
      <div>
        <AskTurn question={<p>first question</p>} answer={<p>first answer</p>} {...props} />
        <AskTurn question={<p>second question</p>} answer={<p>second answer</p>} {...props} />
      </div>,
    );
  }

  it("rules each exchange off from the one above it", () => {
    const { container } = turn();

    // Across both columns, so the answer and the quotes beside it are one
    // block. The same `--line` hairline the conversation lists and the
    // transcript use between rows.
    for (const article of Array.from(container.querySelectorAll("article"))) {
      expect(article.className).toContain("[&:not(:first-child)]:border-t");
      expect(article.className).toContain("[&:not(:first-child)]:border-line");
    }
  });

  it("draws no rule above the first one", () => {
    /*
     * `:not(:first-child)` rather than a bottom rule on every turn. A bottom
     * rule leaves the thread ending on a line with nothing under it, and a top
     * rule on the first turn puts a second hairline immediately under the
     * header's own.
     *
     * <p>Asserted as the selector rather than by measuring, because jsdom
     * applies no stylesheet: what is under test is that the rule is
     * conditional at all, and which condition it is.
     */
    const { container } = turn();

    for (const article of Array.from(container.querySelectorAll("article"))) {
      expect(article.className).not.toContain("border-t border-line");
    }
  });

  it("puts the answer before its evidence in the DOM, not only on the left", () => {
    // So a screen reader and a narrow panel both get the answer before its
    // footnotes. Unchanged, and asserted here because the rule classes are now
    // on the same element and easy to reorder by accident.
    const { container } = render(
      <AskTurn question={<p>q</p>} answer={<p>a</p>} evidence={<p>sources</p>} />,
    );

    const children = Array.from(container.querySelector("article")!.children);
    expect(children).toHaveLength(2);
    expect(children[0].textContent).toContain("a");
    expect(children[1].textContent).toBe("sources");
  });
});
