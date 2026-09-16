import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { StickyHeader } from "@/components/v2/landing/sticky-header";

/**
 * THE BAR MUST STAY ONE LINE ON A PHONE.
 *
 * <h2>The bug these exist for</h2>
 *
 * <p>The row is a lockup and two actions inside a 24px gutter with 32px between
 * them, which on a 320px screen is more than there is. Flex resolved it the
 * only way it can — both links shrank to their longest word — so `Sign in`
 * broke onto two lines inside a pill built for one, and the first thing a
 * reader saw on a phone was a navigation bar that had come apart.
 *
 * <h2>Why this is asserted as class names</h2>
 *
 * <p>jsdom has no layout. `getBoundingClientRect` returns zeroes, no stylesheet
 * is applied, and a test that rendered this at 320px and measured it would read
 * 0 for the wrapped bar and 0 for the fixed one. The wrap is therefore not
 * observable here at all, and pretending otherwise would be a test that passes
 * on both versions of the file.
 *
 * <p>What is observable is the contract: which utilities are on which element.
 * That is a weaker claim and worth saying so — it pins the decision rather than
 * the rendering, and it would not catch Tailwind failing to emit a class. It
 * would catch the thing that actually went wrong, which is somebody removing
 * `shrink-0` from an action or quietly restoring the desktop gutter for every
 * width.
 *
 * <p>The paired assertion is what makes the responsive half meaningful: every
 * reduced value is checked <em>together with</em> the `sm:` that puts the
 * designed value back, so a change that narrows the desktop bar to fix a phone
 * fails here.
 */

/** The two actions, in the order the header renders them. */
function actions(container: HTMLElement): HTMLAnchorElement[] {
  return [...container.querySelectorAll("nav a")] as HTMLAnchorElement[];
}

describe("the actions on a narrow phone", () => {
  it("renders both, in order, with their destinations", () => {
    // The fix is a layout one, so this is the guard that it stayed a layout
    // one: same two links, same copy, same routes.
    const { container } = render(<StickyHeader />);
    const [signIn, getStarted] = actions(container);

    expect(signIn.textContent?.trim()).toBe("Sign in");
    expect(signIn.getAttribute("href")).toBe("/sign-in");
    expect(getStarted.textContent?.trim()).toBe("Get started");
    expect(getStarted.getAttribute("href")).toBe("/sign-up");
  });

  it("holds each label on one line", () => {
    // `whitespace-nowrap` is what stops "Sign in" becoming "Sign" over "in":
    // without it the link's min-content width is its longest word.
    const { container } = render(<StickyHeader />);

    for (const action of actions(container)) {
      expect(action.className).toContain("whitespace-nowrap");
    }
  });

  it("refuses to let either action be the thing that gives", () => {
    // Flex items shrink by default. These two must not, at any width, and the
    // nav around them must not either -- a shrinking nav squeezes both.
    const { container } = render(<StickyHeader />);
    const nav = container.querySelector("nav")!;

    expect(nav.className).toContain("shrink-0");
    for (const action of actions(container)) {
      expect(action.className).toContain("shrink-0");
    }
  });

  it("centres each label in its own pill", () => {
    const { container } = render(<StickyHeader />);

    for (const action of actions(container)) {
      expect(action.className).toContain("items-center");
      expect(action.className).toContain("justify-center");
    }
  });
});

describe("the space that was reduced, and where it comes back", () => {
  /*
   * Each pair is [what a phone gets, what `sm` restores]. The second half is
   * the point of the test: the room for the actions was bought from the phone
   * layout only, and a change that takes it from the desktop bar instead --
   * the easy way to make a narrow viewport fit -- fails right here.
   */
  it("shrinks the gutter and the row gap below sm, and only below sm", () => {
    const { container } = render(<StickyHeader />);
    const row = container.querySelector("header > div")!;

    expect(row.className).toContain("px-4");
    expect(row.className).toContain("sm:px-6");
    expect(row.className).toContain("lg:px-8");

    expect(row.className).toContain("gap-3");
    expect(row.className).toContain("sm:gap-8");
  });

  it("shrinks the gap between the two actions below sm, and only below sm", () => {
    const { container } = render(<StickyHeader />);
    const nav = container.querySelector("nav")!;

    expect(nav.className).toContain("gap-2");
    expect(nav.className).toContain("sm:gap-6");
  });

  it("shrinks the padding inside each pill below sm, and only below sm", () => {
    const { container } = render(<StickyHeader />);
    const [signIn, getStarted] = actions(container);

    expect(signIn.className).toContain("px-1.5");
    expect(signIn.className).toContain("sm:px-2");

    expect(getStarted.className).toContain("px-3");
    expect(getStarted.className).toContain("sm:px-4");
  });
});

describe("what this change was not allowed to touch", () => {
  it("leaves the bar 68px tall and stuck to the top", () => {
    // The height is load-bearing: the note in the component records a previous
    // pass being rejected for making it 69. Nothing about fitting a phone has
    // any business changing it.
    const { container } = render(<StickyHeader />);
    const header = container.querySelector("header")!;

    expect(header.className).toContain("sticky");
    expect(header.className).toContain("top-0");
    expect(header.className).toContain("z-40");
    expect(container.querySelector("header > div")!.className).toContain("h-[68px]");
  });

  it("keeps the lockup at 21px, and the actions to the right of it", () => {
    const { container } = render(<StickyHeader />);
    const nav = container.querySelector("nav")!;

    // `ml-auto` is the whole right-alignment. The reduced `gap-3` is a
    // minimum, not the spacing: on any width with room to spare the auto
    // margin eats the difference and the bar looks exactly as it did.
    expect(nav.className).toContain("ml-auto");
    expect(container.querySelector("header img")).not.toBeNull();
    expect(container.querySelector("header span[style*='21px']")).not.toBeNull();
  });

  it("keeps the filled button filled and the other one not", () => {
    // The V2 rule is that the primary action is INK. A mobile fix that made
    // both actions look the same would fit and still be wrong.
    const { container } = render(<StickyHeader />);
    const [signIn, getStarted] = actions(container);

    expect(getStarted.className).toContain("bg-ink");
    expect(getStarted.className).toContain("text-surface");
    expect(signIn.className).not.toContain("bg-ink");
    expect(signIn.className).toContain("text-ink-3");
  });
});
