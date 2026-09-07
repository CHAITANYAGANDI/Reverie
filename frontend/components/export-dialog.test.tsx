import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Three switches, and the reliability underneath them.
 *
 * <h2>What this file is mostly guarding</h2>
 *
 * <p>The dialog used to ask eight questions: a format for the summary from
 * four, which of its sections one checkbox each, whether to include the action
 * items, a format for the transcript, whether to label it with speakers,
 * whether to label it with timestamps, how much of the back-and-forth to
 * flatten, and it drew a live preview of the answer in a second column. They
 * are gone, the endpoints that took them are gone, and roughly half of this
 * file went with them.
 *
 * <p>So a large part of what is left asserts <b>absence</b>. A simplification
 * that is only a hidden control is not one, and the way this comes back is one
 * "advanced" disclosure at a time.
 *
 * <p>The rest is the behaviour that must survive the simplification, which was
 * the whole point of the export work before it: <b>delivery is atomic</b> — one
 * file when one thing was chosen, one archive when more were, and nothing at
 * all if any part failed — the message says which part, and the choices survive
 * a failure so the retry is a click rather than a reconstruction.
 */
const { fetchExportFile, fetchSignedFile, save, fetchMp3, toastError, toastSuccess } =
  vi.hoisted(() => ({
    fetchExportFile: vi.fn(),
    fetchSignedFile: vi.fn(),
    save: vi.fn(),
    fetchMp3: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
  }));

/*
 * The archive builder, the failure wording and the error types are left real:
 * they are the fix, and a mock of them would be a test of the mock. Only the
 * three functions that need a network or a browser are stood in for.
 */
vi.mock("@/lib/exports", async (orig) => ({
  ...(await orig<typeof import("@/lib/exports")>()),
  fetchExportFile: (...args: unknown[]) => fetchExportFile(...args),
  fetchSignedFile: (...args: unknown[]) => fetchSignedFile(...args),
  save: (...args: unknown[]) => save(...args),
}));

vi.mock("@/lib/api", () => ({
  API_BASE: "http://api.test",
  useLazyGetMp3ExportQuery: () => [
    (id: string) => ({ unwrap: () => fetchMp3(id) }),
    { isFetching: false },
  ],
}));

vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));

import { ExportDialog } from "@/components/export-dialog";
import { DownloadFailure } from "@/lib/exports";
import type { SummaryResponse } from "@/lib/types";

const SUMMARY = {
  meetingId: "mtg_1",
  shortSummary: "We agreed to move billing to Stripe.",
  sections: [
    { key: "overview", title: "Overview", kind: "prose", text: "Stripe.", bullets: [], groups: [] },
  ],
} as unknown as SummaryResponse;

function open(props: Partial<React.ComponentProps<typeof ExportDialog>> = {}) {
  return render(
    <ExportDialog
      open
      onOpenChange={vi.fn()}
      meetingId="mtg_1"
      summary={SUMMARY}
      transcriptLines={412}
      hasAudio
      {...props}
    />,
  );
}

/** A rendered document coming back from the export endpoint. */
function document_(name: string, body = "content") {
  return { blob: new Blob([body]), filename: name };
}

/** The switch for one row, by the label a screen reader reads. */
function toggle(name: "Summary" | "Transcript" | "Audio") {
  return screen.getByRole("switch", { name: `Include ${name}` });
}

const exportButton = () => screen.getByRole("button", { name: /^Export/ });

beforeEach(() => {
  vi.clearAllMocks();
  fetchExportFile.mockResolvedValue(document_("sprint-planning-summary.pdf"));
  fetchSignedFile.mockResolvedValue(document_("sprint-planning.mp3", "audio"));
  fetchMp3.mockResolvedValue({
    status: "ready",
    url: "https://r2/signed.mp3",
    filename: "sprint-planning.mp3",
    expiresInSeconds: 900,
  });
});

describe("what it offers", () => {
  it("offers exactly three things, and they are not formats", () => {
    open();

    const switches = screen.getAllByRole("switch");
    expect(switches.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Include Summary",
      "Include Transcript",
      "Include Audio",
    ]);
  });

  it("says what each one is, in the product's words", () => {
    open();

    expect(screen.getByText("A complete summary of the meeting.")).toBeInTheDocument();
    expect(
      screen.getByText("Full conversation with speakers and timestamps."),
    ).toBeInTheDocument();
    expect(screen.getByText("The meeting recording.")).toBeInTheDocument();
  });

  it("asks the reader to choose what to take, and not in which format", () => {
    open();

    expect(screen.getByText("Choose what to take.")).toBeInTheDocument();
  });
});

describe("what it must never offer again", () => {
  it("has no format picker, no section list, and no transcript options", () => {
    /*
     * THE GUARD. Each of these was a real control. A dropdown with one item is
     * a question with one answer; a section checkbox is asking the reader to
     * edit a summary they have not read yet.
     */
    open();

    for (const gone of [
      /file format/i,
      /include sections/i,
      /\bDOCX\b/,
      /\bWord \(docx\)\b/i,
      /markdown/i,
      /plain text/i,
      /show speaker names/i,
      /show timestamps/i,
      /combine paragraphs/i,
      /combine all/i,
      /preview/i,
      /overview/i,
      /next steps/i,
      /outline/i,
    ]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
  });

  it("has no checkboxes, radios or selects at all", () => {
    // The shapes those controls took. Three switches and two buttons is the
    // whole of it.
    open();

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });

  it("sends the server no option that changes what is in a document", async () => {
    // The other half of the same guard: the backend must not be able to be
    // driven back into configurability from here.
    open();
    await userEvent.click(exportButton());

    await waitFor(() => expect(fetchExportFile).toHaveBeenCalled());
    for (const call of fetchExportFile.mock.calls) {
      expect(Object.keys(call[2] ?? {})).toEqual(["language"]);
    }
  });
});

describe("what is on when it opens", () => {
  it("takes the two documents and leaves the recording", () => {
    open();

    expect(toggle("Summary")).toHaveAttribute("aria-checked", "true");
    expect(toggle("Transcript")).toHaveAttribute("aria-checked", "true");
    // Tens of megabytes, and the one people want least often.
    expect(toggle("Audio")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("2 files selected")).toBeInTheDocument();
  });

  it("leaves a summary that does not exist off, and unusable", () => {
    open({ summary: undefined });

    expect(toggle("Summary")).toHaveAttribute("aria-checked", "false");
    expect(toggle("Summary")).toBeDisabled();
    expect(screen.getByText("Summary is not available for this meeting.")).toBeInTheDocument();
    expect(screen.getByText("1 file selected")).toBeInTheDocument();
  });

  it("leaves a transcript that does not exist off, and unusable", () => {
    open({ transcriptLines: 0 });

    expect(toggle("Transcript")).toHaveAttribute("aria-checked", "false");
    expect(toggle("Transcript")).toBeDisabled();
  });

  it("leaves a recording that does not exist unusable", () => {
    // A document import, or a meeting whose audio has been erased.
    open({ hasAudio: false });

    expect(toggle("Audio")).toBeDisabled();
    expect(screen.getByText("Audio is not available for this meeting.")).toBeInTheDocument();
  });

  it("says so, and disables Export, when there is nothing to take", () => {
    open({ summary: undefined, transcriptLines: 0, hasAudio: false });

    expect(screen.getByText("Nothing selected")).toBeInTheDocument();
    expect(exportButton()).toBeDisabled();
  });

  it("starts from the defaults again on a new opening", async () => {
    const view = open();
    await userEvent.click(toggle("Summary"));
    expect(toggle("Summary")).toHaveAttribute("aria-checked", "false");

    // Closed and opened, which is what `open` going false then true is.
    view.rerender(
      <ExportDialog open={false} onOpenChange={vi.fn()} meetingId="mtg_1" summary={SUMMARY}
        transcriptLines={412} hasAudio />,
    );
    view.rerender(
      <ExportDialog open onOpenChange={vi.fn()} meetingId="mtg_1" summary={SUMMARY}
        transcriptLines={412} hasAudio />,
    );

    expect(toggle("Summary")).toHaveAttribute("aria-checked", "true");
  });
});

describe("the footer", () => {
  it("counts what is selected and names the files it will write", async () => {
    open();

    expect(screen.getByText("Summary.pdf · Transcript.pdf")).toBeInTheDocument();

    await userEvent.click(toggle("Audio"));

    expect(screen.getByText("3 files selected")).toBeInTheDocument();
    expect(screen.getByText("Summary.pdf · Transcript.pdf · Audio.mp3")).toBeInTheDocument();
  });

  it("clears everything without closing, and disables Export", async () => {
    const onOpenChange = vi.fn();
    open({ onOpenChange });

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    for (const name of ["Summary", "Transcript", "Audio"] as const) {
      expect(toggle(name)).toHaveAttribute("aria-checked", "false");
    }
    expect(exportButton()).toBeDisabled();
    // Clear is not Cancel. The dialog is where it was.
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe("what it asks for", () => {
  it("asks for the summary by name, not by format", async () => {
    open({ transcriptLines: 0, hasAudio: false });
    await userEvent.click(exportButton());

    await waitFor(() =>
      expect(fetchExportFile).toHaveBeenCalledWith("mtg_1", "summary", { language: undefined }),
    );
  });

  it("asks for the transcript by name too", async () => {
    open({ summary: undefined, hasAudio: false });
    await userEvent.click(exportButton());

    await waitFor(() =>
      expect(fetchExportFile).toHaveBeenCalledWith("mtg_1", "transcript", { language: undefined }),
    );
  });

  it("carries the language the meeting is being read in", async () => {
    // No language picker in the dialog: the file matches the page.
    open({ language: "es", transcriptLines: 0, hasAudio: false });
    await userEvent.click(exportButton());

    await waitFor(() =>
      expect(fetchExportFile).toHaveBeenCalledWith("mtg_1", "summary", { language: "es" }),
    );
  });

  it("asks for the audio last, so a failed document costs no conversion", async () => {
    open();
    await userEvent.click(toggle("Audio"));
    await userEvent.click(exportButton());

    await waitFor(() => expect(save).toHaveBeenCalled());
    // The documents were requested before the MP3 was prepared.
    expect(fetchExportFile.mock.invocationCallOrder[0])
      .toBeLessThan(fetchMp3.mock.invocationCallOrder[0]);
  });
});

describe("delivery", () => {
  it("saves one file directly when one thing was chosen", async () => {
    open({ transcriptLines: 0, hasAudio: false });
    await userEvent.click(exportButton());

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][1]).toBe("sprint-planning-summary.pdf");
  });

  it("bundles two into one archive rather than two downloads", async () => {
    fetchExportFile
      .mockResolvedValueOnce(document_("sprint-planning-summary.pdf"))
      .mockResolvedValueOnce(document_("sprint-planning-transcript.pdf"));
    open({ hasAudio: false });

    await userEvent.click(exportButton());

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][1]).toMatch(/\.zip$/);
  });

  it("bundles all three into one archive", async () => {
    open();
    await userEvent.click(toggle("Audio"));

    await userEvent.click(exportButton());

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][1]).toMatch(/\.zip$/);
  });
});

describe("when a part fails", () => {
  it("downloads nothing at all", async () => {
    /*
     * ALL OR NONE. Half an export is worse than none: the reader has a file,
     * believes it is what they asked for, and finds out later.
     */
    fetchExportFile
      .mockResolvedValueOnce(document_("sprint-planning-summary.pdf"))
      .mockRejectedValueOnce(new DownloadFailure(503));
    open({ hasAudio: false });

    await userEvent.click(exportButton());

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(save).not.toHaveBeenCalled();
  });

  it("stays open, and keeps the selections for the retry", async () => {
    const onOpenChange = vi.fn();
    fetchExportFile.mockRejectedValue(new DownloadFailure(503));
    open({ hasAudio: false, onOpenChange });

    await userEvent.click(exportButton());
    await waitFor(() => expect(toastError).toHaveBeenCalled());

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // The whole point: pressing Export again is a click, not a reconstruction.
    expect(toggle("Summary")).toHaveAttribute("aria-checked", "true");
    expect(toggle("Transcript")).toHaveAttribute("aria-checked", "true");
    expect(exportButton()).toBeEnabled();
  });

  it("leaves the reason on the screen, not only in a toast", async () => {
    // A toast is gone by the time somebody looks up from the downloads folder.
    fetchExportFile.mockRejectedValue(new DownloadFailure(503));
    open({ hasAudio: false });

    await userEvent.click(exportButton());

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
  });

  it("succeeds on the retry, and delivers", async () => {
    fetchExportFile.mockRejectedValueOnce(new DownloadFailure(503));
    open({ transcriptLines: 0, hasAudio: false });

    await userEvent.click(exportButton());
    await waitFor(() => expect(toastError).toHaveBeenCalled());

    fetchExportFile.mockResolvedValue(document_("sprint-planning-summary.pdf"));
    await userEvent.click(exportButton());

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });
});

describe("pressing Export twice", () => {
  it("runs one export, not two", async () => {
    /*
     * The guard is a ref rather than the `busy` state: `disabled` only takes
     * effect after React has painted, so two clicks dispatched before that
     * both pass -- which starts two conversions and two downloads.
     */
    let release: (v: unknown) => void = () => {};
    fetchExportFile.mockImplementation(
      () => new Promise((resolve) => { release = resolve; }),
    );
    open({ transcriptLines: 0, hasAudio: false });

    const button = exportButton();
    await userEvent.click(button);
    await userEvent.click(button);

    expect(fetchExportFile).toHaveBeenCalledTimes(1);
    release(document_("sprint-planning-summary.pdf"));
  });

  it("says which wait it is in while the audio converts", async () => {
    let release: (v: unknown) => void = () => {};
    fetchMp3.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    open({ summary: undefined, transcriptLines: 0 });
    await userEvent.click(toggle("Audio"));

    await userEvent.click(exportButton());

    // "Exporting…" through a minute of conversion reads as stuck.
    await waitFor(() => expect(screen.getByText("Preparing audio…")).toBeInTheDocument());
    release({
      status: "ready",
      url: "https://r2/signed.mp3",
      filename: "sprint-planning.mp3",
      expiresInSeconds: 900,
    });
  });

  it("disables the switches and Clear while it runs", async () => {
    let release: (v: unknown) => void = () => {};
    fetchExportFile.mockImplementation(
      () => new Promise((resolve) => { release = resolve; }),
    );
    open({ transcriptLines: 0, hasAudio: false });

    await userEvent.click(exportButton());

    expect(toggle("Summary")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
    release(document_("sprint-planning-summary.pdf"));
  });
});
