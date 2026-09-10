/**
 * What the search panel draws, as data.
 *
 * <h2>Why this is a module and not JSX</h2>
 *
 * <p>Because the two hard parts of a command palette are both decisions about a
 * *list*, and neither needs a DOM. One arrow key has to walk every result in
 * the panel as though the group headings were not there — across a decision, a
 * meeting and a folder, which are three shapes of row from three sources — and
 * a heading must never appear over nothing. Both are easy to get wrong in a way
 * that renders perfectly: a selection index that points into the wrong group
 * after the results change opens the wrong thing, silently.
 *
 * <p>So the panel is described here as sections of rows, every row carries what
 * activating it does, and `components/search-rows` only draws them. The
 * flattening in {@link flattenRows} is the arrow keys' whole model.
 *
 * <h2>Selection is a key, not an index</h2>
 *
 * <p>Rows arrive from four groups on the server plus two lists filtered in the
 * browser, and a scope change or a settled keystroke can reorder all of them.
 * An integer into that list is a promise that the list has not changed since it
 * was taken. A key is not — {@link rowAt} looks it up, and a selection whose row
 * has gone falls back to the first rather than to whatever moved into slot 3.
 *
 * <h2>What is not here</h2>
 *
 * <p>No scoring, no ranking and no merging of groups into one "relevance"
 * order. The server decides what matches; this decides where it goes. A
 * relevance sort in the browser over four separately-ranked groups would be a
 * fourth opinion about ordering, invented from the two fields they have in
 * common.
 */

import type {
  Project,
  SearchInsightHit,
  SearchMeetingHit,
  SearchMentionHit,
  SearchPersonHit,
  SearchResponse,
} from "@/lib/types";
import { meetingHref, type SearchScope } from "@/lib/search";
import { folderHref } from "@/lib/routes";

/**
 * One activatable line in the panel.
 *
 * <p>Every variant says what pressing it does, and there are only three things
 * it can be: go somewhere (`href`), put a different search in the box
 * (`search`), or run one of the app's own actions (`act`). Rows that do nothing
 * are not in this union, which is what keeps the arrow keys honest — anything
 * reachable is openable.
 */
export type SearchRow =
  /** Hand the query to Ask Reverie. Drawn first, and only for a real query. */
  | { kind: "ask"; key: string; query: string }
  | { kind: "meeting"; key: string; href: string; hit: SearchMeetingHit }
  | { kind: "mention"; key: string; href: string; hit: SearchMentionHit }
  | { kind: "decision"; key: string; href: string; hit: SearchInsightHit }
  /**
   * Somebody in the archive. `search` rather than `href`, because there is no
   * person page in Reverie and inventing one would be inventing a route: what
   * their name is good for is the search that finds what they said and what was
   * said about them, which is the search that just found them.
   */
  | { kind: "person"; key: string; search: string; hit: SearchPersonHit }
  | { kind: "folder"; key: string; href: string; project: Project }
  /**
   * A tag, as the filter it is. Activating writes `tag:"…"` into the box —
   * the grammar that already exists in `lib/search-query`, and the only thing a
   * tag can mean here: there is no tag page to navigate to.
   */
  | { kind: "tag"; key: string; search: string; tag: string }
  /** Something searched before, put back in the box. */
  | { kind: "recent"; key: string; search: string }
  /** One of the app's own actions. */
  | { kind: "action"; key: string; act: SearchAction; label: string; hint: string };

/** The actions the resting state offers. Each one already exists elsewhere. */
export type SearchAction = "record" | "import" | "settings";

export interface SearchSection {
  key: string;
  label: string;
  /**
   * The count drawn at the right of the heading, where there is a true one.
   *
   * <p>The API's own `total` for the four server groups, which is how "14" can
   * sit over five drawn rows. `undefined` for everything else — a count over a
   * list that is already complete is noise, and a count of the rows drawn
   * dressed up as a total is a lie about the archive.
   */
  count?: number;
  /** Offer a way to forget this group. Only the search history has one. */
  clearable?: boolean;
  rows: SearchRow[];
}

/**
 * How many rows of each group the overview draws.
 *
 * <p>Chosen by what each group is worth reading rather than evenly: a transcript
 * passage is the most informative result there is and gets five, a folder is a
 * name and gets three. Together they are about a panel and a half at the modal's
 * height, which is what the scroll is for.
 *
 * <p>Ignored when one scope is chosen — then the group is the whole answer and
 * the only cap is what the request asked for.
 */
const OVERVIEW: Record<string, number> = {
  mentions: 5,
  decisions: 3,
  meetings: 4,
  people: 3,
  folders: 3,
  tags: 5,
};

function cap(key: string, scope: SearchScope): number {
  return scope === "all" ? (OVERVIEW[key] ?? 4) : 50;
}

/** Case- and space-insensitive containment, which is what both local lists need. */
function contains(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

/**
 * Folders whose name contains the term.
 *
 * <p>Matched here rather than asked of the API, because there is no folder
 * result group: `GET /search` takes a folder as a *filter* and never answers
 * with one. The list itself is real and already loaded — the same
 * `GET /projects` the `in:` autocompletion reads — so this is a filter over
 * data the panel is holding anyway, not a search pretending to be one.
 *
 * <p>Nothing is counted. The screenshot's "9 meetings · 4 tracked subjects" is
 * two numbers this endpoint does not return, and a folder row saying how much
 * is in it would have to make them up.
 */
export function matchFolders(projects: Project[] | undefined, term: string): Project[] {
  if (!term.trim() || !projects) return [];
  return projects.filter((p) => contains(p.name, term));
}

/** Tags containing the term, from the workspace's own facet list. */
export function matchTags(tags: string[] | undefined, term: string): string[] {
  if (!term.trim() || !tags) return [];
  return tags.filter((t) => contains(t, term));
}

export interface BuildOptions {
  found: SearchResponse | undefined;
  projects: Project[] | undefined;
  tags: string[] | undefined;
  /** The free-text term, filters already stripped out. */
  term: string;
  scope: SearchScope;
  /** Include the Ask row. False for the close-matches list, which has one above it. */
  ask?: boolean;
  /** Distinguishes two sets of rows on screen at once — see the zero state. */
  prefix?: string;
}

/**
 * The panel, for a query that has results.
 *
 * <h2>The order, and why it is not the old one</h2>
 *
 * <p>Transcripts first, then decisions, then meetings. The previous
 * implementation led with meetings on the reasoning that it is the coarsest
 * answer — which conversation is this about — and the V2 reference reverses it,
 * correctly: "the exact words somebody said" is a better answer to a typed
 * phrase than "a meeting where those words occur somewhere", and the meeting is
 * one line below anyway. People, folders and tags come last because they are
 * ways of narrowing rather than things somebody was looking for.
 *
 * <p>A group with nothing in it produces no section at all, which is what makes
 * the panel's height mean something. Empty headings are the commonest way a
 * grouped result list comes to look broken.
 */
export function buildResultSections(opts: BuildOptions): SearchSection[] {
  const { found, projects, tags, term, scope, ask = true, prefix = "" } = opts;
  const sections: SearchSection[] = [];
  const id = (s: string) => `${prefix}${s}`;
  const wants = (key: string) => scope === "all" || scope === key;

  if (ask && term.trim()) {
    sections.push({
      key: id("ask"),
      label: "Ask Reverie",
      rows: [{ kind: "ask", key: id("ask-row"), query: term.trim() }],
    });
  }

  if (found && wants("mentions") && found.mentions.hits.length > 0) {
    sections.push({
      key: id("mentions"),
      // NOT "Moments", which the V2 reference calls this group. `moments` is
      // already a Reverie noun and it means something else: the highlights,
      // bookmarks and notes somebody puts on a transcript themselves. Two
      // meanings for one word, one of them in the product's own API, is worse
      // than departing from the screenshot's label.
      label: "Transcripts",
      count: found.mentions.total,
      rows: found.mentions.hits.slice(0, cap("mentions", scope)).map((hit) => ({
        kind: "mention" as const,
        key: id(`mention-${hit.segmentId}`),
        // Straight to the second it was said. A sentence you cannot jump to is
        // only an assertion that the word is in there somewhere.
        href: meetingHref(hit.meetingId, hit.start),
        hit,
      })),
    });
  }

  if (found && wants("decisions") && found.decisions.hits.length > 0) {
    sections.push({
      key: id("decisions"),
      label: "Decisions",
      count: found.decisions.total,
      rows: found.decisions.hits.slice(0, cap("decisions", scope)).map((hit) => ({
        kind: "decision" as const,
        key: id(`decision-${hit.id}`),
        // The meeting it was decided in. `meeting_insights` stores no timecode,
        // so there is no second to seek to — see the row's own note.
        href: meetingHref(hit.meetingId),
        hit,
      })),
    });
  }

  if (found && wants("meetings") && found.meetings.hits.length > 0) {
    sections.push({
      key: id("meetings"),
      label: "Meetings",
      count: found.meetings.total,
      rows: found.meetings.hits.slice(0, cap("meetings", scope)).map((hit) => ({
        kind: "meeting" as const,
        key: id(`meeting-${hit.id}`),
        href: meetingHref(hit.id),
        hit,
      })),
    });
  }

  if (found && wants("people") && found.people.hits.length > 0) {
    sections.push({
      key: id("people"),
      label: "People",
      count: found.people.total,
      rows: found.people.hits.slice(0, cap("people", scope)).map((hit) => ({
        kind: "person" as const,
        key: id(`person-${hit.name}`),
        search: hit.name,
        hit,
      })),
    });
  }

  const folders = wants("folders") ? matchFolders(projects, term) : [];
  if (folders.length > 0) {
    sections.push({
      key: id("folders"),
      label: "Folders",
      // The number that matched, which for a list filtered in the browser is
      // simply its length. Not a count of what is *in* each folder — that is
      // the number `GET /projects` does not return and the reference invented.
      count: folders.length,
      rows: folders.slice(0, cap("folders", scope)).map((project) => ({
        kind: "folder" as const,
        key: id(`folder-${project.id}`),
        href: folderHref(project.id),
        project,
      })),
    });
  }

  const matched = wants("tags") ? matchTags(tags, term) : [];
  if (matched.length > 0) {
    sections.push({
      key: id("tags"),
      label: "Tags",
      count: matched.length,
      rows: matched.slice(0, cap("tags", scope)).map((tag) => ({
        kind: "tag" as const,
        key: id(`tag-${tag}`),
        // Quoted, and with a trailing space: tags have spaces in them, and the
        // cursor should land past the filter ready for a term.
        search: `tag:"${tag}" `,
        tag,
      })),
    });
  }

  return sections;
}

/**
 * True where a section is the Ask row rather than an answer.
 *
 * <p>Ask is about the *query*, so it must not count as a result: a query that
 * matched nothing still has an Ask row, and counting it would mean the panel
 * never reached its zero state.
 */
function isAsk(section: SearchSection): boolean {
  return section.rows.every((row) => row.kind === "ask");
}

/**
 * How many answers there are, counting the archive rather than the panel.
 *
 * <p>The API's `total` for a server group — fourteen passages behind five drawn
 * — and the length of the matched list for the two groups filtered in the
 * browser, which are their own total. Ask is excluded; see {@link isAsk}.
 */
export function countAnswers(sections: SearchSection[]): number {
  return sections
    .filter((section) => !isAsk(section))
    .reduce((n, section) => n + (section.count ?? section.rows.length), 0);
}

/** True where nothing was found — no answers, whatever the server said. */
export function foundNothing(sections: SearchSection[]): boolean {
  return sections.every(isAsk);
}

/**
 * Every row, in the order the arrow keys walk them.
 *
 * <p>Headings are not in it, which is the point: `↓` from the last transcript
 * passage lands on the first decision rather than on the word "Decisions".
 */
export function flattenRows(sections: SearchSection[]): SearchRow[] {
  return sections.flatMap((section) => section.rows);
}

/** The row a key names, or null when it has gone. */
export function rowAt(rows: SearchRow[], key: string | null): SearchRow | null {
  if (!key) return null;
  return rows.find((row) => row.key === key) ?? null;
}

/**
 * The key one step from here.
 *
 * <p>Stops at both ends rather than wrapping. A list of results is a list of
 * answers in order, and wrapping from the last to the best is a way of opening
 * the wrong one while holding a key down.
 *
 * <p>An unknown key — the results changed under the selection — moves to the
 * first row rather than nowhere.
 */
export function step(rows: SearchRow[], key: string | null, delta: 1 | -1): string | null {
  if (rows.length === 0) return null;
  const at = rows.findIndex((row) => row.key === key);
  if (at === -1) return rows[0].key;
  const next = Math.min(rows.length - 1, Math.max(0, at + delta));
  return rows[next].key;
}
