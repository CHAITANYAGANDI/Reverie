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

  it("keeps the composer docked while there is a conversation above it", () => {
    // The default, and the arrangement every chat has: the thread takes the
    // space and scrolls, the composer holds the foot of the panel.
    const { container } = panel();

    expect(container.querySelector('[data-ask-region="thread"]')!.className).toContain("flex-1");
    expect(container.querySelector('[data-ask-region="dock"]')!.className).toContain("shrink-0");
  });

  it("moves the composer into the middle of an empty panel", () => {
    /*
     * Nothing in the thread, so nothing to scroll — and a composer docked at
     * the foot of a blank panel is a bar across the bottom of an empty page.
     * On `/ask` that was seven hundred pixels of nothing between the band and
     * the one thing somebody came here to use.
     *
     * <p>Nothing is invented to fill it. The dock takes the space the thread is
     * not using and centres in it, which moves the composer and its starter
     * chips to where the eye already is. The two classes are a pair: without
     * the thread giving up `flex-1` there is no space for the dock to take.
     */
    const { container } = panel({ empty: true });

    const thread = container.querySelector('[data-ask-region="thread"]')!;
    const dock = container.querySelector('[data-ask-region="dock"]')!;
    expect(thread.className).toContain("shrink-0");
    expect(thread.className).not.toContain("flex-1");
    expect(dock.className).toContain("flex-1");
    expect(dock.className).toContain("justify-center");
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
