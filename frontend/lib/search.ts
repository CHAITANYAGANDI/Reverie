import type {
  SearchGroupKey,
  SearchMentionHit,
  SearchQueryArgs,
  SearchResponse,
} from "@/lib/types";

/**
 * The state behind the search box, and the arithmetic that turns it into a
 * request and into highlighted text.
 *
 * All of it is here rather than in the page for one reason: none of it needs a
 * DOM, and every piece of it is a rule that is easy to get subtly wrong and
 * impossible to notice by looking. "Last 7 days" that quietly means "since this
 * time last Tuesday", a highlighter that treats a searched-for bracket as a
 * regular expression, a URL that loses a filter on reload — each renders
 * perfectly and answers the wrong question.
 */

/**
 * The groups this search renders, of the six the API answers with.
 *
 * <h2>It was two, and the other four were being thrown away</h2>
 *
 * <p>`meetings` and `mentions`, on the reasoning that the question a search box
 * answers is "where was this discussed", and the answer to that is a
 * conversation and the sentence inside it — so people, decisions, commitments
 * and risks were four more lists reaching the same meeting by a longer route.
 *
 * <p>That argument is right about commitments and risks and wrong about the
 * other two, which is why this is now four. A decision is not a route to a
 * meeting: "what did we settle about the provider" is answered by the sentence
 * that settled it, and `meeting_insights` holds exactly that. A person is not a
 * route either — it is the one query in the archive that cannot be expressed as
 * a term, because "everything Priya said" is a filter and not a search.
 *
 * <p>`commitments` and `risks` stay unrequested, and deliberately: an action
 * item is a thing to work through rather than a thing to find, the Now page and
 * the meeting both list them, and a risk is a line in a brief. Both are one
 * entry in {@link SEARCH_SCOPES} away if that turns out to be wrong — the API
 * has answered with them all along.
 */
export type ShownGroupKey = Extract<
  SearchGroupKey,
  "meetings" | "mentions" | "decisions" | "people"
>;

/** `all` is the overview: every group at once, a few rows each. */
export type GroupSelection = ShownGroupKey | "all";

export type DatePreset =
  | "any"
  | "today"
  | "week"
  | "month"
  | "quarter"
  | "year";

/**
 * A search: a term, and four ways of narrowing it.
 *
 * Speaker, status, action owner and "settled a decision" are gone. Owner and
 * decisions only ever narrowed lists this page no longer draws, and a control
 * that cannot change what is on screen is worse than no control because it gets
 * tried. The other two went with them: eight dropdowns over two kinds of result
 * is a filter bar wider than its answer. What is left is what people reach for
 * — when it was, what kind of meeting, how it was tagged, which folder.
 */
export interface SearchState {
  q: string;
  group: GroupSelection;
  date: DatePreset;
  type: string;
  tag: string;
  /** A project id, or `none` for meetings filed nowhere. */
  project: string;
}

export const EMPTY_SEARCH: SearchState = {
  q: "",
  group: "all",
  date: "any",
  type: "",
  tag: "",
  project: "",
};

/** The project filter value meaning "not filed anywhere". */
export const UNFILED_PROJECT = "none";

/**
 * The groups asked for.
 *
 * <p>Named on every request, so the API stops answering with what nobody
 * renders — it has six and this asks for four. The order here is the request's,
 * not the screen's: what is drawn first is decided in `lib/search-rows`, where
 * transcript moments lead because a sentence somebody said is a better answer
 * than the name of the meeting it was said in.
 */
const SHOWN_GROUPS: ShownGroupKey[] = ["meetings", "mentions", "decisions", "people"];

/**
 * What the scope control offers, in the order it lists them.
 *
 * <p>Two kinds of thing in one list, which is a compromise worth naming.
 * `meetings`, `mentions`, `decisions` and `people` narrow the *request* — the
 * API takes a `groups` parameter, so choosing one is a cheaper search and not
 * merely a shorter list. `folders` and `tags` narrow only what is drawn: both
 * are matched in the browser against lists already held for the filter
 * autocompletion, because neither is a server-side result group.
 *
 * <p>Nothing here is offered that cannot answer. There is no `Risks` and no
 * `Action items` entry, because nothing renders those; a scope that empties the
 * panel is worse than one option fewer.
 */
export const SEARCH_SCOPES = [
  { value: "all", label: "Everything" },
  { value: "mentions", label: "Transcripts" },
  { value: "decisions", label: "Decisions" },
  { value: "meetings", label: "Meetings" },
  { value: "people", label: "People" },
  { value: "folders", label: "Folders" },
  { value: "tags", label: "Tags" },
] as const;

/** One of {@link SEARCH_SCOPES}. */
export type SearchScope = (typeof SEARCH_SCOPES)[number]["value"];

/** The two scopes that are drawn in the browser rather than asked of the API. */
export type LocalScope = Extract<SearchScope, "folders" | "tags">;

const LOCAL_SCOPES: LocalScope[] = ["folders", "tags"];

/**
 * True where the scope narrows what is drawn rather than what is requested.
 *
 * <p>A type predicate rather than a boolean, so {@link groupFor} can hand the
 * remainder straight to the request: the four that are left are exactly the
 * four server groups, and proving that here is better than repeating the list.
 */
export function isLocalScope(scope: SearchScope): scope is LocalScope {
  return (LOCAL_SCOPES as readonly string[]).includes(scope);
}

/**
 * The `group` a scope selects, for {@link toQueryArgs}.
 *
 * <p>A local scope still asks for everything: `Folders` is a filter over a list
 * the box already has, and dropping the request would mean switching to it and
 * back re-running the search for no reason.
 */
export function groupFor(scope: SearchScope): GroupSelection {
  return scope === "all" || isLocalScope(scope) ? "all" : scope;
}

/**
 * The same search with its last word dropped, or `""` when there is no shorter
 * one to try.
 *
 * <h2>Why this is honest and not a guess</h2>
 *
 * <p>`SearchTerms.toTsQuery` ANDs the terms — "onboarding funnel" means both
 * words, and only the last is a prefix — so a two-word search returning nothing
 * says nothing about whether either word appears. Dropping the last one is a
 * real, broader search of the same archive, and its results are results rather
 * than similar-looking suggestions.
 *
 * <p>Which is the whole reason the zero state can offer anything at all. The
 * alternative — a list of terms "close to" what was typed — would have to come
 * from a suggestion engine this product does not have, and inventing one out of
 * string edit distance would put words on screen that nobody in the archive
 * ever said.
 *
 * <p>The trailing word rather than any other, because it is the one being
 * typed: the prefix match makes it the least settled part of the query, and it
 * is where a typo is.
 */
export function broaden(query: string): string {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return "";
  return words.slice(0, -1).join(" ");
}

/**
 * A preset as an absolute lower bound.
 *
 * "Today" is midnight local time, not 24 hours ago: a meeting at nine this
 * morning is today's whatever the clock says now, and a rolling day would drop
 * it after nine tonight. The longer presets are rolling on purpose — nobody
 * means "since the 1st" by "past 30 days".
 */
export function presetFrom(preset: DatePreset, now: Date = new Date()): string {
  if (preset === "any") return "";
  const d = new Date(now.getTime());
  if (preset === "today") {
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  const days = { week: 7, month: 30, quarter: 90, year: 365 }[preset];
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/**
 * The request this state asks for.
 *
 * `group` decides how many rows: the overview wants a preview of each, and one
 * group opened on its own wants a page of it. The list itself is always sent.
 * An absent one means every group the server has, and four of those are no
 * longer drawn — leaving it off would buy four more searches across four more
 * tables and drop the answers on arrival.
 */
export function toQueryArgs(
  s: SearchState,
  now: Date = new Date(),
): SearchQueryArgs {
  const one = s.group !== "all";
  return {
    q: s.q,
    groups: one ? [s.group as ShownGroupKey] : SHOWN_GROUPS,
    // Both groups used to fetch five rows each, because the overlay was a
    // preview and "See all results" opened a page that fetched fifty. The page
    // is gone and this is the whole answer now, so it asks for a list worth
    // scrolling — which is what the results panel already does.
    limit: one ? 50 : 25,
    from: presetFrom(s.date, now) || undefined,
    type: s.type || undefined,
    tag: s.tag || undefined,
    project: s.project || undefined,
  };
}

/**
 * How many results there are — counting only what the box draws.
 *
 * The server still answers with commitments and risks. Adding those in would
 * put the box into its "there are results" branch and then render nothing: an
 * empty panel insisting it found something.
 */
export function totalResults(res: SearchResponse | undefined): number {
  if (!res) return 0;
  return (
    res.meetings.total + res.mentions.total + res.decisions.total + res.people.total
  );
}

// ---- Text ----------------------------------------------------------------- //

export interface TextPart {
  text: string;
  match: boolean;
}

/**
 * Terms, split the way the server splits them: on anything not alphanumeric.
 *
 * Used by the highlighter and by {@link meaningWorthShowing}, which both have to
 * agree with the server about what counts as a word — a highlighter that marks
 * something the search did not match on is a claim about why a result is there.
 */
function terms(query: string): string[] {
  return query
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0)
    .slice(0, 8);
}

const ESCAPE = /[.*+?^${}()|[\]\\]/g;

/**
 * Splits text into matched and unmatched runs, for rendering.
 *
 * Every term is escaped before it reaches the regular expression. Without that,
 * searching for "(draft)" or "c++" throws inside a render — a crash caused by
 * ordinary punctuation in a search box, on the one screen whose entire job is
 * accepting arbitrary text.
 */
export function highlight(text: string, query: string): TextPart[] {
  const found = terms(query);
  if (found.length === 0 || !text) return [{ text, match: false }];

  const pattern = new RegExp(
    `(${found.map((t) => t.replace(ESCAPE, "\\$&")).join("|")})`,
    "giu",
  );
  return text
    .split(pattern)
    .filter((part) => part !== "")
    .map((part) => ({
      text: part,
      match: found.some((t) => t.toLowerCase() === part.toLowerCase()),
    }));
}

/**
 * Trims long text to a window around the first match.
 *
 * A transcript utterance can run for a paragraph, and the term is as likely to
 * be at the end of it as the start. Cutting from the beginning would show the
 * user a sentence with no visible reason for being in their results.
 */
export function snippet(text: string, query: string, radius = 90): string {
  const clean = (text ?? "").trim();
  if (clean.length <= radius * 2) return clean;

  const found = terms(query);
  const lower = clean.toLowerCase();
  let at = -1;
  for (const t of found) {
    const i = lower.indexOf(t.toLowerCase());
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return `${clean.slice(0, radius * 2).trimEnd()}…`;

  const start = Math.max(0, at - radius);
  const end = Math.min(clean.length, at + radius);
  return `${start > 0 ? "…" : ""}${clean.slice(start, end).trim()}${
    end < clean.length ? "…" : ""
  }`;
}

/**
 * Where a result links to.
 *
 * A mention carries a timestamp, and dropping it would land the reader at the
 * top of an hour-long transcript holding the sentence they were promised.
 */
export function meetingHref(meetingId: string, start?: number | null): string {
  return start != null && start > 0
    ? `/meetings/${meetingId}?t=${Math.floor(start)}`
    : `/meetings/${meetingId}`;
}
