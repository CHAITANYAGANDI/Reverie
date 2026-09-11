/**
 * Read throughput: the request every signed-in user makes first.
 *
 * <p>Home lists meetings, so this is the query that decides whether the app
 * feels alive on a cold morning when everybody opens it at once. It is also the
 * cheapest thing to get wrong: it is paginated, filtered by user, and joins
 * nothing, so a p95 that drifts here is almost always an index or a pool.
 *
 * <p>Pass criteria from docs/load-testing-report.md: p95 < 300ms, no errors.
 * Encoded as thresholds rather than left to a human reading the summary --
 * a threshold makes k6 exit non-zero, which is what lets this run in a pipeline.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { BASE, authHeaders } from "./config.js";

export const options = {
  stages: [
    // Ramped rather than flat. A hundred VUs starting at once measures the
    // connection pool filling, which is a real event but not this one.
    { duration: "30s", target: 100 },
    { duration: "1m", target: 100 },
    { duration: "15s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<300"],
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};

export default function () {
  const res = http.get(`${BASE}/api/v1/meetings?page=0&size=20`, {
    headers: authHeaders(),
    tags: { name: "GET /api/v1/meetings" },
  });

  check(res, {
    "200": (r) => r.status === 200,
    "returns a page": (r) => {
      try {
        return Array.isArray(r.json("content"));
      } catch {
        return false;
      }
    },
  });

  // Think time. Without it this measures how fast k6 can generate load, and
  // every VU behaves like a script rather than like somebody reading a list.
  sleep(1);
}
