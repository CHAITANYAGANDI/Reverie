import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  FREE_TIER_EXHAUSTED,
  accountRefusal,
  forgetAccountRefusal,
  markAccountRefusal,
  refusalFrom,
  subscribeAccountRefusal,
} from "@/lib/account-refused";

/**
 * The one refusal that is permanent, recognised narrowly and published once.
 *
 * <h2>What these pin</h2>
 *
 * <p>An identity that has spent all 100 free minutes and asks for a *new*
 * account is refused at provisioning, before a users row exists, with 403 and
 * `FREE_TIER_EXHAUSTED`. Every query in the session gets that answer, so it is
 * noticed in the base query and rendered by `<AuthGate>` — which replaces the
 * application rather than letting eleven screens draw eleven "couldn't load"
 * states with retry buttons over a condition no retry can change.
 *
 * <p>Two things can go wrong and both are here: recognising too much, which
 * replaces the whole app with a wall over an ordinary forbidden response; and
 * recognising too little, which is the dead end this exists to remove.
 */
describe("the account refusal", () => {
  beforeEach(() => {
    forgetAccountRefusal();
  });

  describe("recognising it", () => {
    const body = (over: Record<string, unknown> = {}) => ({
      status: 403,
      data: { status: 403, error: FREE_TIER_EXHAUSTED, message: "no minutes left", ...over },
    });

    it("reads the server's own sentence out of the body", () => {
      // The server's wording, not a second copy of it here: it is the
      // authority on the number in the sentence.
      expect(refusalFrom(body())).toBe("no minutes left");
    });

    it("ignores a 403 that is not this", () => {
      /*
       * THE ONE THAT MATTERS MOST.
       *
       * <p>403 is also how the API answers a folder somebody does not own.
       * Treating that as "your account cannot exist" would replace the whole
       * application with a permanent wall over a mis-click, and the only way
       * out would be signing out.
       */
      expect(refusalFrom(body({ error: "FORBIDDEN" }))).toBeNull();
      expect(refusalFrom({ status: 403, data: { message: "nope" } })).toBeNull();
      expect(refusalFrom({ status: 403, data: "not an object" })).toBeNull();
      expect(refusalFrom({ status: 403 })).toBeNull();
    });

    it("ignores the code on any other status", () => {
      // Both halves have to agree. A body that says this on a 500 is a server
      // that is confused, and guessing which half to believe is not this
      // function's job.
      expect(refusalFrom({ ...body(), status: 500 })).toBeNull();
      expect(refusalFrom({ ...body(), status: 401 })).toBeNull();
    });

    it("ignores everything that is not an error at all", () => {
      // `error` is `FetchBaseQueryError | SerializedError | undefined` at the
      // point this is asked, and a successful query passes undefined.
      expect(refusalFrom(undefined)).toBeNull();
      expect(refusalFrom(null)).toBeNull();
      expect(refusalFrom("CUSTOM_ERROR")).toBeNull();
      expect(refusalFrom({ status: "CUSTOM_ERROR", error: "auth-unavailable" })).toBeNull();
    });

    it("refuses a message it could not render", () => {
      // What this returns is put on screen. An empty string would be a wall
      // with a heading and no explanation, which is worse than the dead end.
      expect(refusalFrom(body({ message: "" }))).toBeNull();
      expect(refusalFrom(body({ message: "   " }))).toBeNull();
      expect(refusalFrom(body({ message: 42 }))).toBeNull();
      expect(refusalFrom(body({ message: undefined }))).toBeNull();
    });
  });

  describe("publishing it", () => {
    it("tells subscribers once and holds the message", () => {
      const listener = vi.fn();
      subscribeAccountRefusal(listener);

      markAccountRefusal("spent");

      expect(listener).toHaveBeenCalledTimes(1);
      expect(accountRefusal()).toBe("spent");
    });

    it("does not re-notify for the same message", () => {
      /*
       * A page with nine queries in flight discovers this nine times. Nine
       * notifications would be nine renders of one screen, and `useSyncExternal
       * Store` would call `accountRefusal` after each.
       */
      const listener = vi.fn();
      subscribeAccountRefusal(listener);

      markAccountRefusal("spent");
      markAccountRefusal("spent");
      markAccountRefusal("spent");

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("stops notifying once unsubscribed", () => {
      // The `useSyncExternalStore` contract, and a leak if it is wrong: the
      // gate unmounts on the way out of the session.
      const listener = vi.fn();
      const unsubscribe = subscribeAccountRefusal(listener);
      unsubscribe();

      markAccountRefusal("spent");

      expect(listener).not.toHaveBeenCalled();
    });

    it("says nothing before anything has been refused", () => {
      // The state every ordinary session stays in for ever.
      expect(accountRefusal()).toBeNull();
    });
  });
});
