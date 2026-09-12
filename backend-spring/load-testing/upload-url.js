/**
 * Write stability, the size limit, and the burst limit — under concurrency.
 *
 * <p>`POST /api/v1/meetings/upload-url` is the heaviest ordinary write: it
 * inserts a pending meeting and signs a URL. It stops there deliberately —
 * nothing here uploads bytes or confirms the meeting, because confirming is
 * what charges the allowance and queues transcription. See config.js.
 *
 * <h2>Why this script asserts three outcomes rather than one</h2>
 *
 * <p>It used to assert that an ordinary request returns 200. That stopped being
 * true when the endpoint gained a burst limit of {@code 20 requests / 10
 * minutes per user}: at 50 VUs spread over 25 identities each identity issues
 * roughly 180 requests in this run, so all but the first twenty are refused
 * with 429. The old check read a *working* limiter as a failing endpoint —
 * exactly the wrong way round.
 *
 * <p>So the contract under test is now the real one:
 *
 * <ul>
 *   <li><b>200</b> — allowed, inside the burst budget;</li>
 *   <li><b>429</b> — refused by the limiter, which is correct behaviour and is
 *       counted and reported rather than treated as an error;</li>
 *   <li><b>400</b> — refused for declaring a size over the configured maximum;</li>
 *   <li>anything else, especially 5xx — a genuine failure.</li>
 * </ul>
 *
 * <p><b>Ordering matters and is asserted implicitly.</b> The limiter runs in
 * the controller, before `createUploadUrl` validates the declared size, so once
 * an identity is out of budget even the oversized probe comes back 429 rather
 * than 400. The oversize check therefore accepts either refusal and only fails
 * on a 200 — an oversized upload being *signed* is the defect worth catching,
 * and it cannot hide behind a 429.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";
import { BASE, authHeaders } from "./config.js";

/** Must match `app.upload.max-bytes`; this one is deliberately over it. */
const OVERSIZE = 600 * 1024 * 1024;

const allowed = new Counter("upload_url_allowed_200");
const rateLimited = new Counter("upload_url_rate_limited_429");
const oversizeRefused = new Counter("upload_url_oversize_refused_400");

/*
 * 200, 400 and 429 are all correct answers from this endpoint, so none of them
 * is an HTTP "failure". Without this k6 counts every 4xx as failed and the
 * run reports a healthy limiter as a broken service.
 */
http.setResponseCallback(http.expectedStatuses(200, 400, 429));

export const options = {
  stages: [
    { duration: "20s", target: 50 },
    { duration: "1m", target: 50 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],
    // Now means what it says: 5xx, timeouts and transport errors only.
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    // The limiter must actually engage at this load. If it never does, either
    // the policy changed or the limiter is not wired to this endpoint, and a
    // clean run would otherwise say nothing about it.
    upload_url_rate_limited_429: ["count>0"],
  },
};

export default function () {
  const oversize = __ITER % 10 === 0;
  const res = http.post(
    `${BASE}/api/v1/meetings/upload-url`,
    JSON.stringify({
      filename: `load-${__VU}-${__ITER}.mp3`,
      contentType: "audio/mpeg",
      sizeBytes: oversize ? OVERSIZE : 4 * 1024 * 1024,
    }),
    { headers: authHeaders(), tags: { name: "POST /api/v1/meetings/upload-url" } },
  );

  if (res.status === 200) allowed.add(1);
  if (res.status === 429) rateLimited.add(1);
  if (res.status === 400) oversizeRefused.add(1);

  if (oversize) {
    check(res, {
      // Refused, either way. A signed URL for an oversized declaration is the
      // only unacceptable outcome.
      "oversize is never signed": (r) => r.status === 400 || r.status === 429,
    });
  } else {
    check(res, {
      "ordinary upload is signed or fairly refused": (r) =>
        r.status === 200 || r.status === 429,
    });
  }

  sleep(1);
}
