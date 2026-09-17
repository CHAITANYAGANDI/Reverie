import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Navigation on a phone.
 *
 * <p>What this replaced was a hamburger that slid the entire desktop rail in
 * over a scrim — navigation behind a gesture, in the corner furthest from a
 * thumb, showing a folder tree and an allowance meter to somebody who wanted to
 * get to the chat.
 *
 * <p>Which makes the risk here specific: mobile navigation is the half of a
 * redesign nobody checks, and a phone that has lost its way to Library or its
 * way to Record has lost the product. So the same census as the band, plus the
 * one thing only this component has to get right — that it is the same
 * navigation as the band rather than a second one that can drift.
 */
const { push, start, setReturnTo, toastError } = vi.hoisted(() => ({
  push: vi.fn(),
  start: vi.fn(),
  setReturnTo: vi.fn(),
  toastError: vi.fn(),
}));

let recorderState: "idle" | "recording";
let refusal: string | null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/home",
}));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock("@/lib/recording-context", () => ({
  useRecording: () => ({ state: recorderState, start }),
  useRecordingSession: () => ({ setReturnTo }),
}));
vi.mock("@/lib/allowance", () => ({
  useAllowance: () => ({}),
  recordRefusal: () => refusal,
}));

import { MobileTabs } from "@/components/v2/mobile-tabs";

function tabs(over: Partial<React.ComponentProps<typeof MobileTabs>> = {}) {
  return render(<MobileTabs pathname="/home" create live={false} {...over} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  recorderState = "idle";
  refusal = null;
});

describe("the destinations", () => {
  it("are the same three as the band, in the same order", () => {
    /*
     * One navigation with two shapes, not two navigations. A phone that offers
     * a different set of places is a second information architecture nobody
     * maintains.
     *
     * <p>This test asserted `Ask` while the band beside it had said `Reverie
     * AI` since components/v2/places.tsx named the destination -- so the one
     * check meant to keep the two in step was pinning the drift. The words are
     * the band's, and PLACES is where the reasoning for them lives.
     */
    tabs();

    const names = screen.getAllByRole("link").map((el) => el.textContent);
    expect(names).toEqual(["Home", "Library", "Reverie AI"]);
  });

  it("go where the band's do", () => {
    tabs();

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/home");
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("href", "/library");
    expect(screen.getByRole("link", { name: "Reverie AI" })).toHaveAttribute("href", "/ask");
  });

  it("mark where you are", () => {
    tabs({ pathname: "/ask" });

    expect(screen.getByRole("link", { name: "Reverie AI" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("do not claim to be the page one level down", () => {
    tabs({ pathname: "/meetings/mtg_1" });

    expect(screen.getByRole("link", { name: "Library" })).not.toHaveAttribute("aria-current");
  });
});

describe("Record, which is the fourth", () => {
  it("goes to /record and opens no microphone of its own", async () => {
    /*
     * IT USED TO CALL `start()` HERE. That is a microphone opened from the
     * application's chrome, which meant /record loaded with capture already
     * running behind the page that carries the responsibility disclosure --
     * so every word of that disclosure was shown too late.
     *
     * <p>Identical to the band's, because both call the same hook. Two copies
     * of this drift, and the copy that drifts is the one on the phone.
     */
    tabs({ pathname: "/folder/prj_1" });

    await userEvent.click(screen.getByRole("button", { name: "Record" }));

    expect(push).toHaveBeenCalledWith("/record?r=%2Ffolder%2Fprj_1");
    expect(setReturnTo).toHaveBeenCalledWith("/folder/prj_1");
    expect(start).not.toHaveBeenCalled();
  });

  it("explains a refusal instead of opening the microphone", async () => {
    refusal = "You have used your 100 minutes.";
    tabs();

    await userEvent.click(screen.getByRole("button", { name: "Record" }));

    expect(toastError).toHaveBeenCalledWith("You have used your 100 minutes.");
    expect(push).not.toHaveBeenCalled();
  });

  it("says a recording is running rather than disappearing", async () => {
    // The column vanishing would move the other three under a thumb that is
    // already moving. It stands down in place and says why.
    tabs({ create: false, live: true });

    const button = screen.getByRole("button", { name: "Recording" });
    expect(button).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Record" })).not.toBeInTheDocument();
  });

  it("keeps the three destinations reachable while one is running", () => {
    // The whole reason the recorder survives navigation is so somebody can go
    // and look something up mid-meeting.
    tabs({ create: false, live: true });

    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});

describe("where it sits", () => {
  it("owns the bottom edge, and does not move when a recording starts", () => {
    /*
     * It used to lift by `--recording-bar`, which put the dock below the
     * navigation and slid the permanent thing up the screen whenever a
     * recording began. The dock clears the tabs now instead -- see
     * `bottom-tabbar` in components/recording-bar.tsx -- so this element's
     * offset is a constant and nothing about it depends on the recorder.
     */
    const idle = tabs().container.querySelector("nav")!;
    expect(idle.className).toContain("bottom-0");
    expect(idle.getAttribute("style")).toBeNull();

    const running = tabs({ create: false, live: true }).container.querySelector("nav")!;
    expect(running.className).toContain("bottom-0");
    expect(running.getAttribute("style")).toBeNull();
  });
});

describe("what the fourth tab says", () => {
  /*
   * REPORTED: stop the recording and the tab stays red and reads `Recording`,
   * over a dock offering `Save & process`.
   *
   * <p>The shell was giving it `recorder.state !== "idle"`, which is still true
   * after Stop -- the audio is held, waiting to be saved or discarded. That
   * flag has to stay true for the things it governs (Record is withheld, and
   * the page keeps the room the dock stands in), so what changed is that this
   * tab is given the narrower claim instead. See `live` in app-shell.
   */
  it("says Recording only while audio is actually being captured", () => {
    expect(
      tabs({ create: false, live: true }).container.querySelector("button")!.textContent,
    ).toContain("Recording");
  });

  it("goes back to Record once the recording has stopped", () => {
    // `create` is still false -- the audio is in hand and a second recording
    // cannot start until it is dealt with -- so the tab is disabled. It is not
    // still claiming to be recording.
    const { container } = tabs({ create: false, live: false });
    const button = container.querySelector("button")!;

    expect(button.textContent).toContain("Record");
    expect(button.textContent).not.toContain("Recording");
    expect(button).toBeDisabled();
    expect(button.className).not.toContain("text-danger");
  });
});
