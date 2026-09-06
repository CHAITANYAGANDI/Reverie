import { describe, it, expect } from "vitest";
import {
  identityOwner,
  identityPermissions,
  normalizeProvider,
  type Credential,
} from "@/lib/identity-owner";

/**
 * Which fields belong to this account holder, and which belong to Google.
 *
 * <h2>The bug this replaces</h2>
 *
 * <p>One question was asked — "is this deployment using Clerk?" — and both
 * kinds of account answer it the same way. So the address was locked for
 * everybody, including the person who signed up with an email and just wanted
 * to fix a typo in it; and everybody was offered a Change password button,
 * including the person who signs in with Google and has no password anywhere
 * for `updatePassword` to check.
 *
 * <p>Every case below is one of those two people.
 */

const GOOGLE: Credential = { mode: "clerk", provider: "google", hasPassword: false };
const REVERIE: Credential = { mode: "clerk", provider: "", hasPassword: true };
const DEV: Credential = { mode: "dev", provider: "", hasPassword: false };

describe("an account that signs in with Google", () => {
  it("has no password here to change", () => {
    const can = identityPermissions(GOOGLE);

    expect(can).toMatchObject({ owner: "external", password: false });
  });

  it("says nothing at all about the address", () => {
    // Nobody changes their address in Reverie, so there is no question left for
    // this module to answer about it. See lib/account-actions.
    expect(identityPermissions(GOOGLE)).not.toHaveProperty("email");
    expect(identityPermissions(GOOGLE)).not.toHaveProperty("emailVia");
  });

  it("does not lock the display name either", () => {
    /*
     * It did, on the reasoning that the next sign-in would overwrite an edit.
     * `UserService.provision` refreshes `users.email` from the token on every
     * request and never touches `display_name`, and every screen reads
     * Reverie's column before the provider's — so that rewrite does not happen.
     * The lock meant onboarding never asked a Google account what to call them
     * and Settings then refused to let them say.
     */
    for (const credential of [GOOGLE, REVERIE, DEV]) {
      expect(identityPermissions(credential)).not.toHaveProperty("name");
    }
  });

  it("names Google, so the sentence on screen can too", () => {
    expect(identityPermissions(GOOGLE).ownerLabel).toBe("Google");
  });

  it.each([
    ["github", "GitHub"],
    ["microsoft", "Microsoft"],
    ["apple", "Apple"],
  ])("names %s as well", (provider, label) => {
    expect(identityPermissions({ ...GOOGLE, provider }).ownerLabel).toBe(label);
  });

  it("keeps the generic phrase for a provider it does not know", () => {
    expect(identityPermissions({ ...GOOGLE, provider: "okta" }).ownerLabel).toBe(
      "your sign-in provider",
    );
  });

  it("stays Google's even after a password is added", () => {
    /*
     * Clerk lets an OAuth account set a password later. The address still comes
     * from Google, and `provision` rewrites it from the token on the very next
     * request, so offering to edit it here would be offering to edit a copy.
     */
    const can = identityPermissions({ ...GOOGLE, hasPassword: true });

    expect(can.owner).toBe("external");
    expect(can.ownerLabel).toBe("Google");
  });
});

describe("an account made with an email and a password", () => {
  it("owns the password", () => {
    expect(identityPermissions(REVERIE)).toMatchObject({
      owner: "reverie",
      password: true,
    });
  });

  it("has nobody else to name", () => {
    expect(identityPermissions(REVERIE).ownerLabel).toBe("");
  });
});

describe("a development session", () => {
  it("has no password in existence to rotate", () => {
    expect(identityPermissions(DEV)).toMatchObject({
      owner: "dev",
      password: false,
    });
  });
});

describe("failing closed", () => {
  it("locks an account under Clerk with neither a password nor a connection", () => {
    // Nothing here knows what that is, and every alternative ends in a form
    // that fails on submit. A disabled field with a sentence beside it is
    // understood; a form that accepts an edit and reverts it is reported as
    // data loss.
    const can = identityPermissions({ mode: "clerk", provider: "", hasPassword: false });

    expect(can.owner).toBe("external");
    expect(can.password).toBe(false);
  });

  it("treats an unknown mode as having no provider rather than guessing", () => {
    expect(identityOwner({ mode: "", provider: "", hasPassword: false })).toBe("dev");
  });
});

describe("what Clerk calls a provider", () => {
  it.each([
    ["google", "google"],
    ["oauth_google", "google"],
    ["OAuth_Google", "google"],
    ["", ""],
    [null, ""],
    [undefined, ""],
  ])("reads %s as %s", (raw, expected) => {
    // Clerk spells it both ways depending on where it is read from. One
    // spelling reaches the rest of the app.
    expect(normalizeProvider(raw)).toBe(expected);
  });
});
