import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * The import form, and the one line that was added to it.
 *
 * <p>This file exists for the notice. The upload flow itself — presign, PUT
 * with progress, confirm the meeting — is covered by `lib/uploads.test.ts` and
 * is deliberately untouched here: what these cases hold is that a *disclosure*
 * did not turn into a gate. An authorisation checkbox on this form could only
 * assert something the product has no way to know, because the file was
 * recorded somewhere Reverie was not present. That is the same reasoning that
 * removed the consent tick from the record page.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/lib/api", () => ({
  useCreateUploadUrlMutation: () => [vi.fn()],
  useCreateMeetingMutation: () => [vi.fn()],
  // No folders: the picker draws nothing until there is one to choose, which is
  // the ordinary state of a new account and the one this form is used in most.
  useGetProjectsQuery: () => ({ data: [] }),
}));

import UploadPage from "@/app/(app)/upload/page";

describe("UploadPage", () => {
  it("says whose conversation may be uploaded", () => {
    render(<UploadPage />);

    expect(
      screen.getByText(/Only upload conversations you're authorized to record and process\./),
    ).toBeInTheDocument();
  });

  it("keeps it informational rather than a confirmation", () => {
    const { container } = render(<UploadPage />);

    // No tick, no radio, and nothing new between choosing a file and sending
    // it. The submit button's only condition is still that there is a file.
    expect(container.querySelector("input[type=checkbox]")).toBeNull();
    expect(container.querySelector("input[type=radio]")).toBeNull();
    expect(screen.getByRole("button", { name: /Upload & process/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /I confirm|I have permission/i })).not.toBeInTheDocument();
  });

  it("keeps the whole form it was added to", () => {
    render(<UploadPage />);

    // The drop area, the live-recording escape hatch and the submit. The notice
    // sits among them and displaces none of them.
    expect(screen.getByText("Drop a file or click to browse")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Record it live/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upload & process/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Add a meeting" })).toBeInTheDocument();
  });

  it("stays secondary to the drop area it qualifies", () => {
    render(<UploadPage />);

    // `text-foot` at `--ink-4`: the quietest pairing the system has. A tinted
    // panel with a warning icon here would read as something being wrong with
    // the file.
    const notice = screen.getByText(/Only upload conversations you're authorized/);
    expect(notice.className).toContain("text-foot");
    expect(notice.className).toContain("text-ink-4");
    expect(notice.tagName.toLowerCase()).toBe("p");
  });
});
