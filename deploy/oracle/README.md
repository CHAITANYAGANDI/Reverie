# Reverie on Oracle Cloud (Ampere A1, ARM64)

> **This is the host runbook.** It covers provisioning and operating the VM.
> The canonical description of the production deployment as a whole —
> architecture, branch model, frontend, backups, monitoring, the smoke test —
> is [`docs/deploy.md`](../../docs/deploy.md). Read that first if you want to
> know how Reverie is deployed; read this if you are working on the host.

Both compute services — `reverie-backend` (Spring Boot) and `reverie-ai`
(FastAPI) — on one Always Free Ampere A1 VM, behind Caddy. This is where
production runs.

**The database is here too.** PostgreSQL 16 with pgvector runs in this stack,
on a named volume, reachable only on the private bridge. Confluent Cloud holds
the broker, Cloudflare R2 the recordings, Vercel the frontend.

That is what makes this VM different from a stateless one. It used to own no
user data, which made it disposable: a replacement was this repository, a
populated `.env` and a DNS record. It is not disposable now —
`postgres_data` is the only copy of every meeting, transcript and account. See
[Backups](#backups).

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
      Confluent ◀───────┘        │ internal network
             R2 ◀───────┘        ▼
                   ┌──────────────┐   ┌──────────────┐
                   │  reverie-ai  │   │  postgres    │  :5432
                   │    :8000     │──▶│  + pgvector  │  (not published,
                   └──────┬───────┘   └──────┬───────┘   never on the host)
                          │                  │
                          │                  └──▶ postgres_data volume
                          └──▶ Confluent, R2, providers
```

---

## Why this exists

*Historical. Reverie previously ran its two compute services on Render. That
is no longer the case and there is nothing on Render to fall back to — this
section records why the move happened, because the numbers in
[JVM sizing](#jvm-sizing) and [Resource limits](#resource-limits) came out of
it.*

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
| Memory | 6 GB |
| Boot volume | 50 GB |
| Image | Canonical Ubuntu 24.04 LTS (**aarch64** build) |

**Sized from what Reverie measured, not from what the free tier allows.** The
Always Free A1 allowance is up to 4 OCPU and 24 GB, but the two services
together settle around 720 MB and peak near 730 MB; asking for 12 GB would be
claiming shared capacity to leave it idle, on a tier where capacity is the thing
in short supply.

6 GB with containers limited to 2 GB + 1 GB leaves **~3 GB unallocated** for the
kernel, Docker itself, Caddy, page cache, TLS and network buffers, and transient
`ffmpeg` work — comfortably more than that list needs, which is the point: the
headroom is deliberate, not leftover.

Taking 2 OCPU rather than 1 is a separate judgement. Each container is capped at
1 CPU, and a host with exactly 2 would have nothing left for the kernel, Caddy
or an `ffmpeg` burst when both containers are busy. It also keeps the JVM's
ergonomic choices stable — the backend sees one CPU and picks SerialGC, which is
what every measurement here was taken under.

Half the memory allowance and half the OCPU allowance remain free for a second
instance or for growing this one.

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

**Do not install PostgreSQL on the host.** It runs as a container in this
stack, on the `postgres_data` volume, and a second copy installed on the host
is a second database for somebody to connect to by accident.

**Do not install Kafka or MinIO at all.** Those are Confluent and R2, and a
local copy of either puts user data somewhere nothing is backing up.

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

docker compose config --quiet     # validate; prints NOTHING on success
docker compose build              # ~10-20 min on 2 OCPU, first time only
docker compose up -d

docker compose ps
docker compose logs -f reverie-backend
```

### What happens on the very first boot, in order

It matters because it only happens once, and because the step that sets up the
database is invisible if you are watching the backend's log.

1. **`postgres` starts on an empty `postgres_data` volume.** The image runs
   `initdb`, creates the `reverie` database and the `reverie` superuser from
   `POSTGRES_USER`/`POSTGRES_PASSWORD`, then — because the data directory was
   empty — executes everything in `/docker-entrypoint-initdb.d`.
2. **`postgres-init/01-roles.sh` runs, as the owner** — against a *temporary*
   server the entrypoint starts with `listen_addresses=''`, so it is reachable
   on the Unix socket and not over TCP. The script creates `reverie_app`
   (`NOBYPASSRLS`) and `reverie_sys` (`BYPASSRLS`), sets their passwords from
   the environment, grants schema usage and DML, and — the part that matters —
   sets `ALTER DEFAULT PRIVILEGES` so that tables Flyway has *not created yet*
   are usable the moment it creates them.
3. **The entrypoint stops the temporary server and starts the real one**, this
   time listening on TCP.
4. **The healthcheck starts passing.** `pg_isready -h 127.0.0.1` is refused
   until step 3, which is what makes it a gate rather than a formality.

   That `-h` is load-bearing. Without it `pg_isready` asks over the Unix
   socket, which the *temporary* server of step 2 is already answering — so the
   gate would open while the role script was still running. The failure that
   causes is not a refused connection, which would at least be obvious: Flyway
   logs in as the owner, which `initdb` created in step 1, so the migrations
   could run before `ALTER DEFAULT PRIVILEGES` had been set. The tables would
   be created without the runtime grants, and you would have a database that
   migrated cleanly and answers every application query with `permission denied
   for table`.
5. **`reverie-backend` and `reverie-ai` start**, held until then by
   `depends_on: condition: service_healthy`.
6. **Flyway runs, as `reverie`.** `V2` issues `CREATE EXTENSION vector` — which
   is why the owner is a superuser and why the image is `pgvector/pgvector` —
   and the 69 migrations create the schema. Every table lands with the grants
   from step 2 already attached.
7. **Spring connects as `reverie_app` and `reverie_sys`** through its two
   Hikari pools, and the worker opens its psycopg pool as `reverie_app`.

Steps 1–2 never run again. `docker-entrypoint-initdb.d` is skipped whenever the
data directory is non-empty, so a restart, a rebuild or a `docker compose down`
(without `-v`) leaves the roles and the data exactly as they were.

If step 2 fails — a missing password, say — the container exits non-zero and
the volume is left half-built. Do not "fix it forward": remove the volume with
`docker compose down -v` and start again, or you will have a database whose
roles do not match the script.

> **`--quiet`, and never without it against a real `.env`.** Plain
> `docker compose config` renders the *resolved* file to stdout, which means
> every value in `.env` — the three database passwords, the Confluent API secret, the R2
> keys, Clerk's secret key, the free-tier HMAC — printed in full. That lands in
> terminal scrollback, in anything piped to a file, in a pasted snippet and in a
> screenshot. `--quiet` performs exactly the same validation and prints nothing
> on success, exiting non-zero with the error if the file is wrong.
>
> Rendering the full config is a reasonable thing to do while working on the
> Compose file itself — but do it with `.env.example` values, not production
> ones.

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
a 512 MB container, where 31 % is a 159 MB heap. Against this 2 GB limit the
same percentage is ~635 MB, which is a different decision that nobody made —
and it would move again the next time the container is resized.

Oracle gets explicit `-Xms`/`-Xmx` instead, because the container size is known
and fixed and a deterministic heap is easier to reason about than a percentage
of a number that might change:

```
-Xms512m -Xmx1024m
```

Chosen by comparison, on a **3 GB** / 1 CPU container against disposable
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

**These numbers were taken in a 3 GB container and the limit is now 2 GB.** They
still stand, and deliberately were not re-run to make the document tidy: the
process peaked at 589 MB, so it never came within 2.4 GB of the old ceiling and
the limit was never a variable in the result. What the smaller limit changes is
the margin above the worst case, and that is arithmetic rather than
measurement — see [Resource limits](#resource-limits).

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

What was measured locally, on a **3 GB** / 1 CPU container (the limit has since
been cut to 2 GB — see the note under [JVM sizing](#jvm-sizing)), warmed to
plateau:

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
- **no OOM**, no cgroup `max` events, memory flat at 581 MB (of the 3072 MB
  limit in force at the time; 28 % of the 2048 MB limit now configured)
- **sane GC**: 233 minor and 1 major collection across 31.9 GB allocated
- no behavioural regression against the previous baseline

**The SLO is validated on the real Ampere A1 after provisioning, not here.**
If p95 < 200 ms is not met on native hardware, that is a genuine blocker and is
treated as one.

---

## Resource limits

| Service | Memory | CPU | Measured | Why that limit |
|---|---|---|---|---|
| `reverie-backend` | 2 GB | 1.0 | 581 MB settled, 589 MB peak | ~3.5× the peak, and still ~700 MB spare in the worst case below |
| `reverie-ai` | 1 GB | 1.0 | 98 MB idle, 143 MB peak | ~7× the peak; the headroom is for `ffmpeg` and concurrent exports |
| `postgres` | 1.5 GB | 1.0 | **not yet measured here** | `shared_buffers` 256 MB + 50 × `work_mem` 8 MB worst case + backends; conservative until it has run under real traffic |
| host remainder | **~1.3 GB** | — | — | kernel, Docker, Caddy (uncapped), page cache |

**The host budget got tight when the database moved in, and it is worth being
explicit about it.** 2 + 1 + 1.5 GB of hard limits on a 5.8 GiB host with **no
swap** leaves roughly 1.3 GB for everything else — and two things live in that
1.3 GB that did not before:

- **Caddy has no `mem_limit`.** It is small and steady, but it is uncapped, so
  under memory pressure the kernel's OOM killer chooses among the containers
  by score rather than by importance.
- **`effective_cache_size=1GB` is a promise about the page cache** that the
  remaining 1.3 GB now has to keep while also holding the kernel and Docker.
  It is a planner hint, not an allocation, so nothing crashes if it is wrong —
  queries just get worse plans.

Nothing here is over-committed and there is no swap to hide a mistake in, which
is the right trade for a database host. But this is the number to watch first:
if `free -h` available memory sits below ~500 MB under normal traffic, reduce
`postgres` to 1 GB before raising anything.

The number the backend limit has to satisfy is the **worst case**, not the
average: `-Xmx1024m` fully committed, plus the JVM floor this application
carries — ~132 MB metaspace, ~17 MB compressed class space, ~71 MB code cache,
and ~110 MB of thread stacks, GC structures and JIT arenas — is about **1.35 GB**
against a 2 GB limit. That is the arithmetic 512 MB could not satisfy on Render,
done properly this time.

Deliberately not the whole VM. If `reverie-backend` ever sits above ~1.5 GB
steady, that is a regression to investigate — not a limit to raise.

---

## Secrets, and who gets which

There is **one** `.env` for the operator to manage, and **no service receives all
of it**. `docker-compose.yml` deliberately has no `env_file:` on any service;
each one lists the variables it reads and is handed nothing else.

| | Gets |
|---|---|
| `caddy` | `BACKEND_HOSTNAME`, `ACME_EMAIL` — the two names its Caddyfile reads |
| `postgres` | the three database passwords, and nothing else — no broker, no provider key, no Clerk |
| `reverie-backend` | the database (runtime + system + Flyway), Confluent via `KAFKA_SASL_JAAS_CONFIG`, Clerk, the free-tier HMAC, R2, Resend, its own Sentry DSN, the internal token |
| `reverie-ai` | Confluent via `KAFKA_SASL_USERNAME`/`PASSWORD`, R2, `PG_*` as the **unprivileged** role, provider keys, its own Sentry DSN, the internal token |

What that buys is a blast radius. The worker takes an arbitrary media file from
an untrusted uploader and feeds it to `ffmpeg`, a large C codebase with a long
history of parser CVEs — it is the most likely thing here to be compromised, and
it is the container that should hold the least. It no longer has Flyway's
password (the schema owner, which can drop the RLS policies), Clerk's secret
key, the free-tier HMAC, or either Spring datasource credential. In the other
direction Spring has no OpenAI or AssemblyAI key, because it never calls a
provider.

Only two things are genuinely shared, and both have to be:

- `REVERIE_INTERNAL_TOKEN` — the shared secret on `/internal/**`. Both sides
  need it or every worker callback is a 401.
- R2 — both read and write objects.

The lists were derived from code, not assumed: the worker's from the fields on
its pydantic `Settings` (`ai-service/app/config.py`), Spring's from the `${...}`
placeholders in `application.yml` and its `@Value` bindings. Anything not on
those lists would be ignored by the process anyway, so passing it would widen
exposure and buy nothing.

### A note on the syntax

Entries are bare names (`- FLYWAY_URL`) rather than `FLYWAY_URL: ${FLYWAY_URL}`.
Both read from `.env`, but they differ when a variable is **absent**: a bare
name leaves it unset, while interpolation sets it to `""`. An empty string is
not the same as absent — it overrides the default in `application.yml`, so an
unset `S3_REGION` would arrive as `""` rather than falling back. The two
exceptions interpolate because the name changes (`SENTRY_DSN_BACKEND` →
`SENTRY_DSN`), where blank is the documented "monitoring off" state anyway.

---

## Backups

`postgres_data` is the only copy of every meeting, transcript, summary and
account in the product, so this host takes its own backups.

**Scheduled backups are a systemd timer on this VM**, not something in this
repository. The script and the two unit files are installed on the host and are
not tracked here — cloning the repository does not give you a backup system.

| | |
|---|---|
| Script | `/usr/local/sbin/reverie-db-backup` |
| Timer | `reverie-db-backup.timer` — enabled and active |
| Service | `reverie-db-backup.service` |
| Destination | the dedicated Cloudflare R2 backup location |

One run dumps the database, validates the archive, uploads it, reads the
uploaded object back and verifies its checksum. Local copies are pruned by the
configured local cleanup; remote copies expire under an R2 lifecycle rule on
the backup prefix. Both are configured for roughly a week.

```bash
systemctl status reverie-db-backup.timer --no-pager
journalctl -u reverie-db-backup.service -n 50 --no-pager
systemctl list-timers reverie-db-backup.timer --no-pager
```

An ad-hoc dump by hand, as the owner — for a scratch restore, or before a risky
change:

```bash
docker compose exec -T postgres \
  pg_dump -U <owner-role> -d <database> --format=custom \
  > "reverie-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

`--format=custom` so it restores selectively with `pg_restore`, and `-T` so
Compose does not allocate a TTY and corrupt the stream with carriage returns.

Restoring that dump:

```bash
docker compose exec -T postgres \
  pg_restore -U <owner-role> -d <database> --clean --if-exists < reverie-TIMESTAMP.dump
```

An untested dump is a belief, not a backup. Restore one into a scratch
container and count the rows before you rely on it.

`FREE_TIER_IDENTITY_HMAC_SECRET` must be backed up **with** the database.
Restoring one without the other resets every account's lifetime free
allowance, silently — see the note on that variable in `.env.example`.

Fetching a specific backup object out of R2 needs the bucket, prefix and client
the installed script uses; those are host-specific and are not reproduced here.
[`docs/deploy.md`](../../docs/deploy.md#7-backups-and-restore) says the same and
says what is missing.

---

## Rotating a database password

`postgres-init/01-roles.sh` runs **once**, on an empty volume. Editing a
password in `.env` afterwards changes what the applications present and not
what the database expects, so the next boot fails to authenticate. Change both,
in this order:

```bash
# 1. In the database, as the owner. Quote the literal.
docker compose exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U reverie -d reverie \
  -c "ALTER ROLE reverie_app PASSWORD 'the-new-one'"

# 2. Then in .env, the same value, and restart what reads it.
$EDITOR .env
docker compose up -d reverie-backend reverie-ai
```

`reverie_sys` is the same with `REVERIE_DATASOURCE_SYSTEM_PASSWORD`. The owner
(`FLYWAY_PASSWORD`) is also the container's `POSTGRES_PASSWORD`, so rotating it
means `ALTER ROLE reverie` plus the same edit, and a restart of `postgres`
itself.

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

## One backend instance

One `reverie-backend` is the intended steady state, and the rate limiter is the
reason. It is a process-local map, deliberately: two instances would give a
user roughly twice the allowance. That is degraded enforcement rather than
damage, but it is why a second instance is a short-lived thing during a
restart and not a configuration.

Everything else is safe on more than one, by design rather than by luck:

| | |
|---|---|
| Outbox relay | `FOR UPDATE SKIP LOCKED` — two relays divide the backlog |
| Mail outbox | same claim, plus a unique `dedupe_key` with `ON CONFLICT DO NOTHING`, so a nightly job running twice still enqueues one message |
| Retention | deletions are idempotent; the second pass finds nothing left |
| AI worker | `meeting_uploaded` has **one partition**, so Kafka assigns it to exactly one consumer in the `ai-service` group. A second worker idles; no meeting is transcribed twice |

---

## Historical: the migration onto this host

*Kept because the reasoning is referenced above, not because anything here is
still a live procedure.*

The two compute services previously ran on Render, and the database on Neon.
Both moved here: Render's 512 MB Starter limit could not hold the JVM (see
[Why this exists](#why-this-exists)), and the database followed so that
`postgres_data` is the only copy rather than one of two.

The cutover was a Vercel change — `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL`
repointed at this host and the frontend rebuilt, because `NEXT_PUBLIC_*` is
inlined at build time — plus `APP_PUBLIC_URL` on the backend.
`APP_FRONTEND_URL` did not change: the frontend was on Vercel before and is on
Vercel now.

**There is no Render rollback.** Once meetings were written to `postgres_data`
here, going back would have been a data migration rather than a config change,
and the Render services are not a warm standby. Recovery from a bad release is
a checkout of a known-good commit or tag and a rebuild
([Operations](#operations)); recovery from data loss is
[Backups](#backups).

---

## Operations

```bash
cd ~/reverie/deploy/oracle

docker compose ps                        # status
docker stats --no-stream                 # memory and CPU against the limits above
docker compose logs -f --tail=100        # follow (rotation is bounded)
docker compose restart reverie-backend
docker compose down                      # stop everything

# the backup timer
systemctl status reverie-db-backup.timer --no-pager
journalctl -u reverie-db-backup.service -n 30 --no-pager

# update to a new reviewed commit or tag
cd ~/reverie && git fetch --tags && git checkout <tag-or-commit>
cd deploy/oracle
docker compose config --quiet            # validate; prints NOTHING on success
docker compose build && docker compose up -d
```

Recovery after a VM reboot is automatic: every service is
`restart: unless-stopped` and Docker is enabled at boot.

Rebuilding the host needs this repository, a populated `.env`, the DNS record —
and a restored database, because `postgres_data` is here and is the only copy.
The backup script and its systemd units are installed on the host too, and are
not in this repository. See [Backups](#backups).
