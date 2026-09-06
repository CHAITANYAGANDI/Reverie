import { describe, it, expect } from "vitest";
import { ONBOARDING_STEPS, stepLabel, onboardingCompleted } from "@/lib/onboarding";

/**
 * Which questions a new account gets, and whether it has already had them.
 *
 * <p>The list is one constant and completion is one explicit flag, which is the
 * point: neither is guessed from what the account happens to contain.
 */
describe("which steps there are", () => {
  it("asks for a name and then a language, for every account", () => {
    /*
     * It briefly skipped the name where the provider had supplied one, so a
     * Google sign-up went straight to the language question and was never asked
     * what to call anybody. Reverie's `display_name` is its own column — the
     * provider fills it first and owns nothing after that — so the question is
     * real, and the screen prefills it.
     */
    expect(ONBOARDING_STEPS).toEqual(["name", "language"]);
  });

  it("never has a third step", () => {
    // The flow this restores ended on "You are set up" over three buttons that
    // Now already carries. A menu in front of the thing it is a menu of.
    expect(ONBOARDING_STEPS).toHaveLength(2);
    expect(ONBOARDING_STEPS).not.toContain("start");
  });
});

describe("the step label", () => {
  it("counts what is actually there", () => {
    expect(stepLabel(0, 2)).toBe("Step 1 of 2");
    expect(stepLabel(1, 2)).toBe("Step 2 of 2");
  });

  it("takes the total rather than assuming it", () => {
    /*
     * The count is passed in from the list, so the label cannot drift from
     * what is on screen if the list ever changes. A progress indicator that
     * miscounts is a small lie on the one screen where somebody is still
     * deciding whether to trust the product.
     */
    expect(stepLabel(0, ONBOARDING_STEPS.length)).toBe("Step 1 of 2");
    expect(stepLabel(0, 1)).toBe("Step 1 of 1");
  });
});

describe("whether onboarding is finished", () => {
  it("reads the explicit flag", () => {
    expect(onboardingCompleted({ onboardingCompleted: true })).toBe(true);
    expect(onboardingCompleted({ onboardingCompleted: false })).toBe(false);
  });

  it("treats anything it cannot read as not finished", () => {
    /*
     * Asking twice costs two skippable screens. Never asking costs a default
     * nobody chose, so the unknown cases fall the safe way.
     */
    for (const shape of [undefined, null, "yes", 1, [], {}]) {
      expect(onboardingCompleted(shape)).toBe(false);
    }
  });

  it("is not satisfied by a truthy value that is not true", () => {
    // A string "false" is truthy, and metadata is free-form.
    expect(onboardingCompleted({ onboardingCompleted: "false" })).toBe(false);
    expect(onboardingCompleted({ onboardingCompleted: 1 })).toBe(false);
  });

  it("ignores everything else the account might have", () => {
    /*
     * The rule that matters. Completion is never inferred from whether somebody
     * has meetings or a display name: an account with no recordings has not
     * necessarily skipped onboarding, and one with a name did not necessarily
     * get it from this flow.
     */
    expect(onboardingCompleted({ displayName: "Ada", meetings: 12 })).toBe(false);
  });
});
