import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { api } from "@/lib/api";
import { authStore } from "@/lib/auth-store";

/**
 * What actually goes on the wire when the app asks for action items.
 *
 * <h2>Why this file exists</h2>
 *
 * <p>Ticking an item off in Home's margin struck it through and then lost it.
 * It did not move to Completed, which is the view built to receive it; it did
 * not come back on a reload; the Completed count never left zero. Nothing was
 * wrong with the write — the item really was `DONE` on the server — and nothing
 * was wrong with the component, which splits two arrays into two views and is
 * covered doing exactly that.
 *
 * <p>It was the read, and the read was a query string. The margin asked with
 * `status: undefined`, meaning "give me both views", and `undefined` is an
 * <em>omitted</em> parameter — which `GET /api/v1/action-items` declares as
 * `@RequestParam(defaultValue = "OPEN_ANY")`. So the request arrived asking for
 * everything <b>unfinished</b>, the opposite of everything, and a finished item
 * was never in the answer to be filed.
 *
 * <p>Which was invisible to the whole suite, because every component test mocks
 * `@/lib/api` — a filter meaning the opposite of what the call site intended
 * passes all of them. This builds the real store, keeps the real
 * `fetchBaseQuery`, and reads the URL off a stubbed `fetch`, which is the
 * approach of lib/export-requests.test and is here for the same reason.
 *
 * <h2>The trap, recorded so nobody walks into it twice</h2>
 *
 * <p>The obvious fix is one request asking for no status at all, and there is
 * no way to send one. `status=` does not work: Spring substitutes
 * `defaultValue` for an <em>empty</em> parameter as well as for a missing one,
 * so a blank status arrives as `OPEN_ANY` too. That was checked against the
 * running server before the two-request version was written — see
 * `useActionItems`.
 */

let seen: string[] = [];

/** An empty page, and a real one: `providesTags` reads `content` off it. */
const EMPTY_PAGE = { content: [], page: 0, size: 50, totalElements: 0, totalPages: 0 };

function stubFetch() {
  const stub = vi.fn(async (input: unknown) => {
    seen.push(typeof input === "string" ? input : (input as Request).url);
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json", forEach: () => {} },
      // Both, because `fetchBaseQuery`'s json handler reads the body as text
      // and parses it itself. A stub that only answers `json()` hands the
      // endpoint `{}` and its `providesTags` maps over an absent `content`.
      json: async () => EMPTY_PAGE,
      text: async () => JSON.stringify(EMPTY_PAGE),
      clone() {
        return this;
      },
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", stub);
  return stub;
}

/** A store with only the API slice in it, which is all a query needs. */
function store() {
  return configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (getDefault) => getDefault().concat(api.middleware),
  });
}

/** The query string of the one request that went out. */
function query(): URLSearchParams {
  expect(seen).toHaveLength(1);
  return new URL(seen[0]).searchParams;
}

const previous = { mode: authStore.mode, devUserId: authStore.devUserId };

beforeEach(() => {
  seen = [];
  stubFetch();
  authStore.mode = "dev";
  authStore.devUserId = "usr_probe";
});

afterEach(() => {
  vi.unstubAllGlobals();
  authStore.mode = previous.mode;
  authStore.devUserId = previous.devUserId;
});

describe("the status filter on GET /action-items", () => {
  it("sends DONE, which is the only way to be given the finished ones", async () => {
    // Home's Completed view. Before the fix nothing in the app ever sent this,
    // which is why that view was empty on every account.
    await store().dispatch(
      api.endpoints.getActionItems.initiate({ status: "DONE", standalone: true, size: 100 }),
    );

    const q = query();
    expect(q.get("status")).toBe("DONE");
    expect(q.get("standalone")).toBe("true");
  });

  it("sends OPEN_ANY, so IN_PROGRESS counts as open", async () => {
    // OPEN and IN_PROGRESS are both outstanding, and the margin's Open view
    // has to hold both -- `status=OPEN` would hide half of somebody's list.
    await store().dispatch(
      api.endpoints.getActionItems.initiate({ status: "OPEN_ANY", standalone: true, size: 100 }),
    );

    expect(query().get("status")).toBe("OPEN_ANY");
  });

  it("asks the two halves as two different requests", async () => {
    /*
     * Different query strings, which is what makes them two. RTK Query keys a
     * cache entry by the serialised argument, so two calls that came out with
     * the same URL would be one request answering both views -- and the second
     * view would show the first view's rows.
     */
    const s = store();
    await Promise.all([
      s.dispatch(api.endpoints.getActionItems.initiate({ status: "OPEN_ANY", standalone: true })),
      s.dispatch(api.endpoints.getActionItems.initiate({ status: "DONE", standalone: true })),
    ]);

    expect(seen).toHaveLength(2);
    expect(new Set(seen).size).toBe(2);
  });

  it("omits the parameter when no status is given, which is not the same as ANY", async () => {
    /*
     * Left as it was, and asserted so the shape of the bug stays on record: an
     * omitted `status` is `OPEN_ANY` at the server, so this is a request for
     * the unfinished ones however it reads here. Sending `status=` instead
     * would change nothing — Spring applies `defaultValue` to an empty
     * parameter as well — and sending a word like `ALL` is a 400, because
     * `ActionItemQuery` validates against its four values.
     */
    await store().dispatch(api.endpoints.getActionItems.initiate({ standalone: true }));

    expect(query().has("status")).toBe(false);
  });
});
