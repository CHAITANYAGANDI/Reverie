/**
 * Capacity benchmark for the meetings list. Deliberately NOT a gate.
 *
 * <p>This is where the instance is pushed past what it can hold, on purpose, so
 * the shape of the failure is known before a real Monday morning finds it.
 * `list-meetings.js` is the promise; this is the ceiling.
 *
 * <h2>Why it has no latency threshold</h2>
 *
 * <p>Because it would always fail, and a check that is expected to fail teaches
 * people to ignore checks. At 100 VUs with 1 s think time the offered load is
 * ~80-100 req/s against a measured ceiling of ~98 req/s on 0.5 CPU: the service
 * runs at 80-100 % utilisation, which is the queueing region. Latency there is
 * a property of the arithmetic, not of the code.
 *
 * <p>What it *does* assert is that saturation stays graceful. Under this load
 * the service must still answer every request correctly -- no 5xx, no dropped
 * connections, no corrupt pages. Slower is acceptable; wrong is not.
 *
 * <h2>Reading a run</h2>
 *
 * <p>Record throughput, the latency spread, and the container's own counters
 * beside them, because the numbers only mean something together:
 *
 * <pre>
 *   docker exec &lt;container&gt; cat /sys/fs/cgroup/cpu.stat
 *   docker exec &lt;container&gt; cat /sys/fs/cgroup/memory.events
 * </pre>
 *
 * <p>Measured warm at 100 VUs on 512 MB / 0.5 CPU with 200 meetings per
 * account: 80.01 req/s, median 188 ms, p95 713 ms, p99 1.13 s, 0 errors,
 * 87.7 % of scheduling periods throttled, `memory.events max` delta 0, OOM 0.
 *
 * <p>The comparison points from the same ladder: 25 VUs 23.79 req/s p95 141 ms,
 * 50 VUs 46.49 req/s p95 176 ms.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { BASE, authHeaders } from "./config.js";

export const options = {
  stages: [
    { duration: "20s", target: 100 },
    { duration: "1m", target: 100 },
    { duration: "10s", target: 0 },
  ],
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max", "min"],
  thresholds: {
    // Correctness only. Latency is the measurement, not the requirement.
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
    "200 under saturation": (r) => r.status === 200,
    "page is still well formed": (r) => {
      try {
        return Array.isArray(r.json("content"));
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
