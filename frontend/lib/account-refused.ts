/**
 * The one refusal there is no way round, published where the gate can see it.
 *
 * <h2>What this is for</h2>
 *
 * <p>The free allowance belongs to the person rather than to the account, so an
 * identity that has spent all 100 minutes and asks for a *new* account is
 * refused at provisioning — before a users row exists. The API answers 403 with
 * `FREE_TIER_EXHAUSTED` (see `FreeTierService.refuseIfExhaustedIdentity`).
 *
 * <p>Which is a fact about the whole session, not about the request that
 * happened to discover it. Every query would get the same answer, so rendering
 * it per screen would mean the same sentence in eleven places, or worse: the
 * app's ordinary "couldn't load" states, retry buttons and all, over a
 * condition no retry can change.
 *
 * <h2>Why a store and not the Redux one</h2>
 *
 * <p>Because the reader is `<AuthGate>`, which decides whether the application
 * is mounted at all, and it already reads its other three states this way —
 * `useSyncExternalStore` over a module store. The RTK Query cache is inside
 * what the gate is gating, and a provider cannot depend on something it renders.
 *
 * <p>One-way, deliberately: nothing here clears the refusal except
 * {@link forgetAccountRefusal}, which exists for tests. A signed-in session that
 * has been refused cannot talk itself out of it — the only ways out are signing
 * out and using an address that has an allowance, both of which are new
 * documents and a fresh module.
 */

/** The API's error code, matched exactly. */
export const FREE_TIER_EXHAUSTED = "FREE_TIER_EXHAUSTED";

let refusal: string | null = null;
const listeners = new Set<() => void>();

/** @returns an unsubscribe, per the `useSyncExternalStore` contract. */
export function subscribeAccountRefusal(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The sentence to show, or null while nothing has been refused. */
export function accountRefusal(): string | null {
  return refusal;
}

/**
 * Record the refusal, once.
 *
 * <p>Idempotent on the message: a page with nine queries in flight discovers
 * this nine times, and nine identical notifications would be nine renders of
 * the same screen.
 */
export function markAccountRefusal(message: string): void {
  if (refusal === message) return;
  refusal = message;
  listeners.forEach((listener) => listener());
}

/** Test seam. Nothing in the application calls this. */
export function forgetAccountRefusal(): void {
  refusal = null;
  listeners.forEach((listener) => listener());
}

/**
 * The refusal's message if this error is one, or null for every other error.
 *
 * <p>Narrow on purpose, and it checks the code rather than the status: 403 is
 * also how a folder somebody does not own answers, and treating that as "your
 * account cannot exist" would replace the application with a wall over a
 * mis-click. Both halves have to match, and the message has to be a non-empty
 * string, because what this returns is rendered.
 *
 * <p>Accepts `unknown` because that is what an RTK Query error is at the point
 * this is asked — `FetchBaseQueryError | SerializedError | undefined`, with the
 * body typed `unknown` inside it. Every field is checked rather than asserted.
 */
export function refusalFrom(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const { status, data } = error as { status?: unknown; data?: unknown };
  if (status !== 403) return null;
  if (!data || typeof data !== "object") return null;
  const body = data as { error?: unknown; message?: unknown };
  if (body.error !== FREE_TIER_EXHAUSTED) return null;
  return typeof body.message === "string" && body.message.trim() ? body.message : null;
}
