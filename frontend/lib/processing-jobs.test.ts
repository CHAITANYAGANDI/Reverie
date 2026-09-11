import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  trackProcessing,
  untrackProcessing,
  processingJobs,
  resetProcessingJobs,
  useProcessingJobs,
} from "@/lib/processing-jobs";

/**
 * What this tab is watching.
 *
 * <p>The store holds ids, never statuses. That is the property most worth
 * pinning: an id in here means "watch this", and whether the meeting is
 * actually unfinished is decided by the server on every poll. A store that
 * cached the status would be a second source of truth for the one thing this
 * whole change is about — a meeting that finished while nobody was looking.
 */
describe("processing jobs", () => {
  beforeEach(() => {
    resetProcessingJobs();
    window.sessionStorage.clear();
  });

  it("remembers a meeting it was asked to watch", () => {
    trackProcessing("mtg_1");

    expect(processingJobs()).toEqual(["mtg_1"]);
  });

  it("counts the same meeting once", () => {
    // The meeting page tracks on every render where the meeting is unfinished,
    // and the save path tracks it too. Both firing must be one job, not two
    // cards stacked in the corner polling the same id.
    trackProcessing("mtg_1");
    trackProcessing("mtg_1");

    expect(processingJobs()).toEqual(["mtg_1"]);
  });

  it("watches several at once", () => {
    // Importing three files in a row is one press each and three jobs.
    trackProcessing("mtg_1");
    trackProcessing("mtg_2");

    expect(processingJobs()).toEqual(["mtg_1", "mtg_2"]);
  });

  it("forgets one without disturbing the others", () => {
    trackProcessing("mtg_1");
    trackProcessing("mtg_2");

    untrackProcessing("mtg_1");

    expect(processingJobs()).toEqual(["mtg_2"]);
  });

  it("ignores an untrack for something it never had", () => {
    trackProcessing("mtg_1");

    untrackProcessing("mtg_nope");

    expect(processingJobs()).toEqual(["mtg_1"]);
  });

  it("ignores a blank id", () => {
    // A create that failed halfway leaves an empty string in some paths, and a
    // job with no meeting is a card that links to /meetings/ and polls nothing.
    trackProcessing("");

    expect(processingJobs()).toEqual([]);
  });

  it("writes what it is watching through to the tab's storage, named", () => {
    trackProcessing("mtg_1");

    // The owner rides along with the ids. Null here because nobody has claimed
    // them, and null is a name no session answers to.
    expect(JSON.parse(window.sessionStorage.getItem(KEY) ?? "null")).toEqual({
      owner: null,
      ids: ["mtg_1"],
    });
  });

  it("survives a reload of the tab for the session that wrote it", async () => {
    window.sessionStorage.setItem(KEY, stored("sess_a", ["mtg_1"]));
    // What a reload actually is: the module is evaluated afresh with an empty
    // list, and the stored copy is all that is left. Simulated by re-importing
    // rather than by poking `loaded`, so the real read-back is under test.
    vi.resetModules();
    const fresh = await import("@/lib/processing-jobs");

    fresh.claimProcessingOwner("sess_a");
    const { result } = renderHook(() => fresh.useProcessingJobs());

    expect(result.current).toEqual(["mtg_1"]);
  });

  it("starts from nothing when the stored value is nonsense", async () => {
    // A corrupt entry must not be a crash on a cold start: watching nothing is
    // exactly what happened before this file existed.
    window.sessionStorage.setItem(KEY, "{not json");
    vi.resetModules();
    const fresh = await import("@/lib/processing-jobs");

    fresh.claimProcessingOwner("sess_a");
    const { result } = renderHook(() => fresh.useProcessingJobs());

    expect(result.current).toEqual([]);
  });

  it("ignores stored entries that are not ids", async () => {
    window.sessionStorage.setItem(KEY, stored("sess_a", ["mtg_1", null, 7, ""]));
    vi.resetModules();
    const fresh = await import("@/lib/processing-jobs");

    fresh.claimProcessingOwner("sess_a");
    const { result } = renderHook(() => fresh.useProcessingJobs());

    expect(result.current).toEqual(["mtg_1"]);
  });

  it("re-renders whatever is reading it", () => {
    const { result } = renderHook(() => useProcessingJobs());
    expect(result.current).toEqual([]);

    act(() => trackProcessing("mtg_1"));

    expect(result.current).toEqual(["mtg_1"]);
  });

  it("hands out a stable snapshot between changes", () => {
    // Not a micro-optimisation. `useSyncExternalStore` compares snapshots with
    // Object.is, so a fresh array from getSnapshot every render is an infinite
    // render loop rather than a wasted render.
    const { result, rerender } = renderHook(() => useProcessingJobs());
    act(() => trackProcessing("mtg_1"));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});

const KEY = "reverie:processing";

function stored(owner: string | null, ids: unknown[]): string {
  return JSON.stringify({ owner, ids });
}

/**
 * Whose jobs these are.
 *
 * <p>`sessionStorage` is scoped to the tab, and a tab outlives a sign-in. Every
 * other client store in the app dies with the document that a sign-out
 * navigates away from; this one was built to survive exactly that, which is
 * what made it the one place a previous account's state could walk into the
 * next account's session.
 *
 * <p>Nothing here is about content. The server refuses another user's meeting,
 * so no transcript ever crossed. What crossed was the claim that a job is
 * running and a five-second poll with nothing that would ever end it.
 */
describe("processing jobs, across a change of session", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.resetModules();
  });

  it("never hands one session's jobs to another", async () => {
    // The whole point of the file. A signs out, B signs in on the same tab,
    // and the document reload in between is what clears every other store --
    // and is exactly what this one is designed to survive.
    window.sessionStorage.setItem(KEY, stored("sess_a", ["mtg_a"]));
    const fresh = await import("@/lib/processing-jobs");

    fresh.claimProcessingOwner("sess_b");

    expect(fresh.processingJobs()).toEqual([]);
  });

  it("does not leave the other session's ids in storage to be found later", async () => {
    window.sessionStorage.setItem(KEY, stored("sess_a", ["mtg_a"]));
    const fresh = await import("@/lib/processing-jobs");

    fresh.claimProcessingOwner("sess_b");

    // Refusing to read them is not enough on its own: left in place, they are
    // one mis-signed claim away from being adopted.
    expect(JSON.parse(window.sessionStorage.getItem(KEY) ?? "null")).toEqual({
      owner: "sess_b",
      ids: [],
    });
  });

  it("refuses what an older version wrote, because it names nobody", async () => {
    // The previous format was a bare array. There is no way to tell whose it
    // was, so it is dropped rather than migrated -- "assume it belongs to
    // whoever is here now" is precisely the bug.
    window.sessionStorage.setItem(KEY, JSON.stringify(["mtg_a"]));
    const fresh = await import("@/lib/processing-jobs");

    fresh.claimProcessingOwner("sess_a");

    expect(fresh.processingJobs()).toEqual([]);
  });

  it("keeps live jobs when the same session claims again", async () => {
    // Re-renders and token refreshes claim repeatedly. Treating a repeat as a
    // change would drop the job the user is actually waiting on.
    const fresh = await import("@/lib/processing-jobs");
    fresh.claimProcessingOwner("sess_a");
    fresh.trackProcessing("mtg_1");

    fresh.claimProcessingOwner("sess_a");

    expect(fresh.processingJobs()).toEqual(["mtg_1"]);
  });

  it("restores nothing until somebody has claimed it", async () => {
    // A component subscribing before the session boundary runs must not be a
    // way in. Unclaimed means unreadable, not "readable by default".
    window.sessionStorage.setItem(KEY, stored("sess_a", ["mtg_a"]));
    const fresh = await import("@/lib/processing-jobs");

    const { result } = renderHook(() => fresh.useProcessingJobs());

    expect(result.current).toEqual([]);
  });
});
