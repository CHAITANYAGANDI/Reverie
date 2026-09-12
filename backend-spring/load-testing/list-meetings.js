/**
 * Launch acceptance for the read every session makes first.
 *
 * <p>Home lists meetings, so this is the query that decides whether the app
 * feels alive on a cold morning when everybody opens it at once. It is also the
 * cheapest thing to get wrong: paginated, filtered by account, joining nothing.
 *
 * <h2>Why this gates at 50 VUs and not 100</h2>
 *
 * <p>It used to assert `p95 < 300 ms at 100 VUs`. That target was written
 * before anything had been measured against the instance it runs on, and it
 * describes roughly twice the CPU Reverie buys.
 *
 * <p>The investigation is in docs/load-testing-report.md. In short: the backend
 * is not the constraint. With 200 meetings per account the page query plans at
 * 0.103 ms on an index scan backward, the count at 0.255 ms, and every
 * statement issued during a request runs in 0.02-0.12 ms. Nothing is missing an
 * index. What saturates is the 0.5 CPU quota -- throttled scheduling periods
 * climb from 22 % at 25 VUs to 88 % at 100 VUs, and throughput plateaus exactly
 * as it does. Marginal cost is ~5.1 ms of CPU per request, so the ceiling is
 * ~98 req/s and 100 VUs offers ~80-100 req/s against it. That is the queueing
 * region; no code change moves it, only more CPU.
 *
 * <p>So the gate describes what the deployment can actually hold, with
 * headroom, and the 100-VU number is kept as a non-gating benchmark in
 * `list-meetings-stress.js` rather than deleted. Both facts stay visible: what
 * is promised, and where it breaks.
 *
 * <p>Measured warm at 50 VUs: p95 175.90 ms, 46.49 req/s, 0 errors.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { BASE, authHeaders } from "./config.js";

export const options = {
  stages: [
    // Ramped rather than flat. Fifty VUs starting at once measures the
    // connection pool filling, which is a real event but not this one.
    { duration: "20s", target: 50 },
    { duration: "1m", target: 50 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<200"],
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
