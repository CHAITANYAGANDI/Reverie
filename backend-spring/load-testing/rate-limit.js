/**
 * Does the plan hold when it is leaned on?
 *
 * <p>One VU, deliberately. This is not a throughput test: it asks whether the
 * limit exists at all, and a limit is easiest to observe from a single caller
 * going faster than it allows. The streaming-token endpoint is the only one
 * behind `RateLimitService` today, which is itself the finding this script
 * makes visible.
 *
 * <p>Expected: 200s, then 429s, and no 5xx in between -- a limiter that falls
 * over instead of refusing is worse than no limiter, because the failure is
 * indistinguishable from the service being down.
 */

import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import { BASE, authHeaders } from "./config.js";

const refused = new Counter("rate_limited_429");

export const options = {
  vus: 1,
  duration: "30s",
  thresholds: {
    // The assertion. If this never fires, the endpoint is not limited and the
    // run should fail rather than report a cheerful zero-error summary.
    rate_limited_429: ["count>0"],
  },
};

export default function () {
  const res = http.post(`${BASE}/api/v1/streaming/token`, null, {
    headers: authHeaders(),
    tags: { name: "POST /api/v1/streaming/token" },
  });

  if (res.status === 429) refused.add(1);

  check(res, {
    "allowed or refused, never broken": (r) => r.status === 200 || r.status === 429,
  });
}
