import { describe, it, expect } from "vitest";
import { stepsFor, stepLabel, onboardingCompleted } from "@/lib/onboarding";

/**
 * Which questions a new account gets, and whether it has already had them.
 *
 * <p>Both decisions are pure, which is the point: the step count is derived
 * from the identity rather than written down, and completion is read from one
 * explicit flag rather than guessed from what the account contains.
 */
describe("which steps apply", () => {
  it("asks for a name and a language where the name is ours to collect", () => {
    expect(stepsFor(true)).toEqual(["name", "language"]);
  });

  it("asks only for a language where the provider owns the name", () => {
    /*
     * Signing up with Google means Google holds the name — Settings says so and
     * disables the field. Asking here would be the product contradicting itself
     * two screens apart, and saving it would write a copy into Reverie's own
     * column that then outranks Google's everywhere.
     */
    expect(stepsFor(false)).toEqual(["language"]);
  });

  it("never has a third step", () => {
    // The flow this restores ended on "You are set up" over three buttons that
    // Now already carries. A menu in front of the thing it is a menu of.
    for (const collects of [true, false]) {
      expect(stepsFor(collects).length).toBeLessThanOrEqual(2);
      expect(stepsFor(collects)).not.toContain("start");
    }
  });
});

describe("the step label", () => {
  it("counts what is actually there", () => {
    expect(stepLabel(0, 2)).toBe("Step 1 of 2");
    expect(stepLabel(1, 2)).toBe("Step 2 of 2");
  });

  it("says one of one rather than forcing a two-step count", () => {
    /*
     * "Step 1 of 2" over a one-step flow is a small lie on the one screen where
     * somebody is still deciding whether to trust the product.
     */
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
