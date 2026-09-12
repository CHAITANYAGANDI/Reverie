/**
 * The normal upload-URL path: signing works, oversize is refused, nothing is
 * slow. Deliberately stays inside the burst budget.
 *
 * <p>`POST /api/v1/meetings/upload-url` is the heaviest ordinary write: it
 * inserts a pending meeting and signs a URL. It stops there on purpose --
 * nothing here uploads bytes or confirms the meeting, because confirming is
 * what charges the allowance and queues transcription. See config.js.
 *
 * <h2>Why the load is shaped by the limiter</h2>
 *
 * <p>The endpoint allows 20 requests per 10 minutes per account. An earlier
 * version of this script ran 50 VUs for 90 s across 25 identities -- about 180
 * requests each -- so all but the first twenty came back 429 and the run
 * reported a *working* limiter as a broken endpoint.
 *
 * <p>Mixing thousands of cheap 429s into the latency figure is the other half
 * of that mistake: the p95 stops describing the work the endpoint actually
 * does. So this script issues exactly 15 requests per identity, inside the
 * budget, and every response here is a real signing or a real validation
 * refusal. Enforcement is `upload-url-rate-limit.js`, which uses a disjoint
 * identity range so the two cannot interfere.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";
import { BASE, authHeaders } from "./config.js";

/** Must match `app.upload.max-bytes`; this one is deliberately over it. */
const OVERSIZE = 600 * 1024 * 1024;

const signed = new Counter("upload_url_signed_200");
const oversizeRefused = new Counter("upload_url_oversize_refused_400");
const unexpectedlyLimited = new Counter("upload_url_unexpected_429");

// 200 and 400 are both correct answers here. A 429 is not -- this script is
// supposed to stay inside the budget, so one means the shape is wrong.
http.setResponseCallback(http.expectedStatuses(200, 400));

export const options = {
  scenarios: {
    within_budget: {
      executor: "per-vu-iterations",
      // One VU per identity, 15 iterations each: 375 requests and exactly 15
      // per account, inside the 20-per-10-minutes budget with room to spare.
      //
      // Deliberately ONE scenario. An earlier version warmed in a second
      // scenario and broke the budget arithmetic: k6 numbers `__VU` globally
      // across scenarios, so the two ranges collided under the modulo and
      // five accounts received 28 requests instead of 15. Warming by
      // iteration keeps one VU bound to one identity.
      vus: 25,
      iterations: 15,
      maxDuration: "3m",
    },
  },
  thresholds: {
    // Scoped to the measured phase. The first two iterations per VU are
    // excluded because the first call into the presign path costs seconds, not
    // milliseconds: the object-store SDK loads and initialises its crypto on
    // first use. Measured -- the same scenario run twice gave p95 3.49 s then
    // 255 ms, with the median unchanged at ~27 ms. That is a one-time cost of
    // the process, not a property of the endpoint, and twenty-five
    // simultaneous first-ever calls landing in the percentile would describe
    // class loading rather than upload signing.
    //
    // Excluded by tag rather than deleted, so the cost stays in the output.
    "http_req_duration{phase:measure}": ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    // The budget must not be reached. If it is, the scenario is mis-shaped and
    // the latency number above is not measuring what it claims to.
    upload_url_unexpected_429: ["count==0"],
  },
};

export default function () {
  const oversize = __ITER % 5 === 0;
  const res = http.post(
    `${BASE}/api/v1/meetings/upload-url`,
    JSON.stringify({
      filename: `load-${__VU}-${__ITER}.mp3`,
      contentType: "audio/mpeg",
      sizeBytes: oversize ? OVERSIZE : 4 * 1024 * 1024,
    }),
    {
      headers: authHeaders(),
      tags: {
        name: "POST /api/v1/meetings/upload-url",
        // The first two iterations of each VU warm the presign path.
        phase: __ITER < 2 ? "warm" : "measure",
      },
    },
  );

  if (res.status === 200) signed.add(1);
  if (res.status === 400) oversizeRefused.add(1);
  if (res.status === 429) unexpectedlyLimited.add(1);

  check(res, {
    [oversize ? "oversize is refused" : "ordinary upload is signed"]: (r) =>
      oversize ? r.status === 400 : r.status === 200,
  });

  sleep(1);
}
