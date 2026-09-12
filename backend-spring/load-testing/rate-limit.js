/**
 * Does the plan hold when it is leaned on?
 *
 * <p>One VU, deliberately. This is not a throughput test: it asks whether the
 * limit exists at all, and a limit is easiest to observe from a single caller
 * going faster than it allows.
 *
 * <p>Expected: 200s, then 429s, and no 5xx in between -- a limiter that falls
 * over instead of refusing is worse than no limiter, because the failure is
 * indistinguishable from the service being down.
 *
 * <h2>What is behind the limiter now</h2>
 *
 * <p>This script used to say streaming-token was the only limited endpoint.
 * That has not been true since the burst-protection work; the current policy,
 * all keyed per account, is:
 *
 * <ul>
 *   <li><b>ai-chat</b> — 20 / 1 min, shared by meeting, project and workspace
 *       chat so rotating scope cannot multiply provider throughput;</li>
 *   <li><b>meeting-resummarize</b> — 5 / 10 min;</li>
 *   <li><b>meeting-reprocess</b> — 3 / 30 min, shared by `/reprocess` and
 *       `/language` because both launch the same billable pipeline;</li>
 *   <li><b>meeting-upload-url</b> — 20 / 10 min (see upload-url.js);</li>
 *   <li><b>meeting-translation</b> — 5 / 10 min, and only on the model-backed
 *       path: a cached translation is served without touching the limiter;</li>
 *   <li><b>streaming-token</b> — 30 / 10 min, which is what this script drives
 *       because it is the cheapest one to exercise without spending anything.</li>
 * </ul>
 *
 * <p>The limiter is process-local by design while Reverie runs one Spring
 * instance. That is a documented constraint, not a defect for this script to
 * work around: before a second instance, the state has to become shared.
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
