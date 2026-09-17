import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { UsageResponse } from "@/lib/types";

/**
 * The meter at the foot of the rail.
 *
 * <p>Most of this is about which number it draws, and the answer changed. The
 * allowance was five meetings a calendar month, with minutes tallied and
 * checked against nothing; it is now 100 minutes and 3 imports for the life of
 * the account. So the bar is on minutes — the number that actually runs out —
 * and it is the only figure here.
 *
 * <p>The second line used to count the imports and no longer does: this is a
 * glance inside the account menu, and the allowance almost nobody is near was
 * spending a row of it to restate a zero. Both figures are still stated in
 * full, with their own bars, on Settings → Plans.
 *
 * <p>The thing worth guarding is the sentence at the bottom. It used to read
 * "None left until 1 September", which was the useful thing to say about a
 * monthly quota and would be a lie about this one: nothing arrives on the 1st.
 * Somebody who believes it waits for an allowance that is never coming back.
 */
let usage: UsageResponse;
let error: boolean;

vi.mock("@/lib/api", () => ({
  useGetUsageQuery: () => ({ data: error ? undefined : usage, isError: error }),
}));

import { PlanUsage } from "@/components/plan-usage";

beforeEach(() => {
  error = false;
  usage = {
    plan: "FREE",
    minutesUsed: 42,
    minutesLimit: 100,
    importsUsed: 2,
    importsLimit: 3,
    meetingsUsed: 11,
  };
});

describe("PlanUsage", () => {
  it("names the plan and how much of the allowance is gone", () => {
    render(<PlanUsage />);

    expect(screen.getByText("Basic")).toBeInTheDocument();
    expect(screen.getByText("42 of 100")).toBeInTheDocument();
    expect(screen.getByText(/minutes used/)).toBeInTheDocument();
  });

  it("no longer counts the imports here", () => {
    /*
     * It read "2 of 3 imports used" under the minutes and it is withdrawn.
     *
     * <p>This widget is a glance inside the account menu: one bar and one
     * number, about the limit somebody is actually near. Imports are the second
     * allowance and almost nobody is near it, so the line spent a row of the
     * menu restating a zero.
     *
     * <p>Both allowances are still stated in full where somebody is weighing
     * them up — Settings, Plans, "This account" — each with its own bar against
     * what has been used. That is asserted in
     * components/settings/plans-tab.test, which is why removing it here loses
     * no coverage of the fact itself.
     */
    render(<PlanUsage />);

    expect(screen.queryByText(/imports used/i)).toBeNull();
    expect(screen.queryByText(/2 of 3/)).toBeNull();
    // And the number it does carry is still there.
    expect(screen.getByText("42 of 100")).toBeInTheDocument();
  });

  it("does not offer a date when the allowance is spent, because there is none", () => {
    usage = { ...usage, minutesUsed: 100 };

    render(<PlanUsage />);

    // This said "None left until 1 September" when it was a monthly quota.
    // Saying it here would have somebody waiting for the 1st of a month that
    // brings nothing.
    expect(screen.getByText("100 of 100")).toBeInTheDocument();
    expect(screen.getByText(/whole allowance/)).toBeInTheDocument();
    expect(screen.queryByText(/until/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/imports used/)).not.toBeInTheDocument();
  });

  it("drops the ceiling for an account that has none", () => {
    usage = { ...usage, plan: "PREMIUM", minutesUsed: 21, minutesLimit: -1 };

    render(<PlanUsage />);

    // No plan is unlimited any more — the allowance is one pair of numbers for
    // every account. -1 is still what the field means, though, and "21 of -1"
    // is the kind of thing that ships if the branch is deleted for being
    // unreachable.
    expect(screen.getByText("21")).toBeInTheDocument();
    expect(screen.queryByText(/of -1/)).not.toBeInTheDocument();
    expect(screen.getByText("Premium")).toBeInTheDocument();
    expect(screen.getByText(/no limit/)).toBeInTheDocument();
  });

  it("announces the count once, not twice", () => {
    render(<PlanUsage />);

    // The bar and the line under it are one fact. Left in the accessibility
    // tree the bar reads "sixty percent" immediately before "3 of 5" — the
    // vaguer version of the same number, first.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("leads to the page that explains the plan", () => {
    render(<PlanUsage />);

    expect(screen.getByRole("link")).toHaveAttribute("href", "/settings/plans");
  });

  it("holds its space while the figure is on its way", () => {
    usage = undefined as unknown as UsageResponse;

    const { container } = render(<PlanUsage />);

    // It sits under a flex-1 folder tree, so arriving late would shove the
    // account menu down at the moment somebody was reaching for it.
    expect(container.firstChild).not.toBeNull();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

});

/**
 * WHEN THE FIGURE CANNOT BE READ.
 *
 * <h2>What this replaced, and why it was wrong</h2>
 *
 * <p>`if (isError) return null`, with a test asserting the container was empty.
 * The argument was that a rail footer is not the place to report one failed
 * request — but the cost was counted on the wrong side. An allowance that is
 * simply absent does not read as "we could not fetch this"; it reads as an
 * account with no limit on it, which is the opposite of what an unread
 * allowance means, and it is indistinguishable from the widget having been
 * taken out of the product. Silence is not neutral when what it hides is a
 * restriction.
 *
 * <h2>Why the three states are asserted together</h2>
 *
 * <p>`data` is `undefined` while loading, `undefined` on failure, and
 * `undefined` for a query nobody has asked yet. A component that branches on it
 * can draw exactly one of those, so what is pinned here is that the three stay
 * apart: a skeleton on its way, a figure when read, this sentence when it
 * failed — and never a number in the last case.
 */
describe("PlanUsage when the usage request fails", () => {
  beforeEach(() => {
    error = true;
  });

  it("says so, rather than disappearing", () => {
    render(<PlanUsage />);

    expect(screen.getByText("Usage temporarily unavailable")).toBeInTheDocument();
  });

  it("claims no allowance, spent or remaining", () => {
    /*
     * THE POINT OF THE WHOLE CHANGE. The fixture behind this failure carries
     * 42 of 100 minutes; none of it may reach the screen, because a figure
     * drawn from a request that did not answer is a guess wearing a number.
     * Nor may a zero, which would read as an untouched allowance.
     */
    render(<PlanUsage />);

    expect(screen.queryByText(/of 100/)).toBeNull();
    expect(screen.queryByText(/minutes used/)).toBeNull();
    expect(screen.queryByText("42")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText(/no limit/)).toBeNull();
    expect(screen.queryByText(/whole allowance/)).toBeNull();
    // The plan's name is a fact about the account, and this request is how the
    // widget learns it. It was not learned.
    expect(screen.queryByText("Basic")).toBeNull();
  });

  it("draws no bar, which would imply a fraction it does not have", () => {
    const { container } = render(<PlanUsage />);

    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(container.querySelector("[data-state]")).toBeNull();
  });

  it("does not offer the link, which would promise a figure behind it", () => {
    render(<PlanUsage />);

    expect(screen.queryByRole("link")).toBeNull();
  });

  it("says it politely rather than interrupting", () => {
    /*
     * `status`, not `alert`. This codebase keeps `alert` for a failure standing
     * where the reader was waiting for content -- see Home's and Library's list
     * errors -- and this is a footnote inside a menu opened for something else.
     * Polite still announces the swap from skeleton to sentence, which is the
     * moment a reader would otherwise be left with the stale impression that
     * one was still loading.
     */
    render(<PlanUsage />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Usage temporarily unavailable");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the request's own details to itself", () => {
    // A status code, a host or an endpoint in the account menu is an
    // operational detail shown to somebody who cannot act on it.
    const { container } = render(<PlanUsage />);

    expect(container.textContent).toBe("Usage temporarily unavailable");
  });

  it("is still distinguishable from the figure being on its way", () => {
    /*
     * The regression this file exists to prevent from returning in the other
     * direction: a fix that rendered the sentence for every state without a
     * body would put it on screen for the first frame of every page load.
     */
    const failed = render(<PlanUsage />).container.textContent;

    error = false;
    usage = undefined as unknown as UsageResponse;
    const loading = render(<PlanUsage />).container.textContent;

    expect(failed).toBe("Usage temporarily unavailable");
    expect(loading).not.toContain("Usage temporarily unavailable");
  });
});
