import { describe, it, expect } from "vitest";
import {
  buildResultSections,
  countAnswers,
  flattenRows,
  foundNothing,
  matchFolders,
  matchTags,
  rowAt,
  step,
} from "@/lib/search-rows";
import type { Project, SearchResponse } from "@/lib/types";

/**
 * The panel as data, which is where the two hard parts of it live.
 *
 * <p>One arrow key has to walk every result as though the group headings were
 * not there, and a heading must never appear over nothing. Both are decisions
 * about a list, both render perfectly when wrong, and neither needs a DOM — a
 * selection that points into the wrong group after the results change opens
 * something nobody chose, silently and only sometimes.
 */

const projects = [
  { id: "prj_1", name: "Q4 planning" },
  { id: "prj_2", name: "Platform" },
] as unknown as Project[];

function found(over: Partial<SearchResponse> = {}): SearchResponse {
  return {
    query: "diarization",
    meetings: {
      total: 5,
      hits: [
        {
          id: "mtg_1",
          title: "Transcription provider review",
          status: "READY",
          createdAt: "2026-08-12T10:00:00Z",
          durationSeconds: 2880,
          tags: ["platform"],
          summaryTemplate: "general",
          mentions: 4,
          titleMatch: false,
        },
      ],
    },
    people: {
      total: 1,
      hits: [{ name: "Alex Morgan", meetings: 3, segments: 40, mentions: 2, commitments: 1 }],
    },
    decisions: {
      total: 2,
      hits: [
        {
          id: "ins_1",
          meetingId: "mtg_1",
          meetingTitle: "Transcription provider review",
          meetingCreatedAt: "2026-08-12T10:00:00Z",
          kind: "DECISION",
          text: "Production transcription moves to a diarizing provider.",
        },
      ],
    },
    risks: { total: 3, hits: [] },
    commitments: { total: 4, hits: [] },
    mentions: {
      total: 14,
      hits: [
        {
          segmentId: "seg_1",
          meetingId: "mtg_2",
          meetingTitle: "Product weekly",
          meetingCreatedAt: "2026-08-28T09:00:00Z",
          speaker: "Alex Morgan",
          start: 1445,
          text: "Diarization has moved from nice-to-have to a beta requirement.",
        },
      ],
    },
    ...over,
  };
}

const EMPTY: SearchResponse = {
  query: "x",
  meetings: { total: 0, hits: [] },
  people: { total: 0, hits: [] },
  decisions: { total: 0, hits: [] },
  risks: { total: 0, hits: [] },
  commitments: { total: 0, hits: [] },
  mentions: { total: 0, hits: [] },
};

const base = { projects, tags: ["platform", "q4"], scope: "all" as const };

describe("the sections", () => {
  it("leads with Ask, then the words somebody said", () => {
    /*
     * The order is the reference's and it reverses what the old panel did,
     * which led with meetings on the reasoning that a meeting is the coarsest
     * answer. "The exact sentence" is a better answer to a typed phrase, and
     * the meeting it was said in is one line below it anyway.
     */
    const sections = buildResultSections({ ...base, found: found(), term: "diarization" });

    expect(sections.map((s) => s.label)).toEqual([
      "Ask Reverie",
      "Transcripts",
      "Decisions",
      "Meetings",
      "People",
    ]);
  });

  it("draws no heading over an empty group", () => {
    const sections = buildResultSections({ ...base, found: EMPTY, term: "zzz" });

    // Only Ask, which is about the query rather than about the results.
    expect(sections.map((s) => s.label)).toEqual(["Ask Reverie"]);
  });

  it("offers no Ask row without a query to ask about", () => {
    const sections = buildResultSections({ ...base, found: EMPTY, term: "   " });
    expect(sections).toEqual([]);
  });

  it("can be built without one, for the zero state's broader search", () => {
    const sections = buildResultSections({
      ...base,
      found: found(),
      term: "diarization",
      ask: false,
    });

    // The Ask row there belongs to the *typed* query and sits above this list.
    // A second one inside it would ask about a different query than the rows.
    expect(sections.map((s) => s.label)).not.toContain("Ask Reverie");
  });

  it("carries the API's own total, not the number of rows drawn", () => {
    const sections = buildResultSections({ ...base, found: found(), term: "diarization" });
    const transcripts = sections.find((s) => s.label === "Transcripts")!;

    // Fourteen exist and one came back. The heading says fourteen, because a
    // count of the rows drawn presented as a total is a lie about the archive.
    expect(transcripts.count).toBe(14);
    expect(transcripts.rows).toHaveLength(1);
  });

  it("counts a folder group by what matched, never by what is in a folder", () => {
    const sections = buildResultSections({ ...base, found: EMPTY, term: "q4" });

    /*
     * One folder and one tag matched "q4", and the headings say one. That is
     * the group's own size — the same thing the API's `total` means for a
     * server group — and it is emphatically not the reference's "9 meetings ·
     * 4 tracked subjects", which are two numbers `GET /projects` does not
     * return and one concept that does not exist.
     */
    expect(sections.find((s) => s.label === "Folders")!.count).toBe(1);
    expect(sections.find((s) => s.label === "Tags")!.count).toBe(1);
  });

  it("knows the difference between no answers and no server answers", () => {
    /*
     * THE BUG THIS EXISTS FOR, FOUND BY CLICKING IT.
     *
     * <p>A workspace with a `Beta Launch` folder and a `beta` tag, and a search
     * for "beta" that no transcript matches: the server's totals are all zero
     * and there are still two real results. Deciding the zero state from the
     * server's total drew "Nothing matched" over both of them.
     */
    const local = buildResultSections({
      ...base,
      found: EMPTY,
      term: "platform",
    });

    expect(foundNothing(local)).toBe(false);
    expect(countAnswers(local)).toBe(2);
    expect(foundNothing(buildResultSections({ ...base, found: EMPTY, term: "zzz" }))).toBe(true);
    expect(countAnswers(buildResultSections({ ...base, found: EMPTY, term: "zzz" }))).toBe(0);
  });

  it("counts the archive behind the panel, not the rows in it", () => {
    const sections = buildResultSections({ ...base, found: found(), term: "diarization" });

    // 14 passages + 2 decisions + 5 meetings + 1 person, of which five rows are
    // drawn. Ask is not an answer and is not counted.
    expect(countAnswers(sections)).toBe(22);
  });

  it("keeps only the group a scope names", () => {
    const sections = buildResultSections({
      ...base,
      found: found(),
      term: "diarization",
      scope: "decisions",
    });

    // Ask stays: it is the query's row, not a result group's.
    expect(sections.map((s) => s.label)).toEqual(["Ask Reverie", "Decisions"]);
  });

  it("draws more of one group when it is the only one", () => {
    const many = found({
      mentions: {
        total: 40,
        hits: Array.from({ length: 12 }, (_, i) => ({
          ...found().mentions.hits[0],
          segmentId: `seg_${i}`,
        })),
      },
    });

    const overview = buildResultSections({ ...base, found: many, term: "diarization" });
    const only = buildResultSections({
      ...base,
      found: many,
      term: "diarization",
      scope: "mentions",
    });

    // Five in the overview, where it shares the panel with three other groups;
    // all of them when it is the answer.
    expect(overview.find((s) => s.label === "Transcripts")!.rows).toHaveLength(5);
    expect(only.find((s) => s.label === "Transcripts")!.rows).toHaveLength(12);
  });

  it("sends every row somewhere it can actually go", () => {
    const rows = flattenRows(
      buildResultSections({ ...base, found: found(), term: "q4 diarization" }),
    );

    // A row the arrow keys can reach and nothing can do with is the one thing
    // this list must not contain, so every variant carries its own action.
    for (const row of rows) {
      const actionable =
        ("href" in row && Boolean(row.href)) ||
        ("search" in row && Boolean(row.search)) ||
        row.kind === "ask" ||
        row.kind === "action";
      expect(actionable, row.kind).toBe(true);
    }
  });

  it("jumps a transcript match to the second it was said", () => {
    const rows = flattenRows(
      buildResultSections({ ...base, found: found(), term: "diarization" }),
    );
    const mention = rows.find((r) => r.kind === "mention")!;

    expect("href" in mention && mention.href).toBe("/meetings/mtg_2?t=1445");
  });

  it("opens a decision at the top of its meeting, promising no second", () => {
    // `meeting_insights` stores no timecode — insights are extracted per
    // meeting rather than per segment — and a link that promised 0:00 would
    // land there.
    const rows = flattenRows(
      buildResultSections({ ...base, found: found(), term: "diarization" }),
    );
    const decision = rows.find((r) => r.kind === "decision")!;

    expect("href" in decision && decision.href).toBe("/meetings/mtg_1");
  });

  it("writes a tag back as the filter the grammar already has", () => {
    const rows = flattenRows(buildResultSections({ ...base, found: EMPTY, term: "q4" }));
    const tag = rows.find((r) => r.kind === "tag")!;

    // Quoted and with a trailing space: tags have spaces in them, and the
    // cursor should land past the filter ready for a term.
    expect("search" in tag && tag.search).toBe('tag:"q4" ');
  });

  it("keeps two sets of rows apart when both are on screen", () => {
    // The zero state shows the broader search's results under the typed
    // query's explanation. Two rows for one meeting would collide as keys.
    const a = flattenRows(buildResultSections({ ...base, found: found(), term: "x" }));
    const b = flattenRows(
      buildResultSections({ ...base, found: found(), term: "x", prefix: "close-" }),
    );

    expect(new Set([...a, ...b].map((r) => r.key)).size).toBe(a.length + b.length);
  });
});

describe("matching what the browser already holds", () => {
  it("finds a folder however it was capitalised", () => {
    expect(matchFolders(projects, "q4").map((p) => p.name)).toEqual(["Q4 planning"]);
    expect(matchFolders(projects, "PLAT").map((p) => p.name)).toEqual(["Platform"]);
  });

  it("finds nothing for nothing", () => {
    expect(matchFolders(projects, "   ")).toEqual([]);
    expect(matchFolders(undefined, "q4")).toEqual([]);
    expect(matchTags(undefined, "q4")).toEqual([]);
    expect(matchTags(["q4"], "")).toEqual([]);
  });

  it("matches a tag on a fragment, as the search itself does", () => {
    expect(matchTags(["platform", "q4"], "for")).toEqual(["platform"]);
  });
});

describe("walking the list", () => {
  const rows = flattenRows(
    buildResultSections({ ...base, found: found(), term: "diarization" }),
  );

  it("crosses a group boundary as though it were not there", () => {
    // Ask, the transcript, the decision, the meeting, the person: five rows in
    // four groups, and one key walks all of them.
    const keys = rows.map((r) => r.kind);
    expect(keys).toEqual(["ask", "mention", "decision", "meeting", "person"]);

    let at: string | null = rows[1].key;
    at = step(rows, at, 1);
    expect(rowAt(rows, at)!.kind).toBe("decision");
    at = step(rows, at, 1);
    expect(rowAt(rows, at)!.kind).toBe("meeting");
  });

  it("stops at both ends rather than wrapping", () => {
    /*
     * Wrapping from the last result round to the best is a way of opening the
     * wrong thing while holding a key down.
     */
    const top = step(rows, rows[0].key, -1);
    expect(top).toBe(rows[0].key);

    const bottom = step(rows, rows[rows.length - 1].key, 1);
    expect(bottom).toBe(rows[rows.length - 1].key);
  });

  it("recovers to the first row when the selection has gone", () => {
    // The results changed under it — a settled keystroke, a scope switch. An
    // index would have pointed at whatever moved into that position.
    expect(step(rows, "a-key-from-the-last-search", 1)).toBe(rows[0].key);
    expect(rowAt(rows, "a-key-from-the-last-search")).toBeNull();
    expect(rowAt(rows, null)).toBeNull();
  });

  it("has nothing to move to in an empty panel", () => {
    expect(step([], null, 1)).toBeNull();
    expect(step([], "x", -1)).toBeNull();
  });
});
