/**
 * The four tabs of Account Settings, and how a URL maps onto one.
 *
 * Pure, and separate from the page, for two reasons. The routing is a
 * catch-all — `/settings`, `/settings/security`, and anything anybody types
 * or a stale bookmark points at — so "which tab is this" is a real decision with
 * a wrong answer (a blank page) that is easy to ship. And two older routes
 * still land here: `/privacy` and `/billing` were pages before they were tabs,
 * and notifications written months ago still link to the first of them.
 *
 * There were six, then two, and there are four. Integrations held a calendar
 * feed that no longer exists. Meetings held sharing defaults, a chat window,
 * and custom vocabulary and known speakers; sharing and both transcription
 * lists are gone, and the chat window is now settable only through the API.
 *
 * <p>Email and Data Retention are back as tabs of their own, having spent a
 * while as two sections at the bottom of General. That was the right move at
 * the time — both endpoints had worked for months with nothing in the interface
 * able to reach them, and getting them on screen mattered more than where —
 * but it left General as five unrelated things: who you are, what language you
 * speak, what is done with a recording, five email switches, two deletion
 * dials, and the button that ends the account. Two of those are subjects, not
 * sections.
 *
 * <p>Close Account stays on General. It is not a retention schedule and it is
 * not a preference: it is the way out of the account, and the account is what
 * General is about.
 *
 * <p>None of the removed URLs is special-cased on the way out. They fall to
 * General like any other unrecognised settings path, which is the behaviour a
 * stale bookmark wants: a settings URL somebody saved should show them
 * settings, not a blank pane that reads as a page which failed to load.
 */

export type SettingsTab = "general" | "email" | "data" | "plans";

export interface TabSpec {
  id: SettingsTab;
  label: string;
}

/**
 * In the order they are shown.
 *
 * <p>General first because it is where somebody lands. Then the two that send
 * or delete things — Email before Data Retention, because one of the email
 * switches is the week's notice that retention is about to take something, so
 * reading them the other way round explains the notice before the thing it is
 * about. Plans last: it is the only tab that answers a question about money
 * rather than about the account's own behaviour.
 *
 * <p>`data` rather than `retention` in the URL. The tab is about how long
 * things are kept AND therefore when they go, and `/settings/data` is what
 * somebody types.
 */
export const SETTINGS_TABS: TabSpec[] = [
  { id: "general", label: "General" },
  { id: "email", label: "Email" },
  { id: "data", label: "Data Retention" },
  { id: "plans", label: "Plans" },
];

export const DEFAULT_TAB: SettingsTab = "general";

/**
 * Where the pages that used to exist now live.
 *
 * Kept rather than redirected away and forgotten: `RETENTION_APPLIED`
 * notifications written before this restructuring carry `/privacy` in their
 * link column, and those rows are a record of something that happened. The link
 * has to keep working for as long as they do.
 */
export const LEGACY_PATHS: Record<string, SettingsTab> = {
  /*
   * `/privacy` lands on Data Retention.
   *
   * <p>It went to General for a while, because that is where the retention
   * dials had been moved to and General was the only place left. Now that the
   * dials have a tab again this can point at the thing it was always about: a
   * `RETENTION_APPLIED` notification's link column says `/privacy`, and what
   * somebody following it wants to see is the schedule that took their
   * recording — not a page about their display name.
   */
  "/privacy": "data",
  "/billing": "plans",
};

/**
 * Read a pathname as a tab.
 *
 * Anything unrecognised falls to General rather than rendering nothing. A
 * settings URL somebody mistyped should show them settings, not a blank pane
 * that looks like the page failed to load.
 */
export function tabFromPath(pathname: string): SettingsTab {
  const legacy = LEGACY_PATHS[stripTrailingSlash(pathname)];
  if (legacy) return legacy;

  const segments = stripTrailingSlash(pathname).split("/").filter(Boolean);
  const last = segments[segments.length - 1]?.toLowerCase();
  const match = SETTINGS_TABS.find((t) => t.id === last);
  return match ? match.id : DEFAULT_TAB;
}

/** The canonical URL for a tab, which is what the tab bar navigates to. */
export function pathForTab(tab: SettingsTab): string {
  return `/settings/${tab}`;
}

/**
 * Whether this URL is the account settings page, under any of its names.
 *
 * <p>Exists so the shell can drop the search bar here. Searching is for finding
 * a meeting; nothing on these pages is a meeting, so the widest control in the
 * header is one that cannot help.
 *
 * <p>The legacy URLs count, and that is the whole reason this is a function
 * rather than a `startsWith` at the call site. `/billing` and `/privacy` render
 * the same component as `/settings/plans` and `/settings/general`, so treating
 * them differently would show the bar or hide it depending on which link
 * somebody happened to follow.
 *
 * <p>`hasOwnProperty` rather than `in`: a pathname of `/toString` is reachable
 * by typing it, and `in` would say yes.
 */
export function isSettingsPath(pathname: string): boolean {
  const path = stripTrailingSlash(pathname);
  return (
    path === "/settings" ||
    path.startsWith("/settings/") ||
    Object.prototype.hasOwnProperty.call(LEGACY_PATHS, path)
  );
}

function stripTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}
