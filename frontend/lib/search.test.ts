import { describe, it, expect } from "vitest";
import {
  broaden,
  EMPTY_SEARCH,
  groupFor,
  highlight,
  isLocalScope,
  meetingHref,
  presetFrom,
  SEARCH_SCOPES,
  snippet,
  toQueryArgs,
  totalResults,
  type SearchState,
} from "@/lib/search";
import type { SearchResponse } from "@/lib/types";

/**
 * The rules behind the search page.
 *
 * Every one of these renders perfectly when wrong, which is why they are tested
 * here rather than through the page: a date bound off by a day, a filter lost
 * on reload, a highlighter that throws on a bracket. None of it needs a DOM,
 * and all of it is the kind of thing that gets quietly broken by an unrelated
 * change six weeks from now.
 */

const NOW = new Date("2026-08-15T14:30:00.000Z");

function state(over: Partial<SearchState> = {}): SearchState {
  return { ...EMPTY_SEARCH, ...over };
}

describe("date presets", () => {
  it("starts today at midnight, not 24 hours ago", () => {
    // A meeting at nine this morning is still today's at nine tonight. A
    // rolling day would drop it off the list halfway through the evening.
    const from = new Date(presetFrom("today", NOW));

    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
    expect(from.getDate()).toBe(NOW.getDate());
  });

  it("rolls the longer windows back from now", () => {
    // Nobody means "since the 1st" by "past 30 days".
    const week = new Date(presetFrom("week", NOW));
    expect(Math.round((NOW.getTime() - week.getTime()) / 86_400_000)).toBe(7);

    const year = new Date(presetFrom("year", NOW));
    expect(Math.round((NOW.getTime() - year.getTime()) / 86_400_000)).toBe(365);
  });

  it("has no bound at all for any time", () => {
    expect(presetFrom("any", NOW)).toBe("");
  });

});

describe("request arguments", () => {
  it("asks for every group the panel draws, and for enough of each", () => {
    const args = toQueryArgs(state({ q: "stripe" }), NOW);

    /*
     * FOUR, AND IT WAS TWO.
     *
     * <p>The API answers with six groups and the panel used to draw two, so
     * `decisions` and `people` were computed by Postgres on every search and
     * discarded on arrival. Both are drawn now.
     *
     * <p>Still named rather than omitted: absent means every group the server
     * has, and `risks` and `commitments` are two searches whose answers nothing
     * renders.
     */
    expect(args.groups).toEqual(["meetings", "mentions", "decisions", "people"]);
    // Five was a preview, with "See all results" opening a page that fetched
    // fifty. There is no page: this list is what the search found.
    expect(args.limit).toBe(25);
  });

  it("never asks for a group the panel cannot draw", () => {
    for (const s of [state({ q: "x" }), state({ q: "x", group: "meetings" })]) {
      for (const g of toQueryArgs(s, NOW).groups ?? []) {
        expect(["meetings", "mentions", "decisions", "people"]).toContain(g);
        // The two the API has and nothing renders.
        expect(g).not.toBe("risks");
        expect(g).not.toBe("commitments");
      }
    }
  });

  it("asks for one deep group when one is opened", () => {
    const args = toQueryArgs(state({ q: "stripe", group: "mentions" }), NOW);

    expect(args.groups).toEqual(["mentions"]);
    expect(args.limit).toBe(50);
  });

  it("omits every filter that is not set", () => {
    const args = toQueryArgs(state({ q: "stripe" }), NOW);

    // Sent empty, these would be part of the cache key, and `?q=stripe` and
    // `?q=stripe&tag=` would be fetched as two different searches.
    expect(args.from).toBeUndefined();
    expect(args.tag).toBeUndefined();
    expect(args.type).toBeUndefined();
    expect(args.project).toBeUndefined();
  });

  it("passes the filters that are set", () => {
    const args = toQueryArgs(
      state({ q: "stripe", date: "week", tag: "finance", project: "prj_1" }),
      NOW,
    );

    expect(args.tag).toBe("finance");
    expect(args.project).toBe("prj_1");
    expect(args.from).toBe(presetFrom("week", NOW));
  });
});

describe("highlighting", () => {
  it("marks the term inside the text", () => {
    expect(highlight("The Stripe migration", "stripe")).toEqual([
      { text: "The ", match: false },
      { text: "Stripe", match: true },
      { text: " migration", match: false },
    ]);
  });

  it("marks every term of a multi-word search", () => {
    const parts = highlight("stripe and acme", "acme stripe");
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(["stripe", "acme"]);
  });

  it("does not treat the search term as a regular expression", () => {
    // Ordinary punctuation in a search box would otherwise throw inside a
    // render, on the one screen whose whole job is arbitrary text.
    expect(() => highlight("the (draft) plan", "(draft)")).not.toThrow();
    expect(highlight("c++ rewrite", "c++").some((p) => p.match)).toBe(true);
  });

  it("leaves text alone when nothing was searched for", () => {
    expect(highlight("anything", "")).toEqual([{ text: "anything", match: false }]);
    expect(highlight("anything", "???")).toEqual([{ text: "anything", match: false }]);
  });
});

describe("snippets", () => {
  const long = `${"a ".repeat(120)}stripe invoice ${"b ".repeat(120)}`;

  it("leaves short text whole", () => {
    expect(snippet("short enough", "stripe")).toBe("short enough");
  });

  it("cuts a window around the match, not from the start", () => {
    const cut = snippet(long, "stripe");

    // Cutting from the beginning shows a sentence with no visible reason for
    // being in the results.
    expect(cut).toContain("stripe");
    expect(cut.startsWith("…")).toBe(true);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThan(long.length);
  });

  it("falls back to the opening when the term is not in the text", () => {
    // Commitments match on their owner and source sentence too, so a hit whose
    // visible text has no match in it is normal rather than a bug.
    const cut = snippet(long, "nowhere");

    expect(cut.startsWith("a a")).toBe(true);
    expect(cut.endsWith("…")).toBe(true);
  });
});

describe("links", () => {
  it("seeks to the mention", () => {
    expect(meetingHref("mtg_1", 942.7)).toBe("/meetings/mtg_1?t=942");
  });

  it("opens at the top when there is no timestamp", () => {
    expect(meetingHref("mtg_1", null)).toBe("/meetings/mtg_1");
    expect(meetingHref("mtg_1", 0)).toBe("/meetings/mtg_1");
  });
});

describe("totals", () => {
  const response = {
    query: "stripe",
    meetings: { total: 12, hits: [] },
    people: { total: 1, hits: [] },
    decisions: { total: 3, hits: [] },
    risks: { total: 2, hits: [] },
    commitments: { total: 4, hits: [] },
    mentions: { total: 27, hits: [] },
  } as unknown as SearchResponse;

  it("adds up only the groups the panel draws", () => {
    // Meetings, mentions, decisions and people: 12 + 27 + 3 + 1. The server
    // still answers with risks and commitments, and counting those would put
    // the panel in its "there are results" branch and then render nothing — an
    // empty list insisting it found something.
    expect(totalResults(response)).toBe(43);
  });

  it("is zero when the only matches are in groups that are not shown", () => {
    const hidden = {
      ...response,
      meetings: { total: 0, hits: [] },
      mentions: { total: 0, hits: [] },
      decisions: { total: 0, hits: [] },
      people: { total: 0, hits: [] },
    } as unknown as SearchResponse;

    // Risks: 2 and commitments: 4 are still in there, and neither is drawn.
    expect(totalResults(hidden)).toBe(0);
  });

  it("is zero before anything has loaded", () => {
    expect(totalResults(undefined)).toBe(0);
  });

});

describe("the scope", () => {
  it("asks the API for the group it names", () => {
    expect(groupFor("mentions")).toBe("mentions");
    expect(groupFor("decisions")).toBe("decisions");
    expect(groupFor("people")).toBe("people");
    expect(groupFor("meetings")).toBe("meetings");
  });

  it("still asks for everything when the scope is drawn in the browser", () => {
    /*
     * Folders and tags are not result groups on the server — `GET /search`
     * takes each as a *filter* and never answers with one — so those two scopes
     * filter lists the panel already holds. Narrowing the request as well would
     * mean switching to Folders and back re-ran the search for nothing.
     */
    expect(isLocalScope("folders")).toBe(true);
    expect(isLocalScope("tags")).toBe(true);
    expect(groupFor("folders")).toBe("all");
    expect(groupFor("tags")).toBe("all");
    expect(isLocalScope("mentions")).toBe(false);
  });

  it("offers nothing the panel cannot draw", () => {
    const values = SEARCH_SCOPES.map((s) => s.value);

    expect(values).toEqual([
      "all",
      "mentions",
      "decisions",
      "meetings",
      "people",
      "folders",
      "tags",
    ]);
    // A scope that empties the panel is worse than one option fewer.
    expect(values).not.toContain("risks");
    expect(values).not.toContain("commitments");
  });
});

describe("broadening a search that found nothing", () => {
  it("drops the last word, which is the one being typed", () => {
    /*
     * The server ANDs the terms and only the last is a prefix match, so a
     * two-word search finding nothing says nothing about either word. Dropping
     * the last one is the same search, wider — which is what makes the zero
     * state's results real results rather than a guess at something similar.
     */
    expect(broaden("onboarding funnel")).toBe("onboarding");
    expect(broaden("the stripe migration plan")).toBe("the stripe migration");
  });

  it("has nothing to offer for a single word", () => {
    // There is no shorter search, and a suggestion engine that invented a
    // similar-looking term would put words on screen nobody ever said.
    expect(broaden("onboarding")).toBe("");
    expect(broaden("  ")).toBe("");
    expect(broaden("")).toBe("");
  });

  it("ignores the spacing somebody typed", () => {
    expect(broaden("  onboarding   funnel  ")).toBe("onboarding");
  });
});
