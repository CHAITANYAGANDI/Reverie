# Reverie AI — Load Testing

> **Status: harness implemented and run. The results below are measured, not
> estimated.** They come from a local 512 MB / 0.5 CPU container against a
> disposable PostgreSQL, which is the same shape as the Render `starter`
> instance but not the same machine. Treat them as capacity *shape* and as
> relative comparisons; absolute numbers on Render will differ.

Scripts live in `backend-spring/load-testing/`.

```bash
k6 run backend-spring/load-testing/list-meetings.js
k6 run backend-spring/load-testing/notifications.js
k6 run backend-spring/load-testing/upload-url.js
k6 run backend-spring/load-testing/rate-limit.js
```

## Environment used for every number on this page

| | |
|---|---|
| Host | Docker Desktop, Windows |
| Backend container | `--memory=512m --cpus=0.5` (cgroup `cpu.max = 50000 100000`) |
| Image | `eclipse-temurin:21-jre-alpine`, Temurin 21.0.12 |
| GC | **SerialGC**, chosen ergonomically — the container reports 1 CPU |
| Heap | `55/20` → max 282 MiB · `45/15` → max 224 MiB |
| Database | disposable PostgreSQL + pgvector, schema migrated V1→V69 |
| Data | 25 dev identities, **200 meetings each (5 000 rows)** |
| Auth | dev identities `usr_load_0…24`, pre-provisioned before measurement |
| Kafka | pointed at a port with no broker |
| AI service / object store | deliberately absent |

Two environment facts that shape the numbers:

- **Startup takes ~125–135 s**, almost all of it the Kafka admin client retrying
  against a broker that is not there. Expected locally; not a steady-state cost.
- **The AI service is absent on purpose.** Endpoints that call it fail at the
  provider call. That is visible in the rate-limit run below and is an artefact
  of the harness, not of the backend.

---

## The first run, and why it was misleading

Recorded because it is what prompted this investigation, and because the
explanation matters more than the number.

| | |
|---|---|
| Script | `list-meetings.js`, ramp to 100 VUs, hold 1 min |
| Requests | 2 345 · **22.17 req/s** |
| Latency | avg 2.56 s · med 2.5 s · p90 4.09 s · **p95 4.41 s** · max 12.09 s |
| Errors | 0 % · checks 4690/4690 |
| Threshold | **FAILED** (`p95 < 300 ms`) |
| Memory | `memory.events max` delta **0**, OOM **0** |

**It was measured on a cold JVM, against an empty `meetings` table.** Three
consecutive identical 25-VU runs on one container showed how much that matters:

| repeat | median | p95 | CPU consumed | periods throttled |
|---|---|---|---|---|
| 1 | 101 ms | 333 ms | 18.03 s | 74.0 % |
| 2 | 63 ms | 176 ms | 16.17 s | 64.8 % |
| 3 | **27 ms** | **87 ms** | **7.34 s** | **13.5 %** |

Same load, same code, same data — **2.5× less CPU for the same work** by the
third pass. Any measurement taken before the JIT has settled describes warm-up,
not capacity. Every ladder below is taken after warming to a CPU plateau.

---

## What the latency actually was

Diagnosed before anything was changed, and nothing needed changing:

- **Not the query.** With 200 meetings per user, `EXPLAIN ANALYZE` gives
  **0.103 ms** for the page (`Index Scan Backward using idx_meetings_user_created`,
  6 shared buffers) and **0.255 ms** for the count. The existing index already
  serves `ORDER BY created_at DESC` by scanning backwards. **No index is missing.**
- **Not the database at all.** Every statement logged during a request ran in
  0.02–0.12 ms.
- **Not authentication or provisioning.** The identities are provisioned once;
  steady-state auth is two sub-millisecond queries.
- **Not background work.** Idle burn is **1.4 %** of the CPU quota with zero
  throttled periods.
- **It is the CPU quota.** Throttling rises monotonically with load, and
  throughput plateaus exactly as the quota saturates.

The latency floor is itself a quota artefact: even at 5 VUs about 10 % of
scheduling periods are throttled, so a request that needs a few milliseconds of
CPU can still wait for the next 100 ms period to refill. That is why median
latency sits near 30 ms rather than near the ~0.4 ms of database work.

---

## Load ladder — `GET /api/v1/meetings?page=0&size=20`

Constant VUs, 1 s think time, 40 s per rung, warm JVM, 200 meetings per user.

### Production configuration (`MaxRAMPercentage=55 / InitialRAMPercentage=20`)

| VUs | req/s | median | p90 | p95 | p99 | max | throttled periods | errors |
|---|---|---|---|---|---|---|---|---|
| 25 | 23.79 | 28.35 ms | 77.62 ms | **140.61 ms** | 261 ms | 366 ms | 22.0 % | 0 % |
| 50 | 46.49 | 26.92 ms | 105.20 ms | **175.90 ms** | 740 ms | 970 ms | 33.9 % | 0 % |
| 100 | 80.01 | 188.26 ms | 499.29 ms | **713.26 ms** | 1.13 s | 1.52 s | 87.7 % | 0 % |

`memory.events max` delta was **0** across all three rungs; OOM **0**.

### Comparison configuration (`45 / 15`)

| VUs | req/s | median | p90 | p95 | p99 | throttled periods |
|---|---|---|---|---|---|---|
| 25 | 23.79 | 29.42 ms | 60.62 ms | **100.88 ms** | 291 ms | 14.1 % |
| 50 | 45.96 | 31.37 ms | 185.04 ms | **282.91 ms** | 897 ms | 25.7 % |
| 100 | 64.14 | 412.44 ms | 1.00 s | **1.09 s** | 1.48 s | 97.3 % |

### Where the thresholds fall

Reading the 55/20 ladder:

| target | satisfied up to |
|---|---|
| p95 < 200 ms | ~50 VUs (~46 req/s) |
| p95 < 300 ms | ~60 VUs |
| p95 < 500 ms | ~85 VUs |
| p95 < 1 s | beyond 100 VUs |

Marginal cost is **~5.1 ms of CPU per request** warm, which puts the theoretical
ceiling near 98 req/s on a 0.5 CPU quota. Measured throughput peaks at **80
req/s**, the difference being throttling overhead and fixed background work.

**`p95 < 300 ms` at 100 VUs is not reachable on 0.5 CPU.** At 100 VUs with 1 s
think time the offered load is ~80–100 req/s against a ~98 req/s ceiling: the
service is at 80–100 % utilisation, which is the region where queueing latency
rises steeply no matter how efficient the code is. Meeting it would need roughly
twice the CPU, not a code change. `list-meetings.js` still carries the 300 ms
threshold and still fails it at 100 VUs; the threshold has deliberately **not**
been edited to make the run green. See "Proposed service-level target" below.

---

## `notifications.js` — PASSED

50 VUs, 90 s, warm.

| | |
|---|---|
| Requests | 2 258 · 24.81 req/s |
| Latency | avg 34.17 ms · med 23.38 ms · p90 62.16 ms · **p95 94.72 ms** · max 261 ms |
| Errors | 0 % · checks 2258/2258 |
| Threshold | **PASSED** (`p95 < 200 ms`, `errors < 1 %`) |

Measured on the `45/15` container, which was the slower of the two at 50 VUs —
so this is a conservative result and holds for `55/20`.

---

## `upload-url.js` — limiter contract verified, latency threshold missed

The script was rewritten for this run. It previously asserted that an ordinary
request returns 200, which stopped being true when the endpoint gained a burst
limit of **20 requests / 10 minutes per user**: at 50 VUs over 25 identities each
identity issues ~180 requests in 90 s, so the old check read a *working* limiter
as a broken endpoint.

| outcome | count |
|---|---|
| 200 allowed | 425 |
| 400 refused for declared size | 75 |
| 429 refused by the limiter | 2 924 |
| 5xx / transport | **0** |

`425 + 75 = 500 = 25 identities × exactly 20` — the limiter is precise to the
request. Checks 3424/3424.

`p95 = 598 ms` against a `p95 < 500 ms` threshold: **missed, and left as
measured.** The response mix is now dominated by cheap 429s, so the threshold no
longer describes the same workload it was written for; it should be revisited
deliberately rather than nudged to fit.

---

## `rate-limit.js` — limiter proven, 30 failures explained

| | |
|---|---|
| 429 refusals | 2 346 |
| Non-429 | 30 |
| Threshold | **PASSED** (`rate_limited_429 count > 0`) |

The 30 are exactly the `streaming-token` budget of 30 / 10 min. The limiter
allowed them; each then failed at the provider call with
`ResourceAccessException`, because **this environment has no AI service on
purpose**. An environment artefact, not a limiter defect — the assertion
"allowed or refused, never broken" is correct and is left in place.

The script's documentation also claimed streaming-token was the only limited
endpoint. That has been corrected to the current policy: `ai-chat` 20/1 min
(shared across meeting, project and workspace), `meeting-resummarize` 5/10 min,
`meeting-reprocess` 3/30 min (shared with `/language`), `meeting-upload-url`
20/10 min, `meeting-translation` 5/10 min (model-backed path only), and
`streaming-token` 30/10 min.

---

## Proposed service-level target

The committed `list-meetings.js` threshold (`p95 < 300 ms` at 100 VUs) predates
any measurement of the deployment it runs against. On the evidence above it
describes roughly twice the CPU Reverie buys.

A target the current instance actually meets, with headroom:

> **`GET /api/v1/meetings`: p95 < 200 ms at 50 concurrent users (~46 req/s),
> 0 errors.** Measured: p95 175.90 ms.

For context, 46 req/s sustained is ~4 M requests/day against a list endpoint
that a real user opens occasionally rather than once per second. Nothing in the
product's expected traffic approaches it.

**This is a proposal, not an applied change** — the threshold in the script has
been left failing rather than edited.

---

## Memory

`memory.events` counters were recorded before and after every rung.

- **No OOM, ever.** `oom` and `oom_kill` stayed at 0 through every run including
  100 VUs on both configurations.
- Warm 55/20 rungs produced a `max` delta of **0** — no reclaim pressure at all.
- Cold/warming rungs produced non-zero `max` deltas (tens to low hundreds), which
  is the cgroup reclaiming file cache while the JVM is still compiling. It
  settles.
- A high `memory.current` alone is not failure: much of it is reclaimable page
  cache, which is why `memory.events` and `oom_kill` are the counters quoted.

One container did exit during this work (exit 255, `OOMKilled=false`). It was
caused by running a second 512 MB JVM alongside it for a comparison, pressuring
the Docker Desktop VM. It was not a backend fault and not reproducible with a
single container.

---

## Not covered

- **WebSocket status delivery.** Needs an xk6 build rather than the stock
  binary. It degrades to the 5 s poll, so throughput looks fine while the
  product feels slow — the one path these scripts cannot see.
- **The AI paths.** Chat, summarize and transcription are where the real cost
  lives and cannot be load-tested without either spending provider credit or
  standing up a stubbed ai-service. The stub is the right answer and does not
  exist yet.
- **Concurrency against the free-tier ledger**, which is a correctness test
  driven by load rather than a throughput test.
