"use client";

/**
 * THE SEARCH: one surface, over everything Reverie has stored.
 *
 * <h2>What this replaced, and what it kept</h2>
 *
 * <p>A 672px box with a 56px text field in it, a `Recent searches` list, and
 * `Esc to close`. Everything it could do it still does — the typed filter
 * grammar (`when:` `type:` `tag:` `in:`) with completion from real facets, the
 * 250ms settle, the escaped highlighter, the arrow keys, Enter opening a result,
 * and the recent searches — and none of that is re-implemented here: it is
 * `lib/search-query`, `lib/search` and `lib/recent-searches`, unchanged.
 *
 * <p>What is new is that the panel now shows what the API was already
 * answering with. `GET /search` returns six groups and the old box rendered
 * two; decisions and people were being fetched-and-discarded on every search.
 * See `ShownGroupKey` in lib/search for which four are drawn and why the other
 * two are not.
 *
 * <h2>Search is retrieval. Ask is synthesis.</h2>
 *
 * <p>The division is the point of the redesign and it is visible in the code:
 * nothing in this file calls the chat API, embeds anything, or renders an
 * answer. It runs one deterministic query against Postgres and lists what came
 * back. The first row hands the same words to Ask Reverie — which reads the
 * conversations and answers with citations — through `lib/ask-handoff`, and
 * that is the only relationship between the two.
 *
 * <p>Semantic search is still not wired in. `POST /search/semantic` exists and
 * costs an embedding per call; running one on every settled keystroke in a
 * header box is not the shape of it, and the Ask row is the better answer to
 * "I do not know the words" — it does the same retrieval and then explains what
 * it found.
 *
 * <h2>The three states</h2>
 *
 * <ol>
 *   <li><b>Resting.</b> Recent searches, the newest meetings, real folders, and
 *       three things to do. Every one of them is data or a route that exists.</li>
 *   <li><b>Results.</b> Ask, then transcripts, decisions, meetings, people,
 *       folders and tags — each drawn only when it has something in it.</li>
 *   <li><b>Nothing matched.</b> An honest sentence about what was searched, the
 *       Ask row, and — when the query had more than one word — the results of
 *       the same search with its last word dropped, which is a real broader
 *       search rather than a guess at a similar one.</li>
 * </ol>
 *
 * <h2>Dialog semantics come from Radix</h2>
 *
 * <p>The old overlay was a `div` with a `role="presentation"` backdrop: no
 * accessible name, no focus trap, no focus restoration. This uses the Radix
 * primitives directly rather than the styled `DialogContent`, which centres
 * itself vertically and draws a close button — wrong for a palette that belongs
 * near the top of the window. Radix supplies `aria-modal`, the trap, Escape and
 * returning focus to whatever opened it; the only things added on top are the
 * combobox relationship and `aria-activedescendant`, because a listbox the
 * keyboard drives without ever moving focus cannot be described any other way.
 */

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import {
  useGetSearchFacetsQuery,
  useGetProjectsQuery,
  useSearchQuery,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  clearRecentSearches,
  readRecentSearches,
  rememberSearch,
} from "@/lib/recent-searches";
import {
  applySuggestion,
  describeTokens,
  parseQuery,
  suggestFor,
  toSearchState,
  wordAt,
  type Suggestion,
} from "@/lib/search-query";
import {
  broaden,
  EMPTY_SEARCH,
  groupFor,
  SEARCH_SCOPES,
  toQueryArgs,
  type SearchScope,
} from "@/lib/search";
import {
  buildResultSections,
  countAnswers,
  flattenRows,
  foundNothing,
  rowAt,
  step,
  type SearchRow,
  type SearchSection,
} from "@/lib/search-rows";
import { askReverie } from "@/lib/ask-handoff";
import { ASK, folderHref, recordHref, SETTINGS } from "@/lib/routes";
import { SearchGroupHeading, SearchRowView } from "@/components/search-rows";
import { ReverieAiMark } from "@/components/v2/reverie-ai-mark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** How long the typing has to stop before the archive is searched. */
const SETTLE_MS = 250;

/** The two listbox ids, named once because three attributes have to agree. */
const LIST_ID = "search-results";
const SUGGEST_ID = "search-suggestions";

export interface SearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Seed the box, so opening it on a search shows that search. */
  initial?: string;
  /**
   * Open the import dialog.
   *
   * <p>A callback rather than a route, because importing is a dialog the shell
   * owns and there is no `/import` page. The shell renders both this and that,
   * so it is the one place that can hand over — and the alternative would be a
   * second module store for a button.
   */
  onImport?: () => void;
}

export function SearchCommand({
  open,
  onOpenChange,
  initial = "",
  onImport,
}: SearchCommandProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { userId } = useAuth();
  const [text, setText] = React.useState(initial);
  const [cursor, setCursor] = React.useState(initial.length);
  const [highlighted, setHighlighted] = React.useState(0);
  const [scope, setScope] = React.useState<SearchScope>("all");
  const [recent, setRecent] = React.useState<string[]>([]);
  /** The text the results belong to, which lags the text being typed. */
  const [settled, setSettled] = React.useState(initial);
  /**
   * Which row the arrow keys are on, by key rather than by index.
   *
   * <p>An index into a list assembled from six sources is a promise the list
   * has not changed since the index was taken; two of those sources are
   * filtered in the browser and reorder on a keystroke. See `lib/search-rows`.
   */
  const [active, setActive] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  /**
   * Whatever had focus when this opened, so it can have it back.
   *
   * <p>Radix restores focus on close by itself, and it is not relied on here
   * for one reason: this dialog takes focus away from it on the way in.
   * `onOpenAutoFocus` is prevented so the caret lands in the search box rather
   * than on the panel, and the element to come back to has to be read at that
   * moment — before anything is moved — because by the time an effect of this
   * component runs, the child`s focus scope has already acted.
   *
   * <p>What it buys: pressing `⌘K` from a transcript, changing your mind, and
   * pressing Escape leaves the caret where it was rather than on `<body>`, so
   * the next Tab does not start again at the top of the document.
   */
  const opener = React.useRef<HTMLElement | null>(null);

  // Only fetched while the box is open. Both are workspace-wide aggregates and
  // there is no reason for every page in the app to pay for one.
  const { data: facets } = useGetSearchFacetsQuery(undefined, { skip: !open });
  const { data: projects } = useGetProjectsQuery(undefined, { skip: !open });

  React.useEffect(() => {
    if (!open) return;
    setText(initial);
    setSettled(initial);
    setCursor(initial.length);
    setHighlighted(0);
    setActive(null);
    setScope("all");
    // Read on open rather than on mount: this component is mounted by the
    // shell for the life of the tab, so a value read once would be the list as
    // it stood before every search made since.
    setRecent(readRecentSearches(userId));
  }, [open, initial, userId]);

  React.useEffect(() => {
    if (open) return;
    const back = opener.current;
    opener.current = null;
    // `isConnected`: the opener may have been a row in a list that has since
    // re-rendered, and focusing a detached node throws focus to the body — the
    // thing this exists to prevent.
    if (back && back.isConnected) back.focus();
  }, [open]);

  const catalog = React.useMemo(() => ({ facets, projects }), [facets, projects]);
  const { word } = React.useMemo(() => wordAt(text, cursor), [text, cursor]);
  const suggestions = React.useMemo(() => suggestFor(word, catalog), [word, catalog]);
  const chips = React.useMemo(() => describeTokens(parseQuery(text)), [text]);

  React.useEffect(() => setHighlighted(0), [word]);

  // Separate from the suggestions, which have to feel instant: completing
  // `tag:` is a local string operation, and a search across every transcript in
  // the workspace must not run once per keystroke.
  React.useEffect(() => {
    const t = setTimeout(() => setSettled(text), SETTLE_MS);
    return () => clearTimeout(t);
  }, [text]);

  const term = settled.trim();
  const searchState = React.useMemo(
    () =>
      toSearchState(parseQuery(settled), catalog, {
        ...EMPTY_SEARCH,
        group: groupFor(scope),
      }),
    [settled, catalog, scope],
  );
  // `new Date()` is captured per state change rather than per render: a fresh
  // date every render is a fresh cache key, and the same search would refetch
  // for as long as the box stayed open.
  const args = React.useMemo(() => toQueryArgs(searchState, new Date()), [searchState]);

  /*
   * THE SEARCH, and the empty one underneath it.
   *
   * <p>Two queries, and the second is the resting state's own. `GET /search`
   * with no term is a real request this API supports — `WorkspaceSearchService`
   * calls it browsing, and it answers with the newest meetings ordered by
   * `created_at DESC` — so the newest conversations in the resting panel are
   * the archive's, not a hard-coded list.
   *
   * <p>It is skipped the moment there is a term, and RTK Query dedupes the
   * identical request, so opening the box costs one query and typing costs one
   * more per settle. `currentData` is what makes rapid typing not flash: it is
   * the data for *these* arguments, so a response for "diar" cannot be painted
   * under "diarization" while the newer request is still out.
   */
  const { currentData: found, isFetching } = useSearchQuery(args, {
    skip: !open || term === "",
  });
  const { currentData: browse } = useSearchQuery(
    { q: "", groups: ["meetings"], limit: 4 },
    { skip: !open || term !== "" },
  );

  const sections: SearchSection[] = React.useMemo(() => {
    if (term === "") return [];
    return buildResultSections({
      found,
      projects,
      tags: facets?.tags,
      term: searchState.q,
      scope,
    });
  }, [found, projects, facets, searchState.q, scope, term]);

  /*
   * NOTHING TO SHOW — and it is the sections that decide, not the server.
   *
   * <p>It used to be `totalResults(found) === 0`, which is the four server
   * groups only. Searching "beta" in a workspace with a Beta Launch folder and
   * a beta tag and no transcript hit then drew "Nothing matched" *over* two
   * real matches: the folder and the tag are filtered in the browser, so the
   * server's total knows nothing about them. Found by clicking it.
   */
  const empty =
    term !== "" && !isFetching && found != null && foundNothing(sections);

  /*
   * The same search, one word shorter — for the zero state, and only there.
   *
   * <p>Runs only when the full query has come back with nothing and there is a
   * shorter query to try, so an ordinary search never pays for it. The results
   * are real results of a real search: the server ANDs the terms, so dropping
   * the last one broadens rather than approximates. See `broaden`.
   */
  const shorter = React.useMemo(() => broaden(searchState.q), [searchState.q]);
  const closeArgs = React.useMemo(
    () => toQueryArgs({ ...searchState, q: shorter }, new Date()),
    [searchState, shorter],
  );
  const { currentData: close } = useSearchQuery(closeArgs, {
    skip: !open || !empty || shorter === "",
  });

  /** The resting panel: history, the newest meetings, real folders, real actions. */
  const rest: SearchSection[] = React.useMemo(() => {
    if (term !== "") return [];
    const out: SearchSection[] = [];
    if (recent.length > 0) {
      out.push({
        key: "recent",
        label: "Recent searches",
        // Kept from the old box, and it is not decoration: this is the one list
        // in the panel made of the user's own words, held in their browser, and
        // the only way to take one back out.
        clearable: true,
        rows: recent.map((q) => ({ kind: "recent" as const, key: `recent-${q}`, search: q })),
      });
    }
    const meetings = browse?.meetings.hits ?? [];
    if (meetings.length > 0) {
      out.push({
        key: "browse",
        // "Recent meetings", not the reference's "Pick up where you were".
        // Reverie stores no record of what anybody last opened — these are the
        // newest in the archive, which is a different sentence and the only
        // true one available.
        label: "Recent meetings",
        // Three, not four. Measured: with four, the resting panel is 561px of
        // content in a 519px scroller at 1440, so `Open settings` was cut in
        // half by the footer — a list that looks truncated on the one screen
        // whose job is to look complete.
        rows: meetings.slice(0, 3).map((hit) => ({
          kind: "meeting" as const,
          key: `browse-${hit.id}`,
          href: `/meetings/${hit.id}`,
          hit,
        })),
      });
    }
    if (projects && projects.length > 0) {
      out.push({
        key: "folders",
        label: "Folders",
        rows: projects.slice(0, 3).map((project) => ({
          kind: "folder" as const,
          key: `rest-folder-${project.id}`,
          href: folderHref(project.id),
          project,
        })),
      });
    }
    out.push({
      key: "do",
      label: "Do something",
      rows: [
        {
          kind: "action" as const,
          key: "act-record",
          act: "record" as const,
          label: "Start recording",
          hint: "Opens the microphone on this device",
        },
        // "Import a file", not "Import a file or a link". There is no URL
        // import in Reverie: `/upload` takes an audio or video file and puts it
        // in storage. A menu offering a link would be offering nothing.
        {
          kind: "action" as const,
          key: "act-import",
          act: "import" as const,
          label: "Import a file",
          hint: "Audio or video you already have",
        },
        {
          kind: "action" as const,
          key: "act-settings",
          act: "settings" as const,
          label: "Open settings",
          hint: "Your account, email and retention",
        },
      ],
    });
    return out;
  }, [term, recent, browse, projects]);

  /** What the zero state offers below its explanation, when it can offer any. */
  const closeSections: SearchSection[] = React.useMemo(() => {
    if (!empty || !close || shorter === "") return [];
    return buildResultSections({
      found: close,
      projects,
      tags: facets?.tags,
      term: shorter,
      scope,
      ask: false,
      prefix: "close-",
    });
  }, [empty, close, shorter, projects, facets, scope]);

  /*
   * WHICH PANEL, AND WHY IT IS THE RAW TEXT THAT DECIDES.
   *
   * <p>`typing` reads the input, not the settled term. The resting state has to
   * be gone on the first keystroke — leaving `Recent searches` and a folder
   * list up for a quarter of a second while somebody types over them is the
   * box appearing not to have noticed — and it must not come back between
   * settles.
   *
   * <p>Which leaves a gap: typed, not yet searched, nothing to draw. The
   * skeleton fills it. It is the honest thing to put there, because a search
   * *is* about to run, and it is the same three bars that appear while one is
   * in flight.
   */
  const typing = text.trim() !== "";
  const panel = !typing ? rest : empty ? closeSections : sections;
  const rows = React.useMemo(() => flattenRows(panel), [panel]);
  // What is behind the panel: the API's totals for the four server groups plus
  // the length of the two lists matched in the browser. See `countAnswers`.
  const total = term === "" ? 0 : countAnswers(sections);
  /** Result rows, which is what a count of results should count. */
  const shown = rows.filter((r) => r.kind !== "ask").length;
  const searching =
    (typing && term === "") || (term !== "" && isFetching && rows.length === 0);

  /*
   * The first row, whenever the list changes underneath the selection.
   *
   * <p>Keyed on the row keys rather than on `settled`, which is what makes it
   * cover every way the list can change: a scope switch, folders arriving, the
   * zero state's shorter search coming back. Leaving the selection where it was
   * would open whatever moved into that position.
   */
  const signature = rows.map((r) => r.key).join("|");
  React.useEffect(() => {
    /*
     * The first *result*, not the first row.
     *
     * <p>The Ask row is drawn at the top, as the reference draws it, and is
     * deliberately not where the selection starts. Enter is the key somebody
     * presses without looking; it must open the best answer the archive
     * actually holds rather than spend metered AI minutes on a question a
     * search box phrased out of a search term. `⌘↵` is the one that asks, and
     * `↑` reaches the row.
     *
     * <p>Unless Ask is all there is — a scope with no matches in it — in which
     * case it is the only thing to press.
     */
    const first = rows.find((r) => r.kind !== "ask") ?? rows[0];
    setActive(first ? first.key : null);
    // Compared by value: the array is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  /** Keep the selected row in view when the list is longer than the panel. */
  React.useEffect(() => {
    if (!active) return;
    listRef.current
      ?.querySelector(`#${CSS.escape(active)}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  /*
   * NO EARLY RETURN WHEN CLOSED, and that is what makes focus come back.
   *
   * <p>It used to be `if (!open) return null`, which unmounted the whole
   * `Dialog.Root` in the same commit that closed it — so Radix had nothing left
   * to restore focus from, and pressing Escape left the caret on `<body>` with
   * the next Tab starting at the top of the document. Radix owns that
   * behaviour; it needs to be mounted to perform it.
   *
   * <p>Nothing is rendered while it is closed: the `Portal` draws no DOM, the
   * queries below are skipped on `!open`, and every effect that reads anything
   * returns early. Closed costs one component with no output.
   */

  function choose(suggestion: Suggestion) {
    const next = applySuggestion(text, cursor, suggestion);
    setText(next.text);
    setCursor(next.cursor);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.cursor, next.cursor);
    });
  }

  /**
   * Run a different search, here, in the box it was typed into.
   *
   * <p>`settled` is set directly rather than waited for — the query has been
   * typed once already, and a quarter-second of nothing after a click reads as
   * a click that missed.
   */
  function recall(query: string) {
    setText(query);
    setSettled(query);
    setCursor(query.length);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(query.length, query.length);
    });
  }

  /**
   * Hand the query to Ask Reverie.
   *
   * <p>The words go into the store and the pane or the page picks them up — see
   * `lib/ask-handoff` for why it fills the composer rather than sending. Nothing
   * is asked from here: this dialog has no chat client in it.
   *
   * <p>`/ask` rather than the side pane, because search is global. The pane
   * belongs to a page that opened it, and half the routes in the app do not
   * have one; the dedicated route is the one surface reachable from everywhere,
   * and it is the same conversation archive either way.
   */
  function handOff(query: string) {
    setRecent(rememberSearch(userId, text));
    askReverie(query);
    onOpenChange(false);
    router.push(ASK);
  }

  /** Open one row, whatever kind it is. */
  function activate(row: SearchRow) {
    if (row.kind === "ask") {
      handOff(row.query);
      return;
    }
    if (row.kind === "person" || row.kind === "tag" || row.kind === "recent") {
      recall(row.search);
      return;
    }
    if (row.kind === "action") {
      onOpenChange(false);
      if (row.act === "record") router.push(recordHref(pathname ?? "/home"));
      if (row.act === "settings") router.push(SETTINGS);
      if (row.act === "import") onImport?.();
      return;
    }
    // The search is remembered even where the result was reached in one press:
    // what somebody typed is what they will want back tomorrow.
    setRecent(rememberSearch(userId, text));
    onOpenChange(false);
    router.push(row.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Ask, from the keyboard. Before everything else because the modifier is
    // what distinguishes it: plain Enter opens the selected row.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const q = searchState.q.trim();
      if (q) handOff(q);
      return;
    }
    if (suggestions.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setHighlighted((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return (next + suggestions.length) % suggestions.length;
      });
      return;
    }
    if (e.key === "Tab" && suggestions.length > 0) {
      e.preventDefault();
      choose(suggestions[highlighted]);
      return;
    }
    if (rows.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setActive((key) => step(rows, key, e.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // Enter completes a suggestion the user is looking at. Searching past an
      // open list would mean a half-typed `tag:q` silently becoming a free-text
      // search for "tag:q".
      if (suggestions.length > 0 && word.includes(":")) {
        choose(suggestions[highlighted]);
        return;
      }
      // Then it opens what is selected, which is the first row unless the
      // arrows moved it. No row means the results have not arrived yet — and
      // Enter on a list that is not there should leave the box open rather than
      // close it on nothing, which is what makes it feel broken.
      const row = rowAt(rows, active);
      if (row) {
        activate(row);
        return;
      }
      /*
       * Nothing to open, so Enter asks — but only once the panel has
       * established that nothing matched. While a search is still in flight
       * there is no answer to that question yet, and closing the box on a
       * handoff somebody did not choose is worse than a key that did nothing.
       */
      if (empty && searchState.q.trim()) handOff(searchState.q.trim());
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/*
          The app behind it, strongly dimmed and still there. 70% over the
          near-black canvas leaves the page perceptible — which is what says
          "this is over your work" rather than "this is a new screen" — and the
          2px blur is the whole of the glass: the panel itself is opaque.
        */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          /*
           * Upper-middle, not centred: a palette that grows downwards as
           * results arrive must not move while it does, and centring it means
           * every keystroke shifts the rows under the pointer. 10vh with a
           * floor, and 640px — the reference's width, and one step in from the
           * 672 the old box used.
           *
           * `max-h` and the internal scroll are what stop it growing into the
           * window. On a phone it is the width of the viewport less a margin,
           * and taller, because there is nothing else to look at.
           */
          className={cn(
            "fixed left-[50%] top-[max(3vh,0.75rem)] z-50 w-[calc(100vw-1.5rem)] max-w-[640px] translate-x-[-50%]",
            "sm:top-[10vh]",
            "flex max-h-[min(38rem,88svh)] flex-col overflow-hidden rounded-xl border border-edge bg-surface shadow-e4",
            "duration-panel data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.985] data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
          // The input is focused by the effect below, so Radix must not put
          // focus on the panel first — that would leave the caret nowhere for
          // a frame and scroll the list to the top.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            // Read before the caret moves: this fires as the focus scope
            // mounts, so the document still has the opener focused.
            const active = document.activeElement;
            opener.current = active instanceof HTMLElement ? active : null;
            inputRef.current?.focus();
          }}
        >
          {/*
            "Search Reverie", not "Search". Radix points the dialog's
            `aria-labelledby` at this, so a title of "Search" would give the
            dialog and its input the same accessible name — two things called
            the same word, one inside the other.
          */}
          <DialogPrimitive.Title className="sr-only">Search Reverie</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search your meetings, transcripts, decisions, people, folders and
            tags, or hand the query to Ask Reverie.
          </DialogPrimitive.Description>

          {/*
            THE QUERY BAR — a row of the panel, not a field on it.
            The old box drew a 56px bordered input with the app's global
            focus ring around it, which is 4px of brand-coloured rectangle
            around the widest element on screen. `focus-within` on the row is
            the same information at the weight it deserves: the hairline under
            the row picks up the accent while the caret is in it.
          */}
          <div className="flex shrink-0 items-center gap-2.5 border-b border-line px-3.5 focus-within:border-brand/50">
            <Search className="h-4 w-4 shrink-0 text-ink-4" aria-hidden />
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setCursor(e.target.selectionStart ?? e.target.value.length);
              }}
              onKeyUp={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
              onClick={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
              onKeyDown={onKeyDown}
              placeholder="Search meetings, transcripts, decisions, folders, tags"
              aria-label="Search"
              role="combobox"
              aria-expanded
              /* Whichever list the arrows are moving in. See the note on the
                 suggestion listbox below. */
              aria-controls={suggestions.length > 0 ? SUGGEST_ID : LIST_ID}
              aria-activedescendant={
                suggestions.length > 0 ? `suggest-${highlighted}` : (active ?? undefined)
              }
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              /*
               * `focus-visible:shadow-none` for the same reason the chat
               * composer carries it: this input is the surface. It is
               * autofocused inside a modal that traps focus and has a visible
               * caret, so the global two-ring indicator has nothing left to
               * tell anybody, and at this width it is the loudest thing in the
               * product. The row's own `focus-within` border is the visible
               * state.
               */
              className="h-[3.25rem] min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-4 focus-visible:shadow-none"
            />
            {text && (
              <button
                type="button"
                onClick={() => {
                  setText("");
                  setCursor(0);
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="shrink-0 rounded-sm p-1 text-ink-4 transition-colors hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {/* Only once there is something to scope. On an empty box it would
                be a control that changes nothing about a list of folders and
                actions. */}
            {term !== "" && (
              <ScopePicker
                value={scope}
                onChange={setScope}
                /*
                 * Back to the box when the menu shuts. Radix returns focus to
                 * the trigger, which is correct for a menu and wrong here: the
                 * caret was in the input a moment ago and the next thing
                 * anybody does is keep typing.
                 *
                 * <p>Measured, twice. Choosing a scope left
                 * `document.activeElement` on the trigger and the arrow keys
                 * stopped moving the selection; a `requestAnimationFrame` after
                 * `onChange` did not fix it, because Radix restores focus later
                 * than that. `onCloseAutoFocus` is its own hook for this and is
                 * the only place that wins.
                 */
                onClosed={() => inputRef.current?.focus()}
              />
            )}
          </div>

          {chips.length > 0 && (
            <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-line px-3.5 py-2">
              {chips.map((chip, i) => (
                <span
                  key={`${chip.label}-${i}`}
                  className="rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-cap text-brand-text"
                >
                  {chip.label}: {chip.value}
                </span>
              ))}
            </div>
          )}

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-1.5">
            {searching ? (
              <div className="space-y-2 p-2" aria-hidden>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : (
              <>
                {/* The explanation, above whatever the zero state can offer. */}
                {empty && (
                  <NothingMatched
                    query={searchState.q}
                    scope={scope}
                    onAsk={() => handOff(searchState.q)}
                    broader={closeSections.length > 0 ? shorter : null}
                  />
                )}

                <ul role="listbox" id={LIST_ID} aria-label="Results" className="space-y-px">
                  {panel.map((section) => (
                    <React.Fragment key={section.key}>
                      <SearchGroupHeading
                        label={section.label}
                        count={section.count}
                        onClear={
                          section.clearable
                            ? () => {
                                clearRecentSearches(userId);
                                setRecent([]);
                                inputRef.current?.focus();
                              }
                            : undefined
                        }
                      />
                      {section.rows.map((row) => (
                        <SearchRowView
                          key={row.key}
                          row={row}
                          query={term === "" ? "" : searchState.q}
                          selected={row.key === active}
                          onHover={() => setActive(row.key)}
                          onActivate={() => activate(row)}
                        />
                      ))}
                    </React.Fragment>
                  ))}
                </ul>
              </>
            )}

            {suggestions.length > 0 && (
              /*
                THE COMBOBOX'S OTHER POPUP.
                <p>Two lists in one panel, and at any moment exactly one of
                them owns the keyboard: while a filter prefix is being typed
                the arrows move through these and Tab completes one, and
                otherwise they move through the results. So both are listboxes
                and the input points `aria-controls` at whichever is live —
                describing one of them and driving both is how a screen reader
                comes to announce the wrong list.
              */
              <ul
                role="listbox"
                id={SUGGEST_ID}
                aria-label="Filter suggestions"
                className="border-t border-line pt-1.5"
              >
                {suggestions.map((s, i) => (
                  <li key={`${s.kind}-${s.insert}`} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === highlighted}
                      id={`suggest-${i}`}
                      tabIndex={-1}
                      onMouseEnter={() => setHighlighted(i)}
                      onClick={() => choose(s)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-callout",
                        i === highlighted ? "bg-surface-raised" : "hover:bg-surface-hover",
                      )}
                    >
                      <span className="font-headline text-ink">{s.label}</span>
                      <span className="truncate text-foot text-ink-4">{s.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/*
            THE FOOTER. Keys on the left, and on the right the one thing the
            panel cannot show: how much of the archive is behind it. Every hint
            here is a key that actually does something in this dialog, and the
            keys are hidden on a phone where a physical keyboard is a guess.
          */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-3.5 py-2">
            <div className="hidden items-center gap-3 text-foot text-ink-4 sm:flex">
              {rows.length > 0 && (
                <>
                  <Hint keys={["↑", "↓"]} label="move" />
                  <Hint keys={["↵"]} label="open" />
                </>
              )}
              {term !== "" && <Hint keys={["⌘", "↵"]} label="ask instead" />}
              <Hint keys={["esc"]} label="close" />
            </div>
            {/*
              The one thing the panel cannot show: how much is behind it. The
              real total from the API when everything is drawn, `N of M` when
              it is not, and the plain truth when nothing matched.
            */}
            <p className="tabular ml-auto font-mono text-foot text-ink-5" aria-live="polite">
              {isFetching && term !== "" ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-label="Searching" />
              ) : empty ? (
                "no exact matches"
              ) : shown < total ? (
                `${shown} of ${total}`
              ) : total > 0 ? (
                `${total} result${total === 1 ? "" : "s"}`
              ) : (
                ""
              )}
            </p>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** One keyboard hint: the keycap, and what it does. */
function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((k) => (
        <kbd
          key={k}
          className="flex h-4 min-w-4 items-center justify-center rounded border border-line px-1 font-sans text-[0.625rem] leading-none text-ink-4"
        >
          {k}
        </kbd>
      ))}
      <span>{label}</span>
    </span>
  );
}

/**
 * The scope control.
 *
 * <p>Four of the seven narrow the *request* — the API takes a `groups`
 * parameter, so choosing Decisions is a cheaper search and not merely a shorter
 * list. Folders and Tags narrow only what is drawn, because neither is a result
 * group on the server. Which is a distinction worth keeping out of the label:
 * from the reader's side both answer "show me only this".
 *
 * <p>A `DropdownMenu`, which is the same primitive the library's filters use, so
 * it arrives keyboard-accessible rather than being made so here. The trigger
 * shrinks to the chevron alone below `sm`: at 390px a 96px control beside a text
 * field leaves the field too narrow to read a query in.
 */
function ScopePicker({
  value,
  onChange,
  onClosed,
}: {
  value: SearchScope;
  onChange: (next: SearchScope) => void;
  /** Where focus belongs once the menu is gone. See the call site. */
  onClosed: () => void;
}) {
  const current = SEARCH_SCOPES.find((s) => s.value === value) ?? SEARCH_SCOPES[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-line px-2 text-foot text-ink-3 transition-colors hover:border-edge hover:text-ink"
        aria-label={`Scope: ${current.label}`}
      >
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown className="h-3 w-3" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClosed();
        }}
      >
        {SEARCH_SCOPES.map((s) => (
          <DropdownMenuItem key={s.value} onSelect={() => onChange(s.value)}>
            <Check
              className={cn(
                "mr-2 h-3.5 w-3.5",
                s.value === value ? "text-brand-text" : "opacity-0",
              )}
              aria-hidden
            />
            {s.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** What each scope actually looks through, in words that read as a sentence. */
const SEARCHED: Record<SearchScope, string> = {
  all: "your meetings, their transcripts, decisions, and the names of people, folders and tags",
  mentions: "the transcripts",
  decisions: "the decisions in your meetings",
  meetings: "your meeting titles and tags",
  people: "the names in your archive",
  folders: "your folder names",
  tags: "your tags",
};

/**
 * Nothing matched, said without exaggerating what was looked at.
 *
 * <h2>The sentence</h2>
 *
 * <p>"Nothing matched" rather than the reference's "Nothing was said about",
 * because this search covers more than speech: a title, a tag and a folder name
 * are all in it, and a query that misses all four has not established that
 * nobody said the words — only that nothing indexed contains them.
 *
 * <p>And no statistics. The reference reads "Reverie searched 68 transcripts,
 * 41 hours of speech, every decision and every promise", and of those four
 * quantities this API returns none: there is no transcript count, no total
 * duration, and no promises. What is stated instead is the list of things the
 * request actually asked for, which the scope control can narrow — so it is
 * read off the scope rather than hard-coded.
 */
function NothingMatched({
  query,
  scope,
  onAsk,
  broader,
}: {
  query: string;
  scope: SearchScope;
  onAsk: () => void;
  broader: string | null;
}) {
  /*
   * What was actually looked through, per scope.
   *
   * <p>A phrase each rather than the scope's own label lowercased, which gave
   * "Reverie looked through people" — read on screen and rewritten. The wording
   * has to stay true to the request: with a scope set, the search really did
   * only ask for that group, and saying otherwise would be the exaggeration
   * this whole state exists to avoid.
   */
  const searched = SEARCHED[scope];

  return (
    <div className="px-3 pb-1 pt-3">
      <p className="text-body font-headline text-ink">Nothing matched “{query}”.</p>
      <p className="mt-1.5 max-w-[54ch] text-callout leading-[1.5] text-ink-3">
        Reverie looked through {searched}. Fewer words usually helps — and{" "}
        <code className="font-mono text-foot text-ink-4">tag:</code>,{" "}
        <code className="font-mono text-foot text-ink-4">type:</code>,{" "}
        <code className="font-mono text-foot text-ink-4">in:</code> and{" "}
        <code className="font-mono text-foot text-ink-4">when:</code> narrow a
        search rather than widen it.
      </p>
      {/*
        The way not to abandon the query. A button rather than a row in the
        listbox below, because the list below belongs to the broader search:
        putting Ask inside it would make `↓` from Ask land on results for a
        different query than the one Ask would send.
      */}
      <button
        type="button"
        onClick={onAsk}
        className="mt-3 flex w-full items-start gap-3 rounded-md px-1.5 py-2 text-left transition-colors hover:bg-surface-hover"
      >
        <ReverieAiMark size={20} className="mt-[0.1rem]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-callout font-headline text-ink">
            Ask Reverie about “{query}”
          </span>
          <span className="mt-0.5 block truncate text-foot text-ink-4">
            Nothing contains those words, but a question about them can still be
            answered
          </span>
        </span>
      </button>
      {broader && (
        <p className="mt-3 border-t border-line pt-2 text-foot text-ink-4">
          Showing results for the broader search “{broader}”.
        </p>
      )}
    </div>
  );
}
