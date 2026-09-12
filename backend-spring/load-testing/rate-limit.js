/**
 * Does the plan hold when it is leaned on?
 *
 * <p>One VU, deliberately. This is not a throughput test: it asks whether the
 * limit exists at all, and a limit is easiest to observe from a single caller
 * going faster than it allows.
 *
 * <p>Expected: exactly 30 successes, then 429s, and no 5xx in between -- a
 * limiter that falls over instead of refusing is worse than no limiter, because
 * the failure is indistinguishable from the service being down.
 *
 * <p><b>Both halves are asserted.</b> Counting only the refusals would pass
 * against a limiter that refused everything, which is the failure mode most
 * likely to go unnoticed.
 *
 * <h2>This needs the AI stub</h2>
 *
 * <p>`/api/v1/streaming/token` mints a credential by calling the AI service, so
 * with no downstream the allowed requests answer 503 and the run cannot tell
 * "allowed" from "allowed and then broken". Start the stub first -- it serves
 * one fixed fake token and calls no provider:
 *
 * <pre>
 *   docker run --rm -p 18000:18000 -v "$PWD/backend-spring/load-testing:/s"  *     python:3.12-alpine python /s/stub-ai-service.py
 * </pre>
 *
 * <p>and point the backend under test at it with
 * `AI_SERVICE_URL=http://host.docker.internal:18000`.
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

/** Exactly the policy, so the assertions below can be exact. */
const BUDGET = 30;

const allowed = new Counter("streaming_token_allowed_200");
const refused = new Counter("rate_limited_429");
const broken = new Counter("streaming_token_unexpected_status");

// Both are correct answers from a working limiter; neither is an HTTP failure.
http.setResponseCallback(http.expectedStatuses(200, 429));

export const options = {
  scenarios: {
    one_caller_going_too_fast: {
      executor: "per-vu-iterations",
      // One account, well past its budget. A limit is easiest to observe from a
      // single caller exceeding it.
      vus: 1,
      iterations: BUDGET * 4,
      maxDuration: "2m",
    },
  },
  thresholds: {
    // Half one: the budget is honoured. Fails against a limiter that refuses
    // everything, which counting refusals alone would not catch.
    streaming_token_allowed_200: [`count==${BUDGET}`],
    // Half two: the budget is enforced.
    rate_limited_429: ["count>0"],
    // And enforcement is refusal, not failure.
    streaming_token_unexpected_status: ["count==0"],
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};

export default function () {
  const res = http.post(`${BASE}/api/v1/streaming/token`, null, {
    headers: authHeaders(),
    tags: { name: "POST /api/v1/streaming/token" },
  });

  if (res.status === 200) allowed.add(1);
  else if (res.status === 429) refused.add(1);
  else broken.add(1);

  check(res, {
    "allowed or refused, never broken": (r) => r.status === 200 || r.status === 429,
  });
}
