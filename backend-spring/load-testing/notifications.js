/**
 * The polled pair, which is what an idle tab actually costs.
 *
 * <p>Every open tab reads the unread count on a 90-second timer whether or not
 * anybody touches it, so this is the floor under all other load: fifty idle
 * tabs is fifty requests a minute before a single person does anything. It is
 * also the query most likely to be missing an index, because it is a count with
 * a `read = false` predicate.
 *
 * <p>The list is only fetched when the panel is open, so it is weighted here
 * the way it is in the product: mostly counts, occasionally a list.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { BASE, authHeaders } from "./config.js";

export const options = {
  stages: [
    { duration: "20s", target: 50 },
    { duration: "1m", target: 50 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    // Tighter than the list: this one runs unattended in every open tab, so a
    // slow count is paid by everybody continuously rather than on a click.
    http_req_duration: ["p(95)<200"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const count = http.get(`${BASE}/api/v1/notifications/unread-count`, {
    headers: authHeaders(),
    tags: { name: "GET /api/v1/notifications/unread-count" },
  });
  check(count, { "count 200": (r) => r.status === 200 });

  // One in five opens the panel.
  if (__ITER % 5 === 0) {
    const list = http.get(`${BASE}/api/v1/notifications?size=20`, {
      headers: authHeaders(),
      tags: { name: "GET /api/v1/notifications" },
    });
    check(list, { "list 200": (r) => r.status === 200 });
  }

  sleep(2);
}
