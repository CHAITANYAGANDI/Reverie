import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PrivacyOverview } from "@/lib/types";

/**
 * Account Settings → Data Retention.
 *
 * <p>Moved here with the section itself, which was the fifth block of General.
 * Nothing about what is asserted changed in the move — the tests are the same
 * ones, against `RetentionTab` instead of `GeneralTab`.
 *
 * <p>The thing they hold is the one that is easy to get wrong and expensive
 * when it is: <b>both dials go on every change</b>. The API reads a null as
 * "keep forever" rather than "leave this one alone", which is the opposite of
 * every other patch in it, so a partial update from a stale render silently
 * clears a policy nobody touched.
 */
const { setRetention, toastError } = vi.hoisted(() => ({
  setRetention: vi.fn(),
  toastError: vi.fn(),
}));

let overview: PrivacyOverview;
let retentionFailure: unknown = null;

vi.mock("@/lib/api", () => ({
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
}));

vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

import { RetentionTab } from "@/components/settings/retention-tab";

beforeEach(() => {
  vi.clearAllMocks();
  retentionFailure = null;
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
});

describe("how long things are kept", () => {
  it("opens on Never, which is what an account with no policy has", () => {
    render(<RetentionTab />);

    const never = screen.getAllByRole("button", { name: "Never" });
    expect(never).toHaveLength(2);
    never.forEach((b) => expect(b).toHaveAttribute("aria-pressed", "true"));
  });

  it("sends both dials on every change, because null means keep and not leave alone", async () => {
    overview = {
      ...overview,
      retention: { ...overview.retention, meetingDays: 30 },
    };
    render(<RetentionTab />);

    // Changing the recording dial alone. If the meeting dial were omitted the
    // API would read it as null and quietly clear a policy nobody touched.
    await userEvent.click(screen.getAllByRole("button", { name: "After a week" })[0]);

    await waitFor(() =>
      expect(setRetention).toHaveBeenCalledWith({ audioDays: 7, meetingDays: 30 }),
    );
  });

  it("refuses to offer the pair the server would reject", () => {
    overview = {
      ...overview,
      retention: { ...overview.retention, audioDays: 30 },
    };
    render(<RetentionTab />);

    // Deleting the meeting after a week while keeping its recording a month
    // means the recording rule never runs. The server says so; the button
    // should not be clickable in the first place.
    expect(screen.getAllByRole("button", { name: "After a week" })[1]).toBeDisabled();
  });

  it("warns what the next pass would take of what is already there", () => {
    overview = {
      ...overview,
      retention: { ...overview.retention, audioDays: 7, recordingsDueNow: 4 },
    };
    render(<RetentionTab />);

    expect(screen.getByText(/deletes 4 recordings you already have/)).toBeInTheDocument();
  });

  it("names a window it no longer offers instead of drawing it as Never", () => {
    overview = {
      ...overview,
      retention: { ...overview.retention, meetingDays: 90 },
    };
    render(<RetentionTab />);

    // 90 days was on the list once and the API still accepts it. Showing the
    // three buttons all unpressed would read as "nothing is deleted".
    expect(screen.getByText(/after 90 days, which is not one of these/i)).toBeInTheDocument();
  });

  it("explains a refusal in the API's own words", async () => {
    retentionFailure = {
      data: { message: "Keep meetings at least as long as recordings." },
    };
    render(<RetentionTab />);

    await userEvent.click(screen.getAllByRole("button", { name: "After a week" })[0]);

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Keep meetings at least as long as recordings.",
      ),
    );
  });

  it("carries the two dials and nothing about the rest of the account", () => {
    /*
     * The tab boundary. This was a section between a paragraph about model
     * training and the button that ends the account; on its own tab it must
     * have brought both dials and neither neighbour.
     */
    render(<RetentionTab />);

    expect(screen.getByRole("heading", { name: /How long things are kept/ })).toBeInTheDocument();
    expect(screen.getByText("Delete the recording")).toBeInTheDocument();
    expect(screen.getByText("Delete the whole meeting")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Close account/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Email notifications/ })).toBeNull();
  });
});
