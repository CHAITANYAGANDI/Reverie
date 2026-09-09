import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PreferencesResponse, PrivacyOverview } from "@/lib/types";

/**
 * Account Settings → General.
 *
 * Three claims worth holding onto.
 *
 * <i>Two of these fields are descriptive and two are not.</i> Department and
 * Role are recorded and read by nothing. The name is matched against the owner
 * of every action item, and the language is sent with every transcription job —
 * so the test that matters is that saving one does not quietly clear another,
 * which is what a form that sends its whole state on every keystroke would do.
 *
 * <i>Email and password are shown and not editable.</i> Neither is Reverie's to
 * change; a development session has no sign-in provider and therefore no
 * password at all, and an Edit control over them would be a promise the product
 * cannot keep.
 *
 * <i>The footer says nothing rather than something useless.</i> The version
 * line and the jump link to a retention section that is not even on this tab
 * any more are gone, and the legal line does not appear at all unless somebody
 * has supplied real URLs — Reverie ships no terms of service of its own.
 *
 * <p>Email and Data Retention were sections here and are tabs now, so their
 * cases live beside their components. What is left on this tab is the account
 * itself: who you are, what language you speak, what is done with a recording,
 * and the way out.
 */
const {
  update, setRetention, closeAccount, signOut, deleteIdentity, clearOnboarding, toastError,
} = vi.hoisted(() => ({
  update: vi.fn(),
  setRetention: vi.fn(),
  closeAccount: vi.fn(),
  signOut: vi.fn(),
  deleteIdentity: vi.fn(),
  clearOnboarding: vi.fn(),
  toastError: vi.fn(),
}));

let prefs: PreferencesResponse;
let overview: PrivacyOverview;
let identity: { name: string; email: string; imageUrl: string; provider: string; hasPassword: boolean };
let mode: "dev" | "clerk";
let failure: unknown = null;
let retentionFailure: unknown = null;

vi.mock("next/navigation", () => ({ usePathname: () => "/settings" }));

vi.mock("@/lib/auth", () => ({
  // `profile` carries how this person signed in, which is what decides whether
  // the name, the address and the password are theirs to change here.
  useAuth: () => ({
    userId: "usr_dev", mode, signOut, deleteIdentity, clearOnboarding, profile: identity,
  }),
}));

vi.mock("@/lib/api", () => ({
  // Retention and closing the account are on this tab now. Both were server
  // endpoints with no interface for months; the tests below are mostly about
  // the two ways that can go wrong -- sending one dial and clearing the other,
  // and a delete button that can be reached without typing the phrase.
  useGetPrivacyOverviewQuery: () => ({ data: overview, isLoading: false }),
  useUpdateRetentionMutation: () => [
    (body: unknown) => {
      setRetention(body);
      return {
        unwrap: () =>
          retentionFailure ? Promise.reject(retentionFailure) : Promise.resolve({}),
      };
    },
    { isLoading: false },
  ],
  useCloseAccountMutation: () => [
    (body: unknown) => {
      closeAccount(body);
      return { unwrap: () => Promise.resolve({ meetings: 3, storedObjects: 2 }) };
    },
    { isLoading: false },
  ],
  useGetPreferencesQuery: () => ({ data: prefs, isLoading: false }),
  useGetLanguagesQuery: () => ({
    data: [
      { code: "en", name: "English", nativeName: "English", rightToLeft: false },
      { code: "es", name: "Spanish", nativeName: "Español", rightToLeft: false },
    ],
  }),
  useUpdatePreferencesMutation: () => [
    (body: unknown) => {
      update(body);
      return { unwrap: () => (failure ? Promise.reject(failure) : Promise.resolve({})) };
    },
    { isLoading: false },
  ],
}));

vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

import { GeneralTab } from "@/components/settings/general-tab";

beforeEach(() => {
  vi.clearAllMocks();
  failure = null;
  retentionFailure = null;
  mode = "dev";
  identity = { name: "", email: "", imageUrl: "", provider: "", hasPassword: false };
  window.confirm = vi.fn(() => true);
  overview = {
    held: {
      meetings: 12,
      recordings: 9,
      audioErased: 3,
      transcripts: 12,
      transcriptsErased: 0,
      consentConfirmed: 7,
      actionItems: 41,
      marks: 6,
      projects: 2,
      chats: 5,
      oldestMeetingAt: "2025-03-04T09:00:00Z",
    },
    retention: {
      audioDays: null,
      meetingDays: null,
      recordingsDueNow: 0,
      meetingsDueNow: 0,
    },
    storage: { encryptionAtRest: null, signedUrlSeconds: 900, rowLevelSecurity: true },
    signIn: { mode: "dev", managedExternally: false, secondFactor: null },
  };
  prefs = {
    email: "priya@example.com",
    displayName: "Priya Raman",
    pronouns: null,
    avatarUrl: null,
    department: "IT",
    jobRole: "Individual contributor",
    defaultLanguage: null,
    chatHistoryDays: null,
    mutedNotifications: [],
    retentionWarningEmail: false,
    retentionAppliedEmail: false,
    taskReminderEmail: false,
    notesReadyEmail: false,
    allowanceEmail: false,
  };
});

describe("who you are", () => {
  it("shows the name and the address", () => {
    render(<GeneralTab />);

    expect(screen.getByText("Priya Raman")).toBeInTheDocument();
    expect(screen.getByText("priya@example.com")).toBeInTheDocument();
  });

  it("no longer shows a department or a role", () => {
    // Both were descriptive only -- nothing routed by either -- and a profile
    // that asks for facts it never uses is a form people fill in for nothing.
    render(<GeneralTab />);

    expect(screen.queryByText("IT")).not.toBeInTheDocument();
    expect(screen.queryByText("Individual contributor")).not.toBeInTheDocument();
  });

  it("names the provider somebody actually signed in with", () => {
    // It used to say "Managed by your sign-in provider" to every Clerk account,
    // which is both vaguer than it needs to be and wrong for half of them --
    // an account made here with an email has a password, held for Reverie by
    // Clerk, and it is the account holder's to change.
    mode = "clerk";
    identity = { ...identity, provider: "google" };
    render(<GeneralTab />);

    expect(screen.getByText("You sign in with Google.")).toBeInTheDocument();
  });

  it("says the password is theirs when the account was made here", () => {
    mode = "clerk";
    identity = { ...identity, hasPassword: true };
    render(<GeneralTab />);

    expect(screen.getByText(/Set here\. Changing it signs out/)).toBeInTheDocument();
  });

  it("is honest that a development session has no password", () => {
    render(<GeneralTab />);

    expect(
      screen.getByText("Development session — there is no password."),
    ).toBeInTheDocument();
  });

  it("says so when there is no address yet", () => {
    prefs = { ...prefs, email: null };
    render(<GeneralTab />);

    // A blank line where an address should be reads as a broken feature.
    expect(screen.getByText(/No email address yet/)).toBeInTheDocument();
  });

  it("is read-only until Edit is pressed", () => {
    render(<GeneralTab />);

    expect(screen.queryByLabelText("Full Name")).not.toBeInTheDocument();
  });
});

describe("editing", () => {
  async function openEditor() {
    render(<GeneralTab />);
    await userEvent.click(screen.getByRole("button", { name: /Edit/ }));
  }

  it("opens on the values already there", async () => {
    await openEditor();

    expect(screen.getByLabelText("Full Name")).toHaveValue("Priya Raman");
    expect(screen.getByLabelText("Email")).toHaveValue("priya@example.com");
  });

  it("asks for nothing it does not use", async () => {
    await openEditor();

    expect(screen.queryByLabelText("Department")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Role")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pronouns")).not.toBeInTheDocument();
  });

  it("shows the address without offering to change it", async () => {
    await openEditor();

    // No kind of account changes its address in Reverie. It is the credential,
    // so every route to changing it is a route to losing an account.
    expect(screen.getByLabelText("Email")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Change email/i })).not.toBeInTheDocument();
  });

  it("never puts a real password in the DOM", async () => {
    await openEditor();

    // Dots are a drawing of a password, not one. Reverie has never held it,
    // and rendering anything else here would mean it had started to.
    expect(screen.getByLabelText("Password")).toBeDisabled();
    expect(screen.getByLabelText("Password")).toHaveValue("••••••••••");
  });

  it("saves every field it owns together, so changing one cannot clear another", async () => {
    await openEditor();

    await userEvent.clear(screen.getByLabelText("Full Name"));
    await userEvent.type(screen.getByLabelText("Full Name"), "Ada Lovelace");
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));

    // No address in it. A field nobody can edit is a field with nothing to
    // send, and sending it back unchanged is what the server refuses.
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ displayName: "Ada Lovelace", avatarUrl: "" }),
    );
  });

  it("keeps the form open when the save is refused", async () => {
    failure = { data: { message: "That name is too long" } };
    await openEditor();

    await userEvent.click(screen.getByRole("button", { name: "Finish" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("That name is too long"));
    expect(screen.getByLabelText("Full Name")).toBeInTheDocument();
  });

  it("backs out without saving", async () => {
    await openEditor();

    await userEvent.type(screen.getByLabelText("Full Name"), " and more");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText("Priya Raman")).toBeInTheDocument();
  });
});

describe("language", () => {
  it("opens on detect, which is what an unset account does", () => {
    render(<GeneralTab />);

    expect(screen.getByLabelText("Default language")).toHaveValue("");
    expect(screen.getByRole("option", { name: "Detect automatically" })).toBeInTheDocument();
  });

  it("offers only what transcription supports", () => {
    render(<GeneralTab />);

    // The list is served rather than written here: a nineteenth entry would be
    // offering a transcript that cannot be made.
    expect(screen.getByRole("option", { name: "Spanish" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Telugu" })).not.toBeInTheDocument();
  });

  it("saves the code on its own, touching nothing else", async () => {
    render(<GeneralTab />);

    await userEvent.selectOptions(screen.getByLabelText("Default language"), "es");

    await waitFor(() => expect(update).toHaveBeenCalledWith({ defaultLanguage: "es" }));
  });

  it("goes back to detecting", async () => {
    prefs = { ...prefs, defaultLanguage: "es" };
    render(<GeneralTab />);

    await userEvent.selectOptions(screen.getByLabelText("Default language"), "");

    await waitFor(() => expect(update).toHaveBeenCalledWith({ defaultLanguage: "" }));
  });
});

describe("the rest of the page", () => {
  it("no longer offers a vocabulary or a speaker list, which are gone", () => {
    render(<GeneralTab />);

    // Both were mounted here when the Meetings tab was removed, and both have
    // since been removed themselves — server, tables and all. The assertion is
    // that nothing was left mounted against endpoints that now 404.
    expect(screen.queryByRole("heading", { name: /Words and speakers/ })).toBeNull();
    expect(screen.queryByText(/Custom vocabulary/)).toBeNull();
  });

  it("says outright that nothing here is used to train a model", () => {
    render(<GeneralTab />);

    expect(
      screen.getByRole("heading", { name: /Feedback and training/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/does not train on your meetings/)).toBeInTheDocument();
    // The absence is the point: a toggle would imply a use to opt out of.
    // Scoped to this section -- the email switches below are checkboxes too,
    // and the claim here was only ever about this one.
    const training = screen.getByRole("heading", { name: /Feedback and training/ });
    expect(training.closest("section")!.querySelector("input[type=checkbox]")).toBeNull();
  });

  it("does not show a version that identifies nothing", () => {
    // "Version 0.0.0 — dev build" traces to no commit and reads as unfinished
    // software to everybody except the person who built it.
    render(<GeneralTab />);

    expect(screen.queryByText(/^Version /)).not.toBeInTheDocument();
    expect(screen.queryByText(/dev build/)).not.toBeInTheDocument();
  });

  it("does not link to the middle of the page it is already on", () => {
    // The footer pointed at `#data`, a retention section a few hundred pixels
    // away, and that footer link is gone.
    render(<GeneralTab />);

    expect(screen.queryByText(/keeps what is yours/)).not.toBeInTheDocument();
  });

  it("sends you to the Data Retention tab rather than to an anchor on this one", () => {
    /*
     * The training paragraph ends by saying where the retention windows are
     * set. It said "below" and linked to `#data`, which was the section a few
     * hundred pixels down this tab. That section is a tab now, so the sentence
     * has to name it and the link has to be a real one -- an anchor to an id
     * that is no longer rendered scrolls nowhere and reads as a broken link.
     */
    render(<GeneralTab />);

    const link = screen.getByRole("link", { name: /under Data Retention/i });
    expect(link).toHaveAttribute("href", "/settings/data");
    // And closing the account really is still below, on this tab.
    expect(screen.getByRole("heading", { name: /Delete this account/i })).toBeInTheDocument();
  });

  it("shows no legal line when there are no documents to link to", () => {
    render(<GeneralTab />);

    // Reverie ships no terms of service of its own, and a link to a page that
    // does not exist is worse than no link.
    expect(screen.queryByText(/Terms of Service/)).not.toBeInTheDocument();
    expect(screen.queryByText(/By using Reverie/)).not.toBeInTheDocument();
  });
});

/*
 * THE RETENTION DIALS ARE THEIR OWN TAB, and their tests went with them.
 *
 * <p>`describe("how long things are kept")` was here, seven cases including the
 * one that matters most: both dials go on every change, because the API reads a
 * null as "keep forever" rather than "leave this one alone". See
 * components/settings/retention-tab.test.
 */

describe("closing the account", () => {
  it("says what goes and that it is permanent", () => {
    render(<GeneralTab />);

    expect(screen.getByText(/Deletes everything/)).toBeInTheDocument();
    // Bold and its own word, so it survives a skim of the paragraph.
    expect(screen.getByText("permanently")).toBeInTheDocument();
  });

  it("cannot be reached by one click", async () => {
    render(<GeneralTab />);

    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));

    expect(screen.getByRole("button", { name: /Delete everything/ })).toBeDisabled();
    expect(closeAccount).not.toHaveBeenCalled();
  });

  it("enables only on the phrase, and sends what was typed", async () => {
    render(<GeneralTab />);

    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await userEvent.type(screen.getByLabelText(/to confirm/), "delete");
    expect(screen.getByRole("button", { name: /Delete everything/ })).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/to confirm/), " everything");
    await userEvent.click(screen.getByRole("button", { name: /Delete everything/ }));

    await waitFor(() =>
      expect(closeAccount).toHaveBeenCalledWith({ confirm: "delete everything" }),
    );
  });

  it("signs out afterwards, since the account it was signed into is gone", async () => {
    render(<GeneralTab />);

    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await userEvent.type(screen.getByLabelText(/to confirm/), "delete everything");
    await userEvent.click(screen.getByRole("button", { name: /Delete everything/ }));

    /*
     * Out to the sign-up form. An ordinary sign-out lands on the sign-in form
     * because the usual reason to leave is to come back; this account no longer
     * exists, so offering to sign into it would be the product not having
     * noticed, and the landing page — which is where this used to go — is the
     * front door for somebody still deciding whether to try Reverie.
     */
    await waitFor(() => expect(signOut).toHaveBeenCalledWith("/sign-up"));
  });

  it("destroys the sign-in as well as the data", async () => {
    /*
     * The half that was missing. Closing an account erased Reverie's data and
     * left the credential alone, so signing in again with the same Google
     * account walked straight back into an empty product — the row is simply
     * re-provisioned. Deleting the identity is what makes "delete my account"
     * mean it, and what makes the same person returning a genuinely new account
     * with onboarding ahead of it.
     */
    mode = "clerk";
    deleteIdentity.mockResolvedValue(true);
    render(<GeneralTab />);

    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await userEvent.type(screen.getByLabelText(/to confirm/), "delete everything");
    await userEvent.click(screen.getByRole("button", { name: /Delete everything/ }));

    await waitFor(() => expect(deleteIdentity).toHaveBeenCalled());
    // Data first: erasing it needs a live session token, and destroying the
    // identity ends the session.
    expect(closeAccount).toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("does not leave a surviving identity claiming to be onboarded", async () => {
    /*
     * THE PARTIAL FAILURE, WHICH IS THE ONE WORTH PINNING.
     *
     * <p>Reverie's data is gone and the credential is not. If it signs in again
     * it gets a freshly provisioned, empty row — and an identity still carrying
     * `onboardingCompleted` would walk straight into that empty product with
     * the two questions marked answered, which is the exact state the flag
     * exists to prevent. So the flag is forgotten, the failure is still
     * reported, and nothing claims the deletion succeeded.
     */
    mode = "clerk";
    deleteIdentity.mockResolvedValue(false);
    render(<GeneralTab />);

    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await userEvent.type(screen.getByLabelText(/to confirm/), "delete everything");
    await userEvent.click(screen.getByRole("button", { name: /Delete everything/ }));

    await waitFor(() => expect(clearOnboarding).toHaveBeenCalled());

    // The data really did go, so that half is not walked back.
    expect(closeAccount).toHaveBeenCalled();
    // And the truthful message still stands — no success is claimed.
    expect(toastError).toHaveBeenCalledWith(
      "Your data is deleted. The sign-in itself could not be removed.",
    );
  });

  it("leaves the onboarding flag alone when the identity really is gone", async () => {
    /*
     * Nothing to reset: the metadata went with the user it was on. Touching it
     * would be an update against a deleted identity, which is a request that
     * can only fail.
     */
    mode = "clerk";
    deleteIdentity.mockResolvedValue(true);
    render(<GeneralTab />);

    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await userEvent.type(screen.getByLabelText(/to confirm/), "delete everything");
    await userEvent.click(screen.getByRole("button", { name: /Delete everything/ }));

    await waitFor(() => expect(signOut).toHaveBeenCalledWith("/sign-up"));
    expect(clearOnboarding).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("says so when the sign-in could not be removed", async () => {
    /*
     * Self-service deletion is a dashboard setting and the instance can refuse.
     * Somebody told their sign-in was destroyed when it was not finds out by
     * signing in successfully, which is the worst way to learn it.
     */
    // Clerk mode: dev mode has no identity to destroy, and answering "not
    // deleted" there is a fact rather than a failure worth reporting.
    mode = "clerk";
    deleteIdentity.mockResolvedValue(false);
    render(<GeneralTab />);

    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await userEvent.type(screen.getByLabelText(/to confirm/), "delete everything");
    await userEvent.click(screen.getByRole("button", { name: /Delete everything/ }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Your data is deleted. The sign-in itself could not be removed.",
      ),
    );
    // And still out, because the data really is gone.
    expect(signOut).toHaveBeenCalledWith("/sign-up");
  });

  it("backs out and forgets what was typed", async () => {
    render(<GeneralTab />);

    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await userEvent.type(screen.getByLabelText(/to confirm/), "delete everything");
    await userEvent.click(screen.getByRole("button", { name: "Keep my account" }));

    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(screen.getByLabelText(/to confirm/)).toHaveValue("");
    expect(closeAccount).not.toHaveBeenCalled();
  });
});


/*
 * THE EMAIL SWITCHES ARE THEIR OWN TAB, and their tests went with them.
 *
 * <p>`describe("email")` was here, six cases over the five switches. See
 * components/settings/email-tab.test — the assertions are unchanged; what
 * changed is that they render `EmailTab` and no longer need this file's mock
 * of the privacy overview, the auth profile or the close-account mutation.
 */
