import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PreferencesResponse } from "@/lib/types";

/**
 * Account Settings → Email.
 *
 * <p>Moved here with the section itself, which was the fourth block of
 * General. Nothing about what is asserted changed in the move — the tests are
 * the same ones, against `EmailTab` instead of `GeneralTab` — and the harness
 * shrank to the two queries this tab actually makes, which is the point of the
 * split: General used to load the privacy overview and the preferences on every
 * visit, for two sections most people scrolled past.
 *
 * <p>V56 deleted every message Reverie sent, and its stated reason was not that
 * the messages were wrong — it was that the switches had no UI to reach them, so
 * nothing went out and nobody could have asked for it. This tab is the half that
 * was missing, and these tests are what stop it going missing again.
 */
const { update, toastError } = vi.hoisted(() => ({
  update: vi.fn(),
  toastError: vi.fn(),
}));

let prefs: PreferencesResponse;
let failure: unknown = null;

vi.mock("@/lib/api", () => ({
  useGetPreferencesQuery: () => ({ data: prefs, isLoading: false, isError: false }),
  useUpdatePreferencesMutation: () => [
    (body: unknown) => {
      update(body);
      return { unwrap: () => (failure ? Promise.reject(failure) : Promise.resolve({})) };
    },
    { isLoading: false },
  ],
}));

vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

import { EmailTab } from "@/components/settings/email-tab";

beforeEach(() => {
  vi.clearAllMocks();
  failure = null;
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

describe("email", () => {
  it("shows every message it will send, and none it will not", async () => {
    render(<EmailTab />);

    expect(await screen.findByRole("heading", { name: /Email notifications/ })).toBeInTheDocument();
    expect(screen.getByText(/Before retention deletes something/)).toBeInTheDocument();
    expect(screen.getByText(/After retention deletes something/)).toBeInTheDocument();
    expect(screen.getByText(/Action items due tomorrow/)).toBeInTheDocument();
    expect(screen.getByText(/Notes ready for a long recording/)).toBeInTheDocument();
    expect(screen.getByText(/transcription minutes are nearly gone/)).toBeInTheDocument();
  });

  it("starts every one of them off", async () => {
    // Mail that arrives because a migration ran is how a sender gets filtered,
    // and a filtered sender loses the retention warning with the rest.
    render(<EmailTab />);

    const heading = await screen.findByRole("heading", { name: /Email notifications/ });
    const section = heading.closest("section")!;
    for (const box of Array.from(section.querySelectorAll("input[type=checkbox]"))) {
      expect(box).not.toBeChecked();
    }
  });

  it("saves one switch on its own", async () => {
    // Five toggles behind a single Save is a section where flipping one thing
    // and walking away loses it.
    render(<EmailTab />);
    await screen.findByRole("heading", { name: /Email notifications/ });

    await userEvent.click(screen.getByText(/Action items due tomorrow/));

    await waitFor(() => expect(update).toHaveBeenCalledWith({ taskReminderEmail: true }));
  });

  it("names the two messages nobody can switch off", async () => {
    /*
     * Said rather than hidden. A message with no switch that the page does not
     * mention reads as a message you cannot stop -- and one of the two is sent
     * after the row holding these settings has been deleted, so there is
     * nowhere else it could ever be explained.
     */
    render(<EmailTab />);
    await screen.findByRole("heading", { name: /Email notifications/ });

    expect(screen.getByText(/Two messages have no switch/)).toBeInTheDocument();
    expect(screen.getByText(/running out of transcription minutes/)).toBeInTheDocument();
    expect(screen.getByText(/account being closed/)).toBeInTheDocument();
  });

  it("says so rather than showing five switches that do nothing", async () => {
    failure = { data: { message: "nope" } };
    prefs = null as never;
    render(<EmailTab />);

    expect(await screen.findByRole("heading", { name: /Email notifications/ })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't load your email settings/);
  });

  it("carries the heading and nothing about the rest of the account", () => {
    /*
     * The tab boundary, asserted. This was a section under an identity block, a
     * language row and a paragraph about model training; on its own tab it must
     * not have dragged any of that with it, and it must not have left the
     * switches behind either.
     */
    render(<EmailTab />);

    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
    expect(screen.queryByText(/Account Settings/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /How long things are kept/ })).toBeNull();
  });
});
