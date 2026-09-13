# Reverie on Oracle Cloud (Ampere A1, ARM64)

Both compute services — `reverie-backend` (Spring Boot) and `reverie-ai`
(FastAPI) — on one Always Free Ampere A1 VM, behind Caddy.

Nothing stateful moves. Neon still holds the database, Confluent Cloud the
broker, Cloudflare R2 the recordings, Vercel the frontend. **Render stays live
as the rollback** until this is proven; see [Cutover](#cutover) and
[Rollback](#rollback).

```
                         Internet
                            │  443
                            ▼
                     ┌──────────────┐
                     │    Caddy     │   TLS, the only published port
                     └──────┬───────┘
                            │  edge network
                            ▼
                  ┌────────────────────┐
                  │  reverie-backend   │  Spring :8080  (not published)
                  │      :8080         │
                  └─────┬────────┬─────┘
          Neon ◀────────┘        │ internal network
      Confluent ◀───────┘        ▼
             R2 ◀───────┘  ┌──────────────┐
                           │  reverie-ai  │  FastAPI :8000 (not published,
                           │    :8000     │  no route from Caddy at all)
                           └──────┬───────┘
                                  └──▶ Confluent, R2, Neon, providers
```

---

## Why this exists

Render's Starter plan has a 512 MB hard limit. On **12 Sep 2026 at ~20:04 UTC**
Render OOM-killed `reverie-backend` (instance `k9wwr`) for exceeding it, after
sitting at ~476–477 MB with CPU near idle.

Production-like testing then established that 512 MB was never enough: the JVM's
floor for this application — metaspace, compressed class space, code cache,
thread stacks, GC structures, JIT arenas — is ~280–320 MB *before a single
application object exists*. Even after bounding the heap (`b7c1734`) the process
plateaued at ~482 MB, or 94–95 % of the limit. That commit made 512 MB
survivable, not safe.

`docs/load-testing-report.md` has the full analysis, including the earlier
`55/20` configuration that passed a short benchmark and should not have. **That
result is not restated here as a success.** It was wrong, and the reason it
looked right — a heap benchmark read as a total-memory answer, on a harness
where Kafka and S3 never initialised — is recorded there deliberately.

Oracle's Always Free Ampere A1 gives both services room with headroom to spare,
at no cost, while every piece of persistent state stays in the managed systems
that already hold it.

---

## Before you provision anything

Three things must be checked in the Oracle console. **None of them is
guaranteed**, and this repository cannot check them for you:

1. **Does the tenancy qualify for Always Free Ampere A1?** The allowance is up
   to 4 OCPU and 24 GB of memory across all A1 instances, and 200 GB of block
   storage. A tenancy that has upgraded to Pay As You Go keeps the free
   allowance; a trial that has expired may not.
2. **Is there A1 capacity in your home region?** `Out of host capacity` on
   Ampere shapes is common and region-specific. Capacity cannot be reserved on
   the free tier, and the home region cannot be changed after signup.
3. **Idle reclamation.** Oracle reserves the right to reclaim idle Always Free
   compute instances. Read the current policy before relying on this host for
   anything you would miss.

   Do **not** manufacture synthetic traffic to defeat it. If the policy is a
   problem for your usage, the honest answers are a paid instance or a
   different host — not a cron job pretending to be a user.

### Recommended shape

| | |
|---|---|
| Shape | `VM.Standard.A1.Flex` |
| OCPU | 2 |
| Memory | 12 GB |
| Boot volume | 50 GB |
| Image | Canonical Ubuntu 24.04 LTS (**aarch64** build) |

2 OCPU / 12 GB is half the free A1 allowance, which leaves room to grow this VM
or add a second later. It is deliberately generous relative to what the two
containers are limited to (3 GB + 2 GB): the rest is for the kernel, Docker,
filesystem cache, Caddy, TLS and transient `ffmpeg` work.

---

## Host setup

Ubuntu 24.04 LTS aarch64. Docker's official repository, not the distro package:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
                        docker-buildx-plugin docker-compose-plugin

sudo systemctl enable --now docker
sudo usermod -aG docker $USER    # log out and back in
```

No Java and no Python on the host. The containers own their runtimes, which is
what makes the VM replaceable.

**Do not install PostgreSQL, Kafka or MinIO here.** Those are Neon, Confluent
and R2, and putting a copy on this disk would put user data on a VM that is
meant to be disposable.

---

## Network

Two layers, and both must allow the traffic or nothing works.

### Oracle security list / NSG

| Port | Source | Why |
|---|---|---|
| 22/tcp | **your admin IP or CIDR only** | SSH |
| 80/tcp | `0.0.0.0/0` | ACME HTTP-01 challenge, and the redirect to HTTPS |
| 443/tcp | `0.0.0.0/0` | the API |
| 443/udp | `0.0.0.0/0` | HTTP/3, optional — Caddy falls back to TCP without it |

Never open `8080`, `8000`, PostgreSQL, Kafka, or the Docker daemon port.
Ubuntu's Oracle image also ships iptables rules of its own:

```bash
sudo iptables -I INPUT -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### SSH

Key-based only. The Oracle Ubuntu image already disables password auth and root
login; confirm rather than assume:

```bash
sudo sshd -T | grep -E 'permitrootlogin|passwordauthentication'
# expect: permitrootlogin no        (or prohibit-password)
#         passwordauthentication no
```

### A note on Docker and firewalls

Docker writes its own iptables rules and a published port bypasses UFW. This is
exactly why neither application service has a `ports:` entry — `expose:` alone
keeps them on the Docker network, reachable by name and by nothing else. Do not
add `ports: "8080:8080"` "temporarily to debug"; use `docker compose exec`.

---

## DNS

`BACKEND_HOSTNAME` must resolve to the VM's public IP **before** the first
`docker compose up`, or Caddy's ACME challenge fails and it serves nothing.

| Record | Value |
|---|---|
| `A` | the VM's public IPv4 |
| `AAAA` | the VM's IPv6, if you assigned one |

```bash
dig +short api.example.com     # must print the VM's IP
```

No domain? A subdomain of one you own is the simplest answer. Failing that,
DuckDNS, Afraid.org FreeDNS and similar free dynamic-DNS providers issue a
hostname that Let's Encrypt will sign. A raw IP address will not work: Let's
Encrypt does not issue certificates for IPs, and the frontend is HTTPS, so
plain HTTP here would be blocked as mixed content and would break auth and
WebSockets.

---

## First deployment

```bash
git clone https://github.com/CHAITANYAGANDI/Reverie.git
cd Reverie
git checkout <the reviewed commit or tag>

cd deploy/oracle
cp .env.example .env
chmod 600 .env
$EDITOR .env                      # fill it in here, never in Git

docker compose config             # validate; prints the resolved config
docker compose build              # ~10-20 min on 2 OCPU, first time only
docker compose up -d

docker compose ps
docker compose logs -f reverie-backend
```

Let the backend come up first and reach `UP` — it runs the Flyway migrations.
Then check the worker. Its service status is not enough: it degrades rather
than crashing when Kafka or Postgres is unreachable, so it can look healthy
while doing nothing.

```bash
# public, through Caddy
curl -s https://$BACKEND_HOSTNAME/actuator/health      # {"status":"UP"}

# private — from the host, not the internet
docker compose exec reverie-ai \
  python -c "import urllib.request;print(urllib.request.urlopen('http://localhost:8000/health').read())"

# the line that proves the worker is really wired up
docker compose logs reverie-ai | grep "RAG connected to Postgres"
```

`/actuator/health` is public and says only `UP` or `DOWN` (`show-details:
never`). `/actuator/metrics` is **not** exposed — the `production` profile
restricts the actuator to `health` alone.

---

## JVM sizing

**Do not copy Render's `MaxRAMPercentage` values here.** `b7c1734` set 31/25 for
a 512 MB container, where 31 % is a 159 MB heap. Against a 3 GB limit the same
percentage is ~950 MB, which is a different decision that nobody made.

Oracle gets explicit `-Xms`/`-Xmx` instead, because the container size is known
and fixed and a deterministic heap is easier to reason about than a percentage
of a number that might change:

```
-Xms512m -Xmx1024m
```

Chosen by comparison, on a 3 GB / 1 CPU container against disposable
dependencies, each candidate warmed to plateau and given the same ~23.5 GB of
allocation:

| | **-Xms512m -Xmx1024m** | -Xms256m -Xmx768m |
|---|---|---|
| settled RSS | 577.6 MB | 575.1 MB |
| peak RSS | 584.6 MB | 580.7 MB |
| minor collections | **171** | 345 |
| major collections | 1 | 1 |
| longest pause | **6 ms** | 55 ms |
| p95 at plateau | 1.02 s | 1.01 s |
| startup | 51.6 s | 44.9 s |

The resident cost is the same either way — the JVM resides what it touches, not
what `-Xms` reserved — so the larger heap is free, and it halves the collection
count and cuts the worst pause by 9×. Latency at plateau is identical because
this workstation is CPU-bound, not heap-bound.

**The collector is SerialGC**, chosen ergonomically because a 1-CPU container
reports one processor. That was worth checking rather than assuming: SerialGC's
full collections scale with heap size, so a 1 GB heap could in principle have
been a long stop-the-world pause on one core. It is not, because the live set
after a full collection is only ~81 MB — the old generation never fills. One
major collection occurred across 23.5 GB allocated. No GC is forced here; there
is no measurement that would justify overriding the ergonomic choice.

The floor measured on Render Starter still applies and does not shrink with a
bigger container: metaspace and compressed class space ~150 MB, code cache
~64 MB, and ~110 MB of thread stacks, GC structures and JIT arenas. Budget for
it on top of the heap, not inside it — that arithmetic is exactly what 512 MB
could not satisfy.

**Re-measure on real Ampere.** These numbers come from an x86-64 workstation.
They transfer as *shape* — heap headroom, collection counts, the SerialGC
choice, which follows from the CPU count and will be the same on A1 — but the
absolute latency does not. See [Performance](#performance).

---

## Performance

**The launch target is unchanged: `list-meetings`, 50 VUs, p95 < 200 ms, errors
< 1 %, checks > 99 %.** Nothing here weakens it, and nothing here has met it.

What was measured locally, on a 3 GB / 1 CPU container, warmed to plateau:

| Script | p50 | p95 | throughput | errors | checks |
|---|---|---|---|---|---|
| `list-meetings.js` 50 VU | 1.01 s | 1.06 s | 41.0 req/s | **0 %** | **100 %** |
| `notifications.js` 50 VU | 2.00 s | 2.02 s | 25.1 req/s | **0 %** | **100 %** |
| `upload-url.js` | 1.01 s | 2.48 s | 20.5 req/s | **0 %** | **100 %** |
| `list-meetings-stress.js` 100 VU | 1.20 s | 1.49 s | 67.3 req/s | **0 %** | **100 %** |

Those p95 figures are roughly 10× the target and **are not evidence about
Oracle.** The container spent ~38–40 % of its CPU periods throttled on a
Docker Desktop VM on Windows; the same workstation at 0.5 CPU produced p95
2.29 s in the Render investigation, and doubling the CPU halved it, which is
what a CPU-bound measurement looks like. Throughput matches the accepted
baseline (41.0 vs 40.21 req/s) only because the script sleeps a second between
iterations, so it is pinned by think-time rather than by the server.

What *is* evidence, and what this validation was for:

- **zero correctness failures** across every script, including the 100-VU stress
- **no OOM**, no cgroup `max` events, memory flat at 581 MB of a 3072 MB limit
- **sane GC**: 233 minor and 1 major collection across 31.9 GB allocated
- no behavioural regression against the previous baseline

**The SLO is validated on the real Ampere A1 after provisioning, not here.**
If p95 < 200 ms is not met on native hardware, that is a genuine blocker and is
treated as one.

---

## Resource limits

| Service | Memory | CPU | Why |
|---|---|---|---|
| `reverie-backend` | 3 GB | 1.0 | heap + the ~300 MB JVM floor, with room that Render never had |
| `reverie-ai` | 2 GB | 1.0 | Python is light at idle; the headroom is for `ffmpeg` |
| host remainder | ~7 GB | — | kernel, Docker, page cache, Caddy, TLS, `ffmpeg` spikes |

Deliberately not the whole VM. If `reverie-backend` ever sits above ~1.5 GB
steady, that is a regression to investigate — not a limit to raise.

---

## Privacy at the edge

Reverie's logging and privacy hardening is closed (PR #11) and the reverse proxy
must not reopen it. **Caddy access logging is off**, and the `Caddyfile` explains
what would have to be stripped first if it were ever turned on: Caddy logs the
full URI including query strings, and Reverie's URIs carry meeting ids, share
tokens and search terms.

Docker's own log rotation is bounded (10 MB × 3 per service) so the boot volume
cannot fill.

---

## Cutover

Render stays live throughout. Oracle is brought up independently and proven
before any traffic moves.

1. Deploy Oracle with real `.env` values. Verify health, and verify the worker
   log line above.
2. Smoke-test against the Oracle hostname directly — sign in, list meetings,
   open a meeting. CORS will refuse a browser call from the Vercel origin until
   step 4, so use a token or a local page for this.
3. Watch it for a few hours under no load. Confirm memory is stable and nothing
   restarts.
4. **Move the frontend.** Two variables on Vercel:

   | Variable | From | To |
   |---|---|---|
   | `NEXT_PUBLIC_API_URL` | the Render backend URL | `https://$BACKEND_HOSTNAME` |
   | `NEXT_PUBLIC_WS_URL` | the Render backend URL + `/ws` | `https://$BACKEND_HOSTNAME/ws` |

   Both are `NEXT_PUBLIC_*`, which Next.js **inlines at build time**. Changing
   them requires a Vercel **redeploy**, not just an environment edit. This is
   the one step that is not instant, in either direction.

5. `APP_FRONTEND_URL` does **not** change — the frontend is still on Vercel, and
   that variable is the CORS and STOMP allowed origin. `APP_PUBLIC_URL` **does**:
   it becomes `https://$BACKEND_HOSTNAME`.
6. Once traffic is on Oracle and healthy, **suspend the Render backend** rather
   than deleting it. See the overlap note below for why not to leave both
   running indefinitely.

### Clerk

Nothing here requires a Clerk change: the backend verifies tokens against
`CLERK_JWKS_URL` and the issuer, neither of which depends on the API hostname.
If Clerk is configured with allowed origins or redirect URLs that name the
Render host, add the Oracle host there.

Production still warns that Clerk is on a **development** instance. That is a
real launch-hardening item and is **not** part of this migration.

---

## Rollback

Minutes, and no data to restore — Neon, Confluent and R2 are shared by both
deployments, so neither has state the other lacks.

1. Set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` back to the Render URL.
2. **Redeploy Vercel** (they are build-time inlined).
3. Confirm Render's `/actuator/health` is `UP`, and that `reverie-ai` on Render
   is running.
4. `docker compose down` on Oracle, or leave it up and idle — with the frontend
   pointed away it receives nothing.

Keep `render.yaml` and the Render services until Oracle has been stable for long
enough to trust. `b7c1734`'s bounded JVM configuration is what makes Render a
safe place to fall back to.

---

## Running both at once, briefly

A short overlap is safe. A permanent one is not.

**The worker is fine.** `meeting_uploaded` has **one partition** and both
instances join the consumer group `ai-service`, so Kafka assigns that partition
to exactly one of them. The other idles. No meeting is transcribed twice.

**Spring is mostly fine**, by design rather than by luck:

| | |
|---|---|
| Outbox relay | `FOR UPDATE SKIP LOCKED` — two relays divide the backlog |
| Mail outbox | same claim, plus a unique `dedupe_key` with `ON CONFLICT DO NOTHING`, so a nightly job running on both hosts still enqueues one message |
| Retention | deletions are idempotent; the second pass finds nothing left |

**The rate limiter is not.** It is process-local and deliberately so — one
backend instance is the intended steady state. Two instances means a user gets
roughly twice the allowance until one is stopped. That is degraded enforcement,
not damage, and it is the reason to keep the overlap short rather than to
redesign anything.

Do not run two Spring instances permanently.

---

## Operations

```bash
docker compose ps                        # status
docker compose logs -f --tail=100        # follow (rotation is bounded)
docker compose restart reverie-backend
docker compose down                      # stop everything

# update to a new commit
git fetch && git checkout <commit>
docker compose build && docker compose up -d
```

Recovery after a VM reboot is automatic: every service is
`restart: unless-stopped` and Docker is enabled at boot.

Rebuilding the whole host is this repository, a populated `.env`, and the DNS
record. Nothing else lives here.
