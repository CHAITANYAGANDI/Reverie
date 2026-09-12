/**
 * Shared setup for every script here.
 *
 * <h2>Dev auth, and why that is not a shortcut</h2>
 *
 * These run against `REVERIE_AUTH_MODE=dev`, where the backend trusts an
 * `X-Dev-User` header. That is the only honest way to load-test this: a real
 * Clerk session cannot be minted a hundred times a second without load-testing
 * Clerk, and the thing under test is Reverie's own throughput, not an identity
 * provider's.
 *
 * It also means these scripts are harmless by construction — dev mode is
 * refused in production by `DeploymentCheck`, so pointing one of them at a real
 * deployment fails at the first request rather than doing anything.
 *
 * <h2>What must never be loaded</h2>
 *
 * Nothing here uploads audio, confirms a meeting, or asks a question of a real
 * model. Those are the paths that spend AssemblyAI minutes, OpenAI tokens, R2
 * storage and — the one that cannot be refunded — a lifetime free-tier
 * allowance, which by design survives deleting the account. A load test that
 * burns a real user's free tier is a load test that has damaged the product it
 * was measuring.
 */

export const BASE = __ENV.BASE_URL || "http://localhost:8080";

/** How many distinct load-test identities to spread across. */
const USERS = Number(__ENV.VUS_USERS || 25);

/**
 * Where this script's identity range starts.
 *
 * The burst limiters are per-account and hold state for a whole window, so a
 * script that deliberately exhausts a budget leaves those accounts spent for up
 * to ten minutes. Running an enforcement test and then a latency test against
 * the same accounts would measure the leftovers of the first rather than the
 * second.
 *
 * A disjoint range keeps them independent without restarting the backend to
 * clear an in-memory limiter: the enforcement scripts pass an offset, the
 * normal-path scripts keep the default.
 */
const USER_OFFSET = Number(__ENV.USER_OFFSET || 0);

/**
 * A stable per-VU identity.
 *
 * Distinct users rather than one, because one user means one row in every
 * `WHERE user_id = ?` and a page cache that is warm after the first request —
 * which measures the cache, not the query. Deterministic rather than random, so
 * a second run reuses the same rows instead of growing the database each time.
 */
export function devUser() {
  return `usr_load_${USER_OFFSET + (__VU % USERS)}`;
}

export function authHeaders() {
  return {
    "X-Dev-User": devUser(),
    // Provisioning reads this; without it the first request per identity
    // creates a user with no email, which is a different code path from the
    // one real traffic takes.
    "X-Dev-Email": `${devUser()}@load.invalid`,
    "Content-Type": "application/json",
  };
}

/** Fails the run rather than reporting a fast 401 as good throughput. */
export function expectOk(response, name) {
  const ok = response.status >= 200 && response.status < 300;
  if (!ok) {
    console.error(`${name}: HTTP ${response.status}`);
  }
  return ok;
}
