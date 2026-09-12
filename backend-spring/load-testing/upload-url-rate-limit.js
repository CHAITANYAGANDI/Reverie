/**
 * Does the upload-URL budget hold when it is deliberately exceeded?
 *
 * <p>Separated from `upload-url.js` because the two ask different questions and
 * answering both in one run answers neither well: thousands of intentional 429s
 * flatten the latency figure, and a latency threshold makes a correct refusal
 * look like a fault.
 *
 * <p>Policy under test: **20 requests / 10 minutes, per account**, applied in
 * the controller before `createUploadUrl` does any work.
 *
 * <h2>Running it costs the identities it uses</h2>
 *
 * <p>It exhausts every account it touches for the rest of the window, which is
 * why it takes a disjoint identity range (`USER_OFFSET`). Pointing it at the
 * default range would leave `upload-url.js` measuring leftovers.
 *
 * <p>Nothing is uploaded, nothing is confirmed, nothing is transcribed, and no
 * provider is called -- a refused presign is the cheapest request in the
 * product, which is what makes this safe to run flat out.
 */

import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import { BASE, authHeaders } from "./config.js";

/** Exactly the policy, so the assertion below can be exact. */
const BUDGET_PER_USER = 20;
const IDENTITIES = 10;

const allowed = new Counter("upload_url_allowed_200");
const refused = new Counter("upload_url_rate_limited_429");
const broken = new Counter("upload_url_unexpected_status");

// Both are correct answers; neither is an HTTP failure.
http.setResponseCallback(http.expectedStatuses(200, 429));

export const options = {
  scenarios: {
    exhaust_the_budget: {
      executor: "per-vu-iterations",
      vus: IDENTITIES,
      // Three times the budget, so the refusals are unmistakable.
      iterations: BUDGET_PER_USER * 3,
      maxDuration: "2m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    // The limiter must engage. Without this a run against an unlimited
    // endpoint reports a cheerful, meaningless success.
    upload_url_rate_limited_429: ["count>0"],
    // And it must engage by refusing, never by failing.
    upload_url_unexpected_status: ["count==0"],
    // Exactly the budget gets through, per identity. This is the assertion
    // that distinguishes "a limiter" from "the right limiter" -- a policy
    // change, a per-meeting key or a per-endpoint bucket all move this number.
    upload_url_allowed_200: [`count==${BUDGET_PER_USER * IDENTITIES}`],
  },
};

export default function () {
  const res = http.post(
    `${BASE}/api/v1/meetings/upload-url`,
    JSON.stringify({
      filename: `burst-${__VU}-${__ITER}.mp3`,
      contentType: "audio/mpeg",
      sizeBytes: 4 * 1024 * 1024,
    }),
    { headers: authHeaders(), tags: { name: "POST /api/v1/meetings/upload-url" } },
  );

  if (res.status === 200) allowed.add(1);
  else if (res.status === 429) refused.add(1);
  else broken.add(1);

  check(res, {
    "allowed or refused, never broken": (r) => r.status === 200 || r.status === 429,
  });
  // No think time: the point is to arrive faster than the budget allows.
}
