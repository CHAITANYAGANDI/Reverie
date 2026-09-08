import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Citation } from "@/lib/types";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { AskEvidence, passagesOf, EVIDENCE_SHOWN } from "@/components/chat/ask-evidence";

function citation(over: Partial<Citation> = {}): Citation {
  return {
    chunkIndex: 0,
    start: 122,
    end: 140,
    text: "We agreed to hold the launch until the audit clears.",
    meetingId: "mtg_1",
    meetingTitle: "Launch review",
    ...over,
  };
}

/**
 * What the rail is allowed to say.
 *
 * <p>The references put a speaker's name against every quote, a date under
 * every source, and a line reading "Seven more passages were read and not
 * quoted". A `Citation` is `{ chunkIndex, start, end, text, meetingId,
 * meetingTitle }` — there is no speaker on it, no date, and no retrieval count,
 * because the client is only ever handed the citations an answer actually used.
 *
 * <p>So these are the tests that matter most in this file: not that the rail
 * looks right, but that it cannot invent the three things the design asks for
 * and the API does not have.
 */
describe("what the evidence rail will not claim", () => {
  it("names no speaker, because a citation has none", () => {
    render(<AskEvidence citations={[citation()]} />);

    // Nothing that reads as attribution: no "S1", no "Speaker", no colon-led
    // name in front of the quote.
    expect(screen.queryByText(/^S\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/speaker/i)).not.toBeInTheDocument();
  });

  it("shows no date unless the caller can supply one it already had", () => {
    const { rerender } = render(<AskEvidence citations={[citation()]} />);

    // The meeting's title and the timecode are on the citation. The date is
    // not, and nothing here fetches a meeting to find it — that is the N+1 an
    // evidence rail invites.
    expect(screen.getByText(/Launch review/)).toBeInTheDocument();
    expect(screen.getByText(/02:02/)).toBeInTheDocument();

    // The clock is pinned, because `relativeDay` reads `new Date()` and
    // "yesterday" is otherwise a different date every day this suite runs.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
    try {
      rerender(
        <AskEvidence
          citations={[citation()]}
          meetingDates={new Map([["mtg_1", "2026-09-07T09:00:00Z"]])}
        />,
      );
      expect(screen.getByText(/Yesterday/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts only what it is holding, never what retrieval read", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      citation({ chunkIndex: i, start: i * 60, text: `Passage ${i}` }),
    );
    render(<AskEvidence citations={many} />);

    // "N more sources" is a true statement about the passages on this object.
    // "Seven more passages were read and not quoted" would be a claim about a
    // retrieval step this client never sees.
    expect(screen.getByRole("button", { name: /2 more sources/ })).toBeInTheDocument();
    expect(screen.queryByText(/not quoted/i)).not.toBeInTheDocument();
  });
});

describe("passagesOf", () => {
  it("keeps the order the answer cited them in", () => {
    const passages = passagesOf([
      citation({ text: "First", meetingId: "mtg_2", meetingTitle: "B" }),
      citation({ text: "Second", meetingId: "mtg_1", meetingTitle: "A" }),
      citation({ text: "Third", meetingId: "mtg_2", meetingTitle: "B" }),
    ]);

    // Not grouped by meeting. `SourceList` grouped, which was right for a list
    // of titles and wrong for a list of quotes: they are read top to bottom
    // against an answer that used them in sequence.
    expect(passages.map((p) => p.text)).toEqual(["First", "Second", "Third"]);
  });

  it("drops a repeat of the same passage", () => {
    const passages = passagesOf([citation(), citation(), citation({ start: 300 })]);

    // The same chunk comes back twice when an answer leans on it twice, and two
    // identical quotes under one answer reads as the model repeating itself.
    expect(passages).toHaveLength(2);
  });

  it("keeps the same words said in two different meetings", () => {
    const passages = passagesOf([
      citation({ text: "Agreed.", meetingId: "mtg_1" }),
      citation({ text: "Agreed.", meetingId: "mtg_2" }),
    ]);

    // Deduplication is on meeting *and* second *and* text. Two people saying
    // the same sentence in two conversations is two pieces of evidence.
    expect(passages).toHaveLength(2);
  });

  it("ignores a citation with no words in it", () => {
    expect(passagesOf([citation({ text: "   " })])).toHaveLength(0);
    expect(passagesOf(undefined)).toHaveLength(0);
  });
});

describe("following a passage", () => {
  it("seeks the player on this page when the chat is a meeting's", async () => {
    const onSeek = vi.fn();
    render(<AskEvidence citations={[citation()]} onSeek={onSeek} />);

    await userEvent.click(screen.getByRole("button", { name: /audit clears/ }));

    // Inside one meeting the cited moment is on screen. Navigating to a deep
    // link would reload the page the reader is already reading.
    expect(onSeek).toHaveBeenCalledWith(122);
  });

  it("deep-links into the meeting when the chat is the workspace's", () => {
    render(<AskEvidence citations={[citation()]} />);

    // The archive's deep link, unchanged: this is how `SourceList` has always
    // opened a meeting at a second.
    expect(screen.getByRole("link")).toHaveAttribute("href", "/meetings/mtg_1?t=122");
  });

  it("still opens the meeting when the passage has no timecode", () => {
    render(<AskEvidence citations={[citation({ start: null, end: null })]} />);

    expect(screen.getByRole("link")).toHaveAttribute("href", "/meetings/mtg_1");
  });

  it("draws a passage with nowhere to go as text rather than a dead control", () => {
    // A workspace answer's citation carries the meeting; a meeting answer's
    // does not, because the meeting is implied. With neither an `onSeek` nor an
    // id there is nothing to follow — and the sentence is still the evidence.
    render(<AskEvidence citations={[citation({ meetingId: null, meetingTitle: null })]} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/audit clears/)).toBeInTheDocument();
  });
});

describe("how much of it is on screen", () => {
  it("shows the first few and opens the rest", async () => {
    const many = Array.from({ length: EVIDENCE_SHOWN + 3 }, (_, i) =>
      citation({ chunkIndex: i, start: i * 60, text: `Passage ${i}` }),
    );
    render(<AskEvidence citations={many} />);

    expect(screen.getAllByRole("link")).toHaveLength(EVIDENCE_SHOWN);

    await userEvent.click(screen.getByRole("button", { name: /3 more sources/ }));

    // Opened, not fetched. Throwing the remainder away to keep the rail short
    // would lose navigation to real evidence.
    expect(screen.getAllByRole("link")).toHaveLength(EVIDENCE_SHOWN + 3);
    expect(screen.queryByRole("button", { name: /more source/ })).not.toBeInTheDocument();
  });

  it("says source in the singular when there is one left", () => {
    const many = Array.from({ length: EVIDENCE_SHOWN + 1 }, (_, i) =>
      citation({ chunkIndex: i, start: i * 60, text: `Passage ${i}` }),
    );
    render(<AskEvidence citations={many} />);

    expect(screen.getByRole("button", { name: "1 more source" })).toBeInTheDocument();
  });

  it("renders nothing at all when the answer cited nothing", () => {
    // An ungrounded answer gets no rail and no heading. A "What it is built on"
    // over an empty box says the answer is built on nothing, which is a claim
    // about the retrieval rather than about the citations.
    const { container } = render(<AskEvidence citations={[]} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/built on/i)).not.toBeInTheDocument();
  });
});
