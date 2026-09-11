# Reverie AI — Load Testing

> **Status: harness implemented; empirical results not produced.** The k6
> scripts below exist and parse. No run has been performed, because this
> environment has no k6 binary and no running stack. The results table is still
> empty for that reason — the numbers have deliberately not been invented, and
> an invented p95 is worse than none because it gets quoted.

Scripts live in `backend-spring/load-testing/`.

```bash
# dev auth, local stack: docker compose up, then
k6 run backend-spring/load-testing/list-meetings.js
k6 run backend-spring/load-testing/notifications.js
k6 run backend-spring/load-testing/upload-url.js
k6 run backend-spring/load-testing/rate-limit.js

# against a staging deployment
BASE_URL=https://reverie-staging.example k6 run backend-spring/load-testing/list-meetings.js
```

## What they will not do to your account

`config.js` is the whole of the safety argument, and it is worth reading before
the first run:

- **Dev auth only.** They send `X-Dev-User`, which only `REVERIE_AUTH_MODE=dev`
  honours. `DeploymentCheck` refuses that mode under the production profile, so
  pointing one of these at production fails on the first request instead of
  doing something. That is by design, not by luck.
- **Nothing is uploaded, confirmed, transcribed or asked.** `upload-url.js`
  stops at the presigned URL and never PUTs bytes or confirms the meeting,
  because confirming is what charges the allowance and enqueues transcription.
  No script touches chat or summarize.
- **No lifetime free tier is spent.** That allowance deliberately survives
  deleting the account — see `FreeTierEntitlement` — so a load test that spent a
  real one could not be undone by any cleanup. The identities are
  `usr_load_0…usr_load_N`, which exist only in a database you are willing to
  throw away.

Use a disposable local or staging database. Not Neon production, not an account
you sign in with.

## Scenarios

| Script | Load | What it is for | Thresholds (k6 exits non-zero if missed) |
|---|---|---|---|
| `list-meetings.js` | 100 VUs, ramped | the read every session makes first | p95 < 300 ms, error rate < 1% |
| `notifications.js` | 50 VUs | the 90-second poll every idle tab costs | p95 < 200 ms, error rate < 1% |
| `upload-url.js` | 50 VUs | heaviest ordinary write, and the size limit under concurrency | p95 < 500 ms, no 5xx, 99% of checks pass |
| `rate-limit.js` | 1 VU, flat out | whether the limit exists at all | at least one 429, and never a 5xx |

Pass criteria are encoded as k6 `thresholds` rather than left in this table for
somebody to eyeball. A missed threshold is a non-zero exit, which is what makes
these usable in a pipeline instead of a thing somebody runs once.

Two are worth explaining:

**`upload-url.js` sends an oversized declaration one time in ten.** The upload
limit added in this pass has two halves, and the declared-size half is checked
before a URL is signed. A limit that holds at one request a second and leaks at
fifty is not a limit, and a single-threaded unit test would never say so. Those
refusals are 4xx and are excluded from the failure threshold — counting the
limit working as a service failure would invert the result.

**`rate-limit.js` fails if it never sees a 429.** Without that assertion the
script reports a cheerful zero-error summary against an endpoint with no limiter
at all, which is precisely the thing it is meant to detect.

## Results

| Metric | list-meetings (100 VU) | notifications (50 VU) | upload-url (50 VU) |
|---|---|---|---|
| Requests | — | — | — |
| avg | — | — | — |
| p95 | — | — | — |
| Error rate | — | — | — |

Record the machine or instance size alongside these. A p95 from a laptop and a
p95 from a Render instance are different measurements, and a table that does not
say which is not evidence of anything.

## Not covered

- **WebSocket status delivery.** Needs `k6/x-websockets`, which is an xk6 build
  rather than the stock binary. The status socket is the one path where a
  failure is invisible to these scripts: it degrades to the five-second poll, so
  throughput looks fine and the product feels slow.
- **The AI paths.** Chat, summarize and transcription are where the real cost
  and the real latency live, and they cannot be load-tested without either
  spending provider credit or standing up a stubbed ai-service. The stub is the
  right answer and does not exist yet; `AI_PROVIDER=mock` gets most of the way
  there and is the place to start.
- **Concurrency against the free-tier ledger.** `FreeTierService` is the one
  place where two requests racing could matter commercially, and testing it
  needs disposable identities and an assertion about the ledger afterwards —
  a correctness test driven by load, not a throughput test.
