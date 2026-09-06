import { describe, it, expect } from "vitest";
import { signInBlockMessage, factorStrategies } from "@/lib/sign-in-block";

/**
 * Why a password did not sign somebody in.
 *
 * <h2>The bug these exist for</h2>
 *
 * <p>Every outcome that was not `complete` produced one sentence: "This account
 * needs another step to sign in. Continue with Google, or reset your password."
 * It named two remedies without saying which applied, so somebody whose account
 * was created with Google read "reset your password" and went to reset a
 * password that does not exist.
 *
 * <p>Clerk had already answered the question — an attempt that needs a first
 * factor comes back listing the factors that would actually work, and a
 * Google-only account has no `password` among them. These pin the reading of
 * that list, which is the part worth testing and needs no Clerk key to do.
 */
describe("an account with no password", () => {
  it("says so, and names the provider that does work", () => {
    // The reported case, exactly: signed up with Google, tried email and
    // password, got told to reset a password that was never set.
    expect(
      signInBlockMessage({
        status: "needs_first_factor",
        firstFactors: ["oauth_google"],
      }),
    ).toBe(
      "This account has no password — it was created with Google. Use Continue with Google above.",
    );
  });

  it("offers the reset where a code is the only other way in", () => {
    /*
     * No provider to point at, but the address can be verified — so the reset
     * flow this form already draws is a real way through rather than advice
     * about a password that does not exist.
     */
    expect(
      signInBlockMessage({
        status: "needs_first_factor",
        firstFactors: ["email_code", "reset_password_email_code"],
      }),
    ).toContain("no password yet");
  });

  it("does not claim there is no password when there is one", () => {
    /*
     * `password` among the factors means the account has one and Clerk wanted
     * it attempted separately. Saying "this account has no password" there
     * would be a confident lie.
     */
    const message = signInBlockMessage({
      status: "needs_first_factor",
      firstFactors: ["password", "email_code"],
    });
    expect(message).not.toMatch(/no password/);
  });
});

describe("the other things Clerk can ask for", () => {
  it("names two-step sign-in rather than blaming the password", () => {
    const message = signInBlockMessage({
      status: "needs_second_factor",
      firstFactors: ["password"],
    });
    expect(message).toContain("two-step");
  });

  it("points a two-step account at the provider when there is one", () => {
    expect(
      signInBlockMessage({
        status: "needs_second_factor",
        firstFactors: ["password", "oauth_google"],
      }),
    ).toContain("Continue with Google");
  });

  it("sends a forced password change to the reset it already draws", () => {
    expect(
      signInBlockMessage({ status: "needs_new_password", firstFactors: ["password"] }),
    ).toContain("Forgot it?");
  });

  it("stays general where it cannot be specific", () => {
    // Described, but not in terms this form can act on. Better than naming a
    // remedy that may not apply.
    const message = signInBlockMessage({ status: "needs_identifier", firstFactors: [] });
    expect(message).toBeTruthy();
    expect(message).not.toMatch(/no password/);
  });

  it("says nothing at all about a sign-in that worked", () => {
    expect(signInBlockMessage({ status: "complete", firstFactors: [] })).toBeNull();
  });
});

describe("reading Clerk's factor list", () => {
  it("pulls the strategies out", () => {
    expect(
      factorStrategies([{ strategy: "password" }, { strategy: "oauth_google" }]),
    ).toEqual(["password", "oauth_google"]);
  });

  it("survives a shape that did not arrive", () => {
    /*
     * A third party's payload, on the sign-in form. The alternative to a
     * missing list is a crash on the one screen nobody can get past.
     */
    for (const shape of [null, undefined, "factors", {}, [null], [{}], [{ strategy: 7 }]]) {
      expect(factorStrategies(shape)).toEqual([]);
    }
  });

  it("does not invent a reason from a list it could not read", () => {
    // No factors means no specific claim — the general sentence, not "this
    // account has no password".
    const message = signInBlockMessage({
      status: "needs_first_factor",
      firstFactors: factorStrategies(null),
    });
    expect(message).not.toMatch(/no password/);
  });
});
