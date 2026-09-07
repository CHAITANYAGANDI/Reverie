import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { JumpTo, topicsFrom, voicesFrom } from "@/components/jump-to";
import type { SummarySection, TranscriptMoment, TranscriptSegment } from "@/lib/types";

/**
 * The navigator, and the four things it is not allowed to make up.
 *
 * <h2>Why so much of this file is about absence</h2>
 *
 * <p>`26-meeting-outline.png` is the one reference in the 22–28 set that maps
 * onto data Reverie actually holds, and the temptation it carries is to fill
 * the gaps: a heading the summary could not place becomes a jump to 0:00, a
 * meeting's invited participants become "Voices", a topic with no marks in it
 * becomes "0 marks". Each of those is a sentence about the recording that
 * nothing in the recording supports.
 *
 * <p>So the tests below check what appears, and then check that nothing else
 * does.
 */

function aSegment(over: Partial<TranscriptSegment> = {}): TranscriptSegment {
  return { id: "s1", start: 0, end: 10, speaker: "Priya Shah", text: "Words.", ...over };
}

function outline(groups: { heading: string; startSeconds?: number | null }[]): SummarySection[] {
  return [
    {
      key: "outline",
      title: "What was discussed",
      kind: "outline",
      text: "",
      bullets: [],
      groups: groups.map((g) => ({ heading: g.heading, bullets: [], startSeconds: g.startSeconds })),
    },
  ];
}

function aMoment(over: Partial<TranscriptMoment> = {}): TranscriptMoment {
  return {
    id: "m1",
    meetingId: "mtg_1",
    kind: "HIGHLIGHT",
    ranges: [],
    quote: "the one number they check",
    body: "",
    speaker: "Jordan Lee",
    startSeconds: 722,
    endSeconds: 726,
    createdAt: "x",
    updatedAt: "x",
    ...over,
  };
}

let onJump: ReturnType<typeof vi.fn>;
let onOpenChange: ReturnType<typeof vi.fn>;

function open(over: Partial<React.ComponentProps<typeof JumpTo>> = {}) {
  const props = {
    open: true,
    onOpenChange,
    sections: [] as SummarySection[],
    segments: [] as TranscriptSegment[],
    moments: [] as TranscriptMoment[],
    onJump,
    ...over,
  };
  render(<JumpTo {...props} />);
  return props;
}

beforeEach(() => {
  onJump = vi.fn();
  onOpenChange = vi.fn();
});

describe("what it is called, and what it never says", () => {
  it("is called Jump to", () => {
    open({ segments: [aSegment()] });

    expect(screen.getByRole("dialog", { name: "Jump to" })).toBeInTheDocument();
  });

  it("uses none of the vocabulary of the memory this product does not have", () => {
    /*
     * `22-meeting-memory.png` and `23-meeting-ledger.png` sit either side of
     * this screen in the reference set, and their words must not leak into it.
     * A navigator is a table of contents for one recording.
     */
    open({
      sections: outline([{ heading: "Moving the beta date", startSeconds: 698 }]),
      segments: [aSegment()],
      moments: [aMoment()],
    });

    const text = document.body.textContent ?? "";
    for (const word of [
      /memory/i,
      /drift/i,
      /promise/i,
      /ledger/i,
      /slipped/i,
      /reversed/i,
      /lineage/i,
      /brief/i,
    ]) {
      expect(text).not.toMatch(word);
    }
  });
});

describe("getting out of it", () => {
  it("closes on Escape", async () => {
    // The reference draws an `esc` chip in the corner. The dialog primitive
    // already honours the key; what is asserted is that this one did not opt
    // out of it by swallowing keys for its own arrow handling.
    open({ segments: [aSegment()] });

    await userEvent.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("topics", () => {
  it("lists an anchored heading with its time, and jumps to exactly it", async () => {
    open({
      sections: outline([{ heading: "Moving the beta date", startSeconds: 698.4 }]),
      segments: [aSegment()],
    });

    await userEvent.click(screen.getByRole("option", { name: /Moving the beta date/ }));

    // The exact second the summary recorded, not a rounded one: the caller
    // seeks with it and a rounded jump lands mid-sentence.
    expect(onJump).toHaveBeenCalledWith(698.4);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an unplaceable heading, and refuses to guess where it is", async () => {
    /*
     * THE RULE THIS SHARES WITH THE OUTLINE RAIL. Hiding it makes this list
     * disagree with the Summary tab, and sending it to 0:00 or to the nearest
     * anchored heading lands the reader on the wrong minute with no way to
     * tell whether the transcript or the summary is the broken one.
     */
    open({
      sections: outline([
        { heading: "Enterprise SSO", startSeconds: null },
        { heading: "Support readiness", startSeconds: 2762 },
      ]),
      segments: [aSegment()],
    });

    // Present as text...
    expect(screen.getByText("Enterprise SSO")).toBeInTheDocument();
    // ...and not as anything choosable.
    expect(screen.queryByRole("option", { name: /Enterprise SSO/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Enterprise SSO"));
    expect(onJump).not.toHaveBeenCalled();
  });

  it("takes topics only from outline sections", () => {
    // A prose section's title is the name of a part of the summary, not a
    // moment in the recording. Synthesising topics from paragraphs would fill
    // this list with headings that have no time and never could.
    const topics = topicsFrom(
      [
        { key: "p", title: "Overview", kind: "prose", text: "Words.", bullets: [], groups: [] },
        ...outline([{ heading: "Real topic", startSeconds: 12 }]),
      ],
      [],
    );

    expect(topics.map((t) => t.heading)).toEqual(["Real topic"]);
  });

  it("counts the marks inside a topic, and only where the span is real", () => {
    /*
     * The span runs to the next anchored topic. The count is only ever
     * something the timestamps already say -- and an unanchored heading has no
     * span, so it gets no count rather than "0 marks", which would assert that
     * nobody marked anything in a stretch nobody can locate.
     */
    const topics = topicsFrom(
      outline([
        { heading: "First", startSeconds: 0 },
        { heading: "Unplaceable", startSeconds: null },
        { heading: "Second", startSeconds: 600 },
      ]),
      [
        aMoment({ id: "a", startSeconds: 10 }),
        aMoment({ id: "b", startSeconds: 30 }),
        aMoment({ id: "c", startSeconds: 900 }),
      ],
    );

    expect(topics).toEqual([
      { heading: "First", at: 0, marks: 2 },
      { heading: "Unplaceable", at: null, marks: null },
      // Runs to the end of the recording, so it takes the late one.
      { heading: "Second", at: 600, marks: 1 },
    ]);
  });

  it("says nothing at all rather than zero", () => {
    const topics = topicsFrom(outline([{ heading: "Quiet", startSeconds: 5 }]), []);

    expect(topics[0].marks).toBeNull();
    open({ sections: outline([{ heading: "Quiet", startSeconds: 5 }]), segments: [aSegment()] });
    expect(screen.queryByText(/0 marks/)).not.toBeInTheDocument();
  });
});

describe("voices", () => {
  it("lists only people the transcript attributes a line to", () => {
    // From the segments, never from an invitation: an invited list is a list
    // of people who may never have said a word.
    const voices = voicesFrom([
      aSegment({ id: "a", speaker: "Alex Morgan", start: 4 }),
      aSegment({ id: "b", speaker: "Maya Chen", start: 20 }),
      aSegment({ id: "c", speaker: "Alex Morgan", start: 40 }),
    ]);

    expect(voices).toEqual([
      { name: "Alex Morgan", at: 4 },
      { name: "Maya Chen", at: 20 },
    ]);
  });

  it("jumps to a speaker's first line, not their loudest", async () => {
    open({
      segments: [
        aSegment({ id: "a", speaker: "Maya Chen", start: 20 }),
        aSegment({ id: "b", speaker: "Alex Morgan", start: 61.5 }),
        aSegment({ id: "c", speaker: "Alex Morgan", start: 900 }),
      ],
    });

    await userEvent.click(screen.getByRole("option", { name: /Alex Morgan/ }));

    expect(onJump).toHaveBeenCalledWith(61.5);
  });

  it("uses the name the reader corrected it to", () => {
    /*
     * A rename rewrites the transcript, so the segments carry the corrected
     * name. Reading from them rather than from a cached speaker list is what
     * keeps this list agreeing with the document beside it.
     */
    open({ segments: [aSegment({ speaker: "Priya Raman", start: 3 })] });

    expect(screen.getByRole("option", { name: /Priya Raman/ })).toBeInTheDocument();
    expect(screen.queryByText("Speaker 1")).not.toBeInTheDocument();
  });

  it("ignores a segment with no speaker rather than inventing one", () => {
    expect(voicesFrom([aSegment({ speaker: "" }), aSegment({ speaker: "  " })])).toEqual([]);
  });
});

describe("marks", () => {
  it("shows a real highlight at its own timecode, and seeks to it", async () => {
    open({ segments: [aSegment()], moments: [aMoment({ startSeconds: 722 })] });

    expect(screen.getByText("12:02")).toBeInTheDocument();
    expect(screen.getByText("highlight")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("option", { name: /the one number they check/ }));

    expect(onJump).toHaveBeenCalledWith(722);
  });

  it("prefers the reader's own words to the words they marked", async () => {
    // A note is what somebody wrote; the quote is only what it was attached
    // to. Showing the quote for a note buries the thing they typed.
    open({
      segments: [aSegment()],
      moments: [aMoment({ kind: "NOTE", body: "tell Daniel before the rota is set" })],
    });

    expect(
      screen.getByRole("option", { name: /tell Daniel before the rota is set/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("note")).toBeInTheDocument();
  });

  it("puts them in the order they happen", () => {
    open({
      segments: [aSegment()],
      moments: [
        aMoment({ id: "late", startSeconds: 1696, body: "second" }),
        aMoment({ id: "early", startSeconds: 722, body: "first" }),
      ],
    });

    const rows = screen.getAllByRole("option").map((o) => o.textContent);
    expect(rows.findIndex((r) => r?.includes("first"))).toBeLessThan(
      rows.findIndex((r) => r?.includes("second")),
    );
  });
});

describe("what it does with nothing", () => {
  it("says so once, rather than drawing three empty headings", () => {
    open();

    expect(screen.getByText("Nothing to jump to yet.")).toBeInTheDocument();
    for (const heading of ["Topics", "Voices", "Marks"]) {
      expect(screen.queryByText(heading)).not.toBeInTheDocument();
    }
  });

  it("omits the sections that have nothing, and keeps the ones that do", () => {
    /*
     * The state a meeting is in while it is being made: the transcript has
     * landed and the summary has not, so there are voices and no topics. A
     * heading over an empty list would read as topics that failed to load.
     */
    open({ segments: [aSegment({ speaker: "Alex Morgan" })] });

    expect(screen.getByText("Voices")).toBeInTheDocument();
    expect(screen.queryByText("Topics")).not.toBeInTheDocument();
    expect(screen.queryByText("Marks")).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing to jump to yet.")).not.toBeInTheDocument();
  });
});

describe("the keyboard", () => {
  it("moves down the list and opens what is on it", async () => {
    open({
      sections: outline([{ heading: "First topic", startSeconds: 10 }]),
      segments: [aSegment({ speaker: "Alex Morgan", start: 61 })],
    });

    // Starts on the first row, so one press down is the voice under it.
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(onJump).toHaveBeenCalledWith(61);
  });

  it("stops at the end of the list rather than wrapping to the top", async () => {
    // Holding a key down should stop, not come back round and open the first
    // thing. Same rule as the search box.
    open({ sections: outline([{ heading: "Only topic", startSeconds: 10 }]), segments: [] });

    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");

    expect(onJump).toHaveBeenCalledWith(10);
  });

  it("skips the headings it cannot jump to", async () => {
    // An unanchored topic is not on the roster: arrowing onto a row that
    // cannot do anything is a dead key press.
    open({
      sections: outline([
        { heading: "Unplaceable", startSeconds: null },
        { heading: "Placed", startSeconds: 44 },
      ]),
      segments: [],
    });

    await userEvent.keyboard("{Enter}");

    expect(onJump).toHaveBeenCalledWith(44);
  });
});
