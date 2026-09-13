# Reverie AI — Load Testing

> **Status: harness implemented and run. Every number below is measured.** They
> come from a local 512 MB / 0.5 CPU container against a disposable PostgreSQL,
> which is the same shape as the Render `starter` instance but not the same
> machine. Treat them as capacity *shape* and as relative comparisons; absolute
> numbers on Render will differ.

| Script | Purpose | Gates? |
|---|---|---|
| `list-meetings.js` | launch acceptance, 50 VUs | **yes** |
| `list-meetings-stress.js` | capacity benchmark, 100 VUs | no |
| `notifications.js` | launch acceptance, 50 VUs | **yes** |
| `upload-url.js` | normal signing path, inside the budget | **yes** |
| `upload-url-rate-limit.js` | limiter enforcement | **yes** |
| `rate-limit.js` | streaming-token limiter enforcement | **yes** |
| `stub-ai-service.py` | local downstream stub, no provider calls | n/a |

---

## Environment

| | |
|---|---|
| Host | Docker Desktop, Windows |
| Backend container | `--memory=512m --cpus=0.5` (cgroup `cpu.max = 50000 100000`) |
| Image | `eclipse-temurin:21-jre-alpine`, Temurin 21.0.12 |
| GC | **SerialGC**, chosen ergonomically — the container reports 1 CPU |
| JVM | `MaxRAMPercentage=55 / InitialRAMPercentage=20` → max heap 282 MiB |
| Database | disposable PostgreSQL + pgvector, migrated V1→V69 |
| Data | 200 meetings per account (5 000 rows) |
| Auth | dev identities, pre-provisioned; disjoint ranges per script |
| Kafka | pointed at a port with no broker |
| AI service | **`stub-ai-service.py`**, one fixed fake token, no provider calls |
| Object store | absent; presigning is local and needs no endpoint |

### Local limitations, stated plainly

- **Startup takes ~125–135 s**, almost all of it the Kafka admin client retrying
  against a broker that is not there. Local only; not a steady-state cost.
- **The AI service is a stub.** It answers one route with a fixed fake token so
  the streaming-token limiter can be tested end to end. It is not a behavioural
  mock and must not become one.
- **The object store is absent.** Presigning is local crypto, so the signing
  path is real; nothing is uploaded, confirmed, transcribed, or charged.
- **Measurements require a warm JVM.** See below — this is not a detail.

---

## Warm-up dominates everything, and is why the first result was wrong

The investigation started from a failing run:

| | |
|---|---|
| Script | `list-meetings.js`, ramp to 100 VUs, hold 1 min |
| Requests | 2 345 · **22.17 req/s** |
| Latency | avg 2.56 s · med 2.5 s · p90 4.09 s · **p95 4.41 s** · max 12.09 s |
| Errors | 0 % · checks 4690/4690 |
| Threshold | **FAILED** (`p95 < 300 ms`) |
| Memory | `memory.events max` delta **0**, OOM **0** |

**It was measured on a cold JVM against an empty `meetings` table.** It is kept
here rather than replaced, because the explanation is the finding.

Three consecutive *identical* 25-VU runs on one container:

| repeat | median | p95 | CPU consumed | periods throttled |
|---|---|---|---|---|
| 1 | 101 ms | 333 ms | 18.03 s | 74.0 % |
| 2 | 63 ms | 176 ms | 16.17 s | 64.8 % |
| 3 | **27 ms** | **87 ms** | **7.34 s** | **13.5 %** |

**2.5× less CPU for the same work** by the third pass. Reproduced on a second
container built from scratch, which took six passes to plateau:

```
20.27s → 20.22s → 17.15s → 11.11s → 9.12s → 7.78s CPU
96.4%  → 97.1%  → 69.7%  → 30.5%  → 23.2% → 15.3% throttled
```

Any measurement taken before that plateau describes JIT compilation, not
capacity. Every result below is taken after warming.

---

## What the latency actually was

Diagnosed before anything was changed — and **nothing needed changing**:

- **Not the query.** With 200 meetings per account, `EXPLAIN ANALYZE` gives
  **0.103 ms** for the page (`Index Scan Backward using idx_meetings_user_created`,
  6 shared buffers) and **0.255 ms** for the count. The existing index already
  serves `ORDER BY created_at DESC` by scanning backwards. **No index is missing
  and no migration was added.**
- **Not the database.** Every statement logged during a request ran in
  0.02–0.12 ms.
- **Not auth or provisioning.** Identities are provisioned once; steady-state
  auth is two sub-millisecond queries.
- **Not background work.** Idle burn is **1.4 %** of quota with zero throttled
  periods — not the Kafka retry, not the outbox poll.
- **It is the 0.5 CPU quota.** Throttled scheduling periods climb with load and
  throughput plateaus exactly as they do. Marginal cost is ~5.1 ms of CPU per
  request warm, putting the ceiling near 98 req/s.

The latency floor is itself a quota artefact: even at 5 VUs about 10 % of
periods are throttled, so a request needing a few milliseconds of CPU can still
wait for the next 100 ms period. That is why median sits near 30 ms rather than
near the ~0.36 ms of database work.

---

# Launch acceptance results

All gating scripts, warm, `55/20`, 200 meetings per account. **k6 exit 0 for
every one.**

### `list-meetings.js` — PASSED

50 VUs, 20 s ramp, 1 min hold.

| | |
|---|---|
| Requests | 3 643 · **40.21 req/s** |
| Latency | avg 36.77 ms · med 26.40 ms · p90 82.28 ms · **p95 98.82 ms** · max 202.9 ms |
| Errors | 0 % · checks 7286/7286 |
| Threshold | **PASSED** (`p95 < 200 ms`) |
| CPU | 174 of 908 periods throttled (19.2 %) |
| Memory | `max` 1145→1150 · **OOM 0** |

### `notifications.js` — PASSED

50 VUs.

| | |
|---|---|
| Requests | 2 275 · **24.84 req/s** |
| Latency | avg 21.39 ms · med 19.57 ms · p90 23.48 ms · **p95 26.57 ms** · max 144.89 ms |
| Errors | 0 % · checks 2275/2275 |
| Threshold | **PASSED** (`p95 < 200 ms`) |
| CPU | 69 of 830 periods throttled (8.3 %) |
| Memory | `max` 1330→1366 · **OOM 0, oom_kill 0** |

### `upload-url.js` — PASSED

25 accounts × 15 requests = 375, deliberately inside the 20-per-10-minutes
budget. First two iterations per VU are tagged `warm` and excluded from the
threshold.

| | |
|---|---|
| Signed (200) | 300 |
| Oversize refused (400) | 75 |
| Unexpected 429 | **0** |
| 5xx / transport | **0** · checks 375/375 |
| Latency, measured phase | med 25.60 ms · p90 30.10 ms · **p95 33.60 ms** |
| Latency, including warm | med 25.93 ms · p95 265.47 ms · max 676.33 ms |
| Threshold | **PASSED** (`p95{phase:measure} < 500 ms`) |

**Why warm-up is excluded, and why the aggregate is still printed.** The first
call into the presign path costs seconds: the object-store SDK loads and
initialises its crypto on first use. Measured — the same scenario run twice
against different accounts gave p95 **3.49 s** then **255 ms**, with the median
unchanged at ~27 ms both times. A one-time process cost, not a property of the
endpoint. It is excluded by tag rather than deleted, so it stays visible.

### `upload-url-rate-limit.js` — PASSED

10 accounts × 60 requests, three times the budget.

| | |
|---|---|
| Allowed (200) | **exactly 200** = 10 accounts × 20 |
| Refused (429) | 400 |
| Unexpected status | **0** · 5xx **0** · checks 600/600 |
| Threshold | **PASSED** (`allowed == 200`, `429 > 0`, `unexpected == 0`) |

The strict equality is the point: it distinguishes *a* limiter from *the right*
limiter. A policy change, a per-meeting key or a per-endpoint bucket all move
that number.

### `rate-limit.js` — PASSED (streaming token)

One account, 120 requests against a 30-per-10-minutes budget, with the AI stub
downstream.

| | |
|---|---|
| Allowed (200) | **exactly 30** — genuine successes, not failures |
| Refused (429) | 90 |
| Unexpected status | **0** · 5xx **0** · checks 120/120 |
| Threshold | **PASSED** (`allowed == 30`, `429 > 0`, `unexpected == 0`) |

**This previously could not pass honestly.** Without a downstream, the 30
allowed requests answered 503 (`ResourceAccessException`), so the run could not
tell "the limiter allowed it" from "the limiter allowed it and then it broke" —
and a limiter that refused *everything* would have produced a similar summary.
The assertion was strengthened to check both halves and the downstream was
stubbed, rather than the assertion being weakened.

---

# Capacity / stress (non-gating)

### `list-meetings-stress.js` — 100 VUs

Asserts correctness only. Latency here is a measurement, not a requirement.

| | |
|---|---|
| Requests | 6 366 · **70.06 req/s** |
| Latency | avg 187.25 ms · med 107.81 ms · p90 483.31 ms · p95 596.20 ms · p99 896.08 ms · max 1.59 s |
| Errors | **0 %** · checks 12732/12732 |
| CPU | 601 of 911 periods throttled (66.0 %) |
| Memory | `max` 1150→1161 · **OOM 0** |

**Saturation is graceful**: every request still answered correctly, with a
well-formed page. Slower is acceptable; wrong is not.

### The warm ladder behind the numbers

`GET /api/v1/meetings`, constant VUs, 1 s think time, warm, 200 meetings each:

| VUs | req/s | median | p95 | throttled |
|---|---|---|---|---|
| 25 | 23.79 | 28.35 ms | 140.61 ms | 22.0 % |
| 50 | 46.49 | 26.92 ms | 175.90 ms | 33.9 % |
| 100 | 80.01 | 188.26 ms | 713.26 ms | 87.7 % |

| target | satisfied up to |
|---|---|
| p95 < 200 ms | ~50 VUs (~46 req/s) |
| p95 < 300 ms | ~60 VUs |
| p95 < 500 ms | ~85 VUs |

---

## Why the old 100-VU / 300 ms target was replaced as the gate

It was written before anything had been measured against the instance it runs
on, and it describes roughly twice the CPU Reverie buys.

At 100 VUs with 1 s think time the offered load is ~80–100 req/s against a
measured ceiling of ~98 req/s: the service runs at 80–100 % utilisation, which
is the queueing region. Latency there is a property of the arithmetic.

**It was not a query, index, pool or backend defect** — see the diagnosis above.
Meeting it needs roughly double the CPU, not a code change.

So the acceptance gate is now **p95 < 200 ms at 50 VUs** (measured 98.82 ms,
with headroom), and the 100-VU evidence is kept as a non-gating capacity
benchmark rather than deleted. Both facts stay visible: what is promised, and
where it breaks. **The old target is not recorded as having passed. It did
not.**

For context, 40–46 req/s sustained is ~3.5–4 M requests/day against a list
endpoint a real user opens occasionally rather than once per second.

---

## JVM sizing: 55/20 was wrong, and production proved it

> **Superseded on 13 Sep 2026.** Production was OOM-killed under `55/20`. The
> latency comparison below still stands and was not the mistake; the mistake was
> reading a heap benchmark as a total-memory answer. See
> *[The OOM that settled it](#the-oom-that-settled-it)* directly below for what
> replaced it and why.

Both configurations, warm, same data and protocol:

| VUs | 45/15 p95 | **55/20 p95** | 45/15 req/s | **55/20 req/s** |
|---|---|---|---|---|
| 25 | 100.88 ms | 140.61 ms | 23.79 | 23.79 |
| 50 | 282.91 ms | **175.90 ms** | 45.96 | 46.49 |
| 100 | 1.09 s | **713.26 ms** | 64.14 | **80.01** |

At saturation `55/20` sustains ~25 % more throughput at materially lower p95:
more heap means less GC competing for a throttled CPU budget. `45/15` also took
about nine warm-up passes to plateau against roughly four, which matters on
every deploy restart.

~~**Production stays at `MaxRAMPercentage=55 / InitialRAMPercentage=20`.**~~
Held until 13 Sep 2026. Production is now `31/25`.

An earlier comparison appeared to favour `45/15`. It was invalid — it compared a
warm container against a cold one, and was redone.

---

## The OOM that settled it

**12 Sep 2026, ~20:04 UTC. Render instance `k9wwr`: "Ran out of memory (used
over 512MB) while running your code."** One instance, recovered by restart a
minute later. Not Kafka (it had logged `Successfully logged in`), not Neon, not
the health check, not a deploy.

Render had shown ~476–477 MB immediately before, with CPU near idle.

### Why the benchmark above did not predict it

`MaxRAMPercentage` sizes the **heap**. Render kills on the **total**, and at
Render Starter's shape the rest of the total is most of it:

| | committed |
|---|---|
| heap | 164 MiB — **maximum 272 MiB** |
| metaspace + compressed class space | 146 MiB |
| code cache | 34 MiB cold → 46 MiB after 35 min |
| native: thread stacks, GC, JIT arenas, musl malloc | 96–117 MiB |
| **floor before one application object** | **~280–320 MiB** |

The heap sat at 164 MiB with **109 MiB of expansion still permitted and nowhere
to put it**: 272 + 320 is 592 MiB on a 512 MiB box. The service was never stable
— it was one heap expansion away from the ceiling, permanently, and short
benchmarks never triggered the expansion.

Three things in the old harness hid it, all of them named in *Environment*
above as conveniences:

- **Kafka pointed at a port with no broker**, so `KafkaProducer` was never
  constructed. It is lazy: it appears on the *first outbox publish*, not at
  boot. Measured cost when it does: **+7.6 MiB**, 891 classes, 2 threads.
- **The object store was absent**, so the AWS SDK's Apache HTTP client and its
  connection pool never initialised.
- **Runs were ~90 seconds.** The production process had been alive for hours.
  Code cache grows the whole time: +6.4 MiB in the first ten minutes of a soak.

Reproduced with all three corrected — Redpanda, MinIO, and a 35-minute soak —
the container reached **511.4 MiB under the 100-VU stress, 99.9 % of the
limit**, on the same `55/20` that "passed".

### What changed

`render.yaml`: `MaxRAMPercentage=31 / InitialRAMPercentage=25` (159/128 MiB
here). Not a squeeze — **the live set after a full collection is 68 MiB**, and a
160 MiB heap ran the 50-VU load with **zero major collections** and the whole
35-minute soak with **one**. Percentages rather than `-Xmx` so the sizing stays
sane if `plan` changes; the floor above does not scale with the plan, so
re-measure if it does.

`application.yml`: `server.tomcat.threads.max=32`. This one is a **ceiling, not
a saving**, and the distinction is worth keeping: at 50 VUs the pool never
reaches even 32 — the CPU saturates first, and about ten workers were live at
the end of a run. Steady state is unchanged. The worst case is not: the
unaccounted native region tracks thread count at roughly 260 KiB each (measured
as a difference across a load run, so it carries some code-cache growth too),
which puts Tomcat's default 200-thread ceiling at ~50 MiB of stacks this
container cannot spare.

`pom.xml`: excluded `commons-logging`, which the AWS SDK's Apache client drags
in and which `spring-jcl` already implements — the duplicate that printed
"please remove commons-logging.jar from classpath" on every boot.

### The result, and why it is not enough

35-minute soak, light continuous traffic, 50-VU bursts at minutes 10/20/30,
outbox relay publishing throughout:

| | |
|---|---|
| start → end | 453.3 → **482.2 MiB** |
| peak | **485.8 MiB (94.9 %)** |
| heap committed | **154.7 MiB, flat for 35 minutes** |
| major collections | **1** |
| `oom` / `oom_kill` | **0 / 0** |
| CPU periods throttled | 27 % |

Startup is not made riskier by the smaller heap: peak-during-startup fell from
432–440 MiB to **411–422 MiB**. Startup *time* wandered between 85 s and 128 s
across every configuration including unchanged `55/20`, which is this host under
varying load rather than anything the flags did.

Then the committed configuration end to end, warmed to plateau — five
consecutive `list-meetings.js` passes, which is the protocol this document
already insists on:

| pass | p95 | requests | failed |
|---|---|---|---|
| 1 | 11.53 s | 592 | 0 % |
| 3 | 6.99 s | 910 | 0 % |
| **5** | **2.29 s** | **2 237** | **0 %** |

3.8× the throughput by the fifth pass, 0 errors throughout, 2 major collections
across 9.8 GB allocated, settled 474.5 MiB, peak 485.4 MiB.

**Those p95 figures are not comparable to the gate.** This run was taken on a
host whose half-CPU was 97–98 % throttled throughout, against the 50-VU numbers
at the top of this document which were measured on a materially faster one. The
warming *trend* is the transferable result; the absolute latency is not, and the
`p95 < 200 ms` gate has to be re-confirmed against the real instance after
deploy. Memory is a different matter — cgroup accounting is exact, and the lab
settled within ~5 MiB of what Render reported for the live process, which is why
the memory conclusions here are quoted with confidence and the latency ones are
not.

The fix removes the failure mode: the ceiling drops from ~592 MiB to ~486 MiB,
and the heap can no longer expand into memory that does not exist. It does not
create headroom. The process **plateaus at 94–95 % of the limit**, which is a
service that survives rather than one with room to breathe — and the floor is
not configuration, it is what Spring Boot with JPA, Security, WebSocket, Kafka,
the AWS SDK, Flyway, Sentry and OpenPDF costs to hold in memory.

**512 MB is not a safe size for this application.** Recorded here rather than
acted on: the plan change is a decision for whoever owns the bill.

---

## Memory

`memory.events` was recorded before and after every run.

- **No OOM, ever.** `oom` and `oom_kill` stayed at 0 through every run on both
  configurations, including 100 VUs.
- Warm runs produce `max` deltas in the single digits to low tens — the cgroup
  reclaiming file cache, not the JVM running out of heap.
- ~~A high `memory.current` alone is not failure: much of it is reclaimable page
  cache, which is why `memory.events` and `oom_kill` are the counters quoted.~~

  **This was the reasoning that let the OOM through, and it is wrong here.**
  `memory.stat` on this container reports `file` in the *tens of kilobytes*
  against ~445 MB of `anon`. There is no page cache to reclaim: `memory.current`
  is almost entirely anonymous JVM memory, so it is a real number and not a
  soft one. `oom_kill` staying at 0 means *this run* did not cross the line, not
  that there was room — it read 0 at 511.4 MiB, which is 0.6 MiB of room. Quote
  `memory.current` and `memory.peak` against the limit as well, and treat
  anything above ~90 % as the finding it is.

One container did exit mid-investigation (exit 255, `OOMKilled=false`). It was
caused by running a second 512 MB JVM alongside it for a comparison, pressuring
the Docker Desktop VM. Not a backend fault, and not reproducible with a single
container.

---

## Not covered

- **WebSocket status delivery.** Needs an xk6 build rather than the stock
  binary. It degrades to the 5 s poll, so throughput looks fine while the
  product feels slow — the one path these scripts cannot see.
- **The AI paths.** Chat, summarize and transcription are where the real cost
  lives. Load-testing them needs a stubbed ai-service with realistic timing; the
  token stub here is deliberately not that.
- **Concurrency against the free-tier ledger**, which is a correctness test
  driven by load rather than a throughput test.
- **Render itself.** Everything here is local. Production validation is by
  observation of real traffic, not synthetic load against the live service.
