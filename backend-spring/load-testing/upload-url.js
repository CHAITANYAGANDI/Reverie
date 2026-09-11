/**
 * Write stability, and the size limit under concurrency.
 *
 * <p>`POST /api/v1/meetings/upload-url` is the heaviest ordinary write: it inserts
 * a pending meeting and signs a URL. It stops there deliberately — nothing here
 * uploads bytes or confirms the meeting, because confirming is what charges the
 * allowance and queues transcription. See config.js.
 *
 * <p>It doubles as the concurrency test for the upload limit added in this
 * pass. One in ten requests declares a size over the maximum and must be
 * refused; a limit that holds at one request a second and leaks at fifty is not
 * a limit, and a check that only ever runs single-threaded would never say so.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { BASE, authHeaders } from "./config.js";

/** Must match `app.upload.max-bytes`; this one is deliberately over it. */
const OVERSIZE = 600 * 1024 * 1024;

export const options = {
  stages: [
    { duration: "20s", target: 50 },
    { duration: "1m", target: 50 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],
    // 5xx only. The refusals below are 4xx and are the point, so counting them
    // as failures would make a working limit look like a broken service.
    "http_req_failed{expected_response:true}": ["rate<0.01"],
    checks: ["rate>0.99"],
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

  check(res, {
    [oversize ? "oversize refused" : "ordinary upload signed"]: (r) =>
      oversize ? r.status === 400 : r.status === 200,
  });

  sleep(1);
}
