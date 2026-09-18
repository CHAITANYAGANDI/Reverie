# Deploying Reverie

**This is the canonical description of how Reverie is deployed today.** It
describes the system that is actually running, at release **v1.0.0**. Anything
elsewhere in the repository that contradicts it is out of date.

| | |
|---|---|
| Repository | `CHAITANYAGANDI/Reverie` |
| Production release | **v1.0.0** |
| Frozen release commit | `69bbf07770ba535371de39d688dde652f85fb1d1` |
| Public frontend | Vercel — **https://reverieai.in** |
| API, AI worker, database | one Oracle Cloud Ubuntu VM, Docker Compose |
| Reverse proxy / TLS | Caddy, on the same VM |

Two companion documents, and neither replaces this one:

- [`deploy/oracle/README.md`](../deploy/oracle/README.md) — the host runbook:
  provisioning the VM, first-boot order, JVM sizing, resource limits, and the
  reasoning behind each. Read it when you are working *on* the host.
- [`docs/ci-and-branch-protection.md`](ci-and-branch-protection.md) — what CI
  checks before a merge.

No secret value appears in this document, and none should ever be added to it.
See [10. Secrets and environment variables](#10-secrets-and-environment-variables).

---

## 1. Production architecture

```
                         Browser
                            │
                            │  HTTPS
                            ▼
                ┌───────────────────────┐
                │  Vercel               │   Next.js frontend
                │  reverieai.in         │   tracks `main`
                └───────────┬───────────┘
                            │  HTTPS / SockJS
                            ▼
  ═══════════════════ Oracle Cloud Ubuntu VM ══════════════════
                            │  :80 :443  (the only published ports)
                            ▼
                     ┌──────────────┐
                     │    Caddy     │  TLS, reverse proxy
                     └──────┬───────┘
                            │  edge network
                            ▼
                  ┌────────────────────┐
                  │  reverie-backend   │  Spring Boot, :8080 internal
                  └─────┬────────┬─────┘
                        │        │  internal network
                        │        ▼
                        │  ┌──────────────┐   ┌──────────────────┐
                        │  │  reverie-ai  │──▶│ reverie-postgres │
                        │  │  FastAPI     │   │ PostgreSQL 16    │
                        │  │  :8000 int.  │   │ + pgvector       │
                        │  └──────┬───────┘   │ :5432 internal   │
                        │         │           └────────┬─────────┘
                        │         │                    ▼
                        │         │             postgres_data volume
  ═════════════════════════════════════════════════════════════
                        │         │
                        ▼         ▼
            Clerk · Cloudflare R2 · Confluent Cloud · Sentry
            (+ AssemblyAI / OpenAI, from the AI worker only)
```

| Piece | Where it runs | Reached how |
|---|---|---|
| Frontend | Vercel | `https://reverieai.in` |
| `reverie-backend` | Oracle VM container | through Caddy; container port 8080 is **not** published |
| `reverie-ai` | Oracle VM container | Docker network only; port 8000 is **not** published |
| `reverie-postgres` | Oracle VM container | Docker network only; port 5432 is **not** published |
| Caddy | Oracle VM container | the only container with `ports:` — 80 and 443 |

External services, and what each is for:

| Service | Used for |
|---|---|
| **Clerk** | authentication — production configuration |
| **Cloudflare R2** | recordings, exports, and the database backup destination |
| **Confluent Cloud** | the single Kafka topic `meeting_uploaded`, backend → AI worker |
| **Sentry** | error monitoring, one project per service |
| **Resend** | the messages written to `mail_outbox` and delivered by the relay |
| **AssemblyAI / OpenAI** | transcription and LLM work, called by `reverie-ai` only |

The request path is worth stating plainly, because the container boundaries are
the security model: the browser talks to Vercel, and to the backend through
Caddy, and to nothing else on the VM. It never reaches `reverie-ai` or
PostgreSQL, and there is no published port that would let it.

---

## 2. Repository and branch model

```
feature/* · fix/* · harden/* branches
                │
                ▼
              dev          integration
                │
                ▼
              main         production
                │
                ▼
        Vercel Production
```

- **`dev` is the integration branch.** Work merges here first, by pull request,
  with CI green.
- **`main` is the production branch.** It receives `dev` as a release. Nothing
  is committed to `main` directly.
- **Vercel Production tracks `main`.** A merge into `main` is what puts a new
  frontend in front of users.
- **Production releases are tagged.** `v1.0.0` is the first frozen production
  release and points at `69bbf07770ba535371de39d688dde652f85fb1d1`.
- **Do not deploy production from a feature branch.** The Oracle host is
  checked out at a reviewed commit or tag — see
  [4. Oracle production host](#4-oracle-production-host).

The tag is a record, not a trigger. Creating one deploys nothing: Vercel
responds to `main`, and the Oracle host is updated by an operator on the VM.

---

## 3. Frontend deployment

The Next.js app is deployed on **Vercel**, from Git. There is no deploy command
to run — merging `dev` into `main` is the deployment.

| | |
|---|---|
| Production domain | `reverieai.in` |
| Production branch | `main` |
| Preview deployments | other branches, including `dev` |

Frontend environment variables live in the **Vercel project's Environment
Variables**, per environment. They are not in this repository and not in
`deploy/oracle/.env`.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_API_URL` | the backend origin, with scheme, no path and no trailing slash — `lib/api.ts` appends `/api/v1` itself |
| `NEXT_PUBLIC_WS_URL` | the same origin plus `/ws`, and **`https://`, not `wss://`** — `lib/ws.ts` uses SockJS, whose handshake is an ordinary HTTP GET |
| `NEXT_PUBLIC_AUTH_MODE` | `clerk`. Never `dev` — that mode trusts an `X-Dev-User` header |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | from the Clerk production instance |
| `CLERK_SECRET_KEY` | server-side only, read at runtime by `middleware.ts`. **Never** give it a `NEXT_PUBLIC_` prefix |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` — without it Clerk links to its own hosted pages on another domain |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |

Optional, and harmless when unset: `NEXT_PUBLIC_APP_VERSION`,
`NEXT_PUBLIC_BUILD_SHA`, `NEXT_PUBLIC_TERMS_URL`, `NEXT_PUBLIC_PRIVACY_URL`,
`NEXT_PUBLIC_SENTRY_DSN`.

**Every `NEXT_PUBLIC_*` is a build-time value.** `next build` inlines them into
the client bundle; they are not read at runtime. Changing one in the Vercel
dashboard and redeploying the *existing* build changes nothing — the old value
keeps being served. Trigger a new build. `CLERK_SECRET_KEY` is the exception:
it is read at runtime, on the server.

Secrets must never be committed. The Vercel dashboard is where the frontend's
values live, and the only place.

---

## 4. Oracle production host

An **Ubuntu** VM on Oracle Cloud. Everything that is not the frontend runs here,
in containers, under one Docker Compose project.

| | |
|---|---|
| Repository checkout | `~/reverie` |
| Production compose directory | `~/reverie/deploy/oracle` |
| Compose project name | `reverie` |
| Containers | `reverie-backend`, `reverie-ai`, `reverie-postgres`, Caddy |
| Published ports | **80 and 443 only**, both on Caddy |

Caddy terminates TLS, obtains and renews the Let's Encrypt certificate, and
proxies to the backend. It is the only container with a `ports:` entry. The
backend, the AI service and PostgreSQL stay on the Docker networks: reachable
by service name, and by nothing from outside the host.

Inspecting a running host:

```bash
cd ~/reverie/deploy/oracle

docker compose ps                     # what is up, and healthy
docker stats --no-stream              # memory and CPU against the configured limits
docker compose logs -f --tail=100     # follow (log rotation is bounded, 10 MB x 3)
docker compose logs reverie-backend
```

Updating to a new reviewed commit or tag:

```bash
cd ~/reverie
git fetch --tags
git checkout <tag-or-reviewed-commit>

cd deploy/oracle
docker compose config --quiet         # validate; prints NOTHING on success
docker compose build
docker compose up -d
```

> **`--quiet`, always, against a real `.env`.** Plain `docker compose config`
> renders the *resolved* file to stdout — every database password, the
> Confluent secret, the R2 keys, Clerk's secret key. That lands in scrollback,
> in a pasted snippet, in a screenshot. `--quiet` runs the same validation and
> prints nothing on success.

Recovery after a VM reboot is automatic: every service is
`restart: unless-stopped` and Docker is enabled at boot.

The host runbook — provisioning, the Oracle security list, DNS and the ACME
prerequisite, the first-boot ordering that only happens once, JVM sizing and
the measured resource limits — is
[`deploy/oracle/README.md`](../deploy/oracle/README.md).

---

## 5. Backend and AI deployment

Both services are built from this repository's own Dockerfiles by Compose on
the VM, and run as long-lived containers. There is no separate build server and
no registry in the path.

| | `reverie-backend` | `reverie-ai` |
|---|---|---|
| Stack | Java 21, Spring Boot 3 | Python 3.12, FastAPI |
| Internal port | 8080 | 8000 |
| Published | no | no |
| Profile / env | `SPRING_PROFILES_ACTIVE=production` | `REVERIE_ENV=production` |
| Also does | Flyway migrations on boot | consumes `meeting_uploaded`, calls back over `/internal/**` |

The `production` profile is what makes the backend fail loudly rather than come
up misconfigured. It switches on `DeploymentCheck`, which refuses to start if
any setting is still a development one and names all of them at once; it
returns 404 for `/swagger-ui`, `/v3/api-docs` and `/actuator/metrics`; and it
sets `forward-headers-strategy: framework` so the app sees Caddy's TLS
correctly. `/actuator/health` stays public and says only `UP` or `DOWN`.

`reverie-ai` **degrades rather than crashing** when Kafka or PostgreSQL is
unreachable. Its container status is therefore not evidence that it is working
— check the log line, not the badge:

```bash
cd ~/reverie/deploy/oracle

# public, through Caddy
curl -s https://<backend hostname>/actuator/health      # {"status":"UP"}

# private — from the host, never from the internet
docker compose exec reverie-ai \
  python -c "import urllib.request;print(urllib.request.urlopen('http://localhost:8000/health').read())"

# the line that proves the worker is really wired up
docker compose logs reverie-ai | grep "RAG connected to Postgres"
```

Restarting one service:

```bash
cd ~/reverie/deploy/oracle
docker compose restart reverie-backend
```

Let the backend reach `UP` before judging the worker: the backend runs the
migrations, and the worker is held until PostgreSQL is healthy anyway.

**Do not publish a container port to debug.** `expose:` without `ports:` is
what keeps 8080, 8000 and 5432 off the internet, and Docker's own iptables
rules bypass UFW, so a "temporary" `ports:` entry is a real exposure. Use
`docker compose exec`.

---

## 6. PostgreSQL + pgvector

The database is **self-hosted on the Oracle VM**. Production does not use Neon.

| | |
|---|---|
| Image | `pgvector/pgvector:pg16` |
| Container | `reverie-postgres` |
| Compose service | `postgres` — this is the name `docker compose exec` takes |
| Data | the `postgres_data` named volume |
| Port 5432 | **Docker-internal only** — there is no `ports:` entry, deliberately |
| Extension | `pgvector`, created by migration `V2` |

`pgvector/pgvector:pg16` rather than plain `postgres:16` because `V2` issues
`CREATE EXTENSION vector` and the RAG tables do not exist without it. It is the
same image family the "Migrations from empty" CI job runs every migration
against, so what boots here is what CI proves.

**`postgres_data` is the only copy of every meeting, transcript, summary and
account.** That is the fact the whole of section 7 exists for.

### Roles

The role separation is set up once, on an empty volume, by
`deploy/oracle/postgres-init/01-roles.sh`. It is load-bearing — this document
describes it and does not change it:

| Role | Attribute | Used by |
|---|---|---|
| `reverie` | owner / superuser | Flyway migrations; also the container's `POSTGRES_USER` |
| `reverie_app` | `NOBYPASSRLS` | Spring's tenant traffic and the worker's RAG traffic, so the row-level-security policies bind |
| `reverie_sys` | `BYPASSRLS` | the paths with no user behind them: worker callbacks, the outbox relay, provisioning |

The init script also sets `ALTER DEFAULT PRIVILEGES`, so tables Flyway has not
created yet are usable the moment it creates them. It runs **only** on a fresh
volume — changing a password in `.env` afterwards changes what the applications
present, not what the database expects. Rotating one is documented in
[`deploy/oracle/README.md`](../deploy/oracle/README.md#rotating-a-database-password).

No username or password belongs in this file, and none is here. The names above
are role names, which are structure; the values live only in the host's `.env`.

---

## 7. Backups and restore

The database is backed up by a **systemd timer on the Oracle host**.

| | |
|---|---|
| Script | `/usr/local/sbin/reverie-db-backup` |
| Timer | `reverie-db-backup.timer` — enabled and active |
| Service | `reverie-db-backup.service` |
| Destination | the dedicated Cloudflare R2 backup location |

> **These live on the host, not in this repository.** The script and the two
> unit files are installed on the VM and are not tracked here, so cloning the
> repository does not give you a backup system — provisioning one is a host
> step. This section documents what the running host does.

### What one run does

1. **Dump** the PostgreSQL database.
2. **Validate the archive** before it is trusted.
3. **Upload** it to the dedicated Cloudflare R2 backup location.
4. **Read the uploaded object back.**
5. **Verify the checksum** of what came back against what was sent.

The upload is not the end of the run. A backup that was written but cannot be
read is the failure this sequence exists to catch, which is why step 4 is a
separate step from step 3.

The most recent observed run completed successfully and passed checksum
verification.

### Checking it

```bash
systemctl status reverie-db-backup.timer --no-pager

journalctl -u reverie-db-backup.service -n 50 --no-pager
```

`systemctl list-timers reverie-db-backup.timer --no-pager` shows when it last
ran and when it is next due.

### Retention

Two cleanups, configured separately, and they are not the same mechanism:

- **Local copies on the VM** are pruned by the configured local cleanup.
- **Remote copies in R2** expire under a bucket lifecycle rule on the backup
  prefix.

Both are configured for roughly a **week**. A lifecycle rule is a policy rather
than a scheduled job: it sets the age at which an object becomes eligible for
deletion, and the provider executes it on its own cadence. Say it that way and
do not promise an exact deletion moment — the user-facing privacy copy is
deliberately worded as "about a week", and that wording should not be
tightened.

`FREE_TIER_IDENTITY_HMAC_SECRET` must be backed up **with** the database.
Restoring one without the other resets every account's lifetime free allowance,
silently.

### Restore

Restoring a dump into the running stack, from a file already on the host:

```bash
cd ~/reverie/deploy/oracle

docker compose exec -T postgres \
  pg_restore -U <owner-role> -d <database> --clean --if-exists < <dump-file>
```

`-T` matters: without it Compose allocates a TTY and carriage returns corrupt
the stream.

Taking an ad-hoc dump by hand, for a scratch restore or before a risky change:

```bash
cd ~/reverie/deploy/oracle

docker compose exec -T postgres \
  pg_dump -U <owner-role> -d <database> --format=custom \
  > "reverie-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

`--format=custom` so it restores selectively with `pg_restore`.

**What this repository cannot tell you, and you must get from the host:** the
name of the R2 backup bucket and prefix, the credentials and the client the
host uses to reach them, and therefore the exact command that pulls a specific
backup object down before the `pg_restore` above. Those are operator-specific
and are not invented here. Read them from the installed
`/usr/local/sbin/reverie-db-backup`, which is the authority on where its own
output went.

An untested dump is a belief rather than a backup. Restore one into a scratch
database and count rows before you need to rely on it.

---

## 8. Monitoring and production checks

There is **no automated alerting**. Everything below is somebody looking, and
that is worth being honest about rather than implying a pager that does not
exist.

On the host:

```bash
cd ~/reverie/deploy/oracle
docker compose ps
docker stats --no-stream
systemctl status reverie-db-backup.timer --no-pager
journalctl -u reverie-db-backup.service -n 30 --no-pager
```

Off the host:

- **Vercel** — the latest Production deployment succeeded and is the commit you
  expect.
- **Sentry** — new production errors, in the three projects below.
- **reverieai.in** — load it. The [smoke test](#9-production-smoke-test) is the
  longer version; loading the landing page and signing in is the short one.

What to look at first when something is wrong: `docker compose ps` for a
container that is restarting, `docker stats --no-stream` for one sitting near
its memory limit, and
`docker compose logs reverie-ai | grep "RAG connected to Postgres"` for a
worker that is up but not wired up.

### Sentry

Three projects, because three services fail for unrelated reasons:

| Project | Configured in | Variable |
|---|---|---|
| `reverie-frontend` | Vercel | `NEXT_PUBLIC_SENTRY_DSN` |
| `reverie-backend` | the host's `.env` | `SENTRY_DSN_BACKEND` → `SENTRY_DSN` in the container |
| `reverie-ai` | the host's `.env` | `SENTRY_DSN_AI` → `SENTRY_DSN` in the container |

Both services read a variable literally called `SENTRY_DSN`, which is why the
`.env` names them apart and `docker-compose.yml` maps each to the right
container. They **must not** share a value: both would report, nothing would
error, and the alerts would merge into a stream nobody can attribute.

Leaving any DSN unset is supported. Monitoring off changes nothing else, and a
missing or malformed DSN never prevents startup — observability is not allowed
to be the reason a deployment will not boot.

Nothing sent to Sentry carries transcripts, recordings, questions, prompts,
model output, summaries, action items, request or response bodies, headers,
cookies, tokens, email addresses, names, IP addresses, or
meeting/folder/user identifiers. No exception object is handed to Sentry by any
of the three services; events are built from a fixed vocabulary — a generic
label, a boundary or component, a normalized route shape, an exception type
name. Session Replay, tracing, profiling, automatic breadcrumbs, automatic PII
and log forwarding are switched off explicitly in all three.

---

## 9. Production smoke test

Run against **https://reverieai.in** after a release. Manual, and short enough
that it actually gets run.

| # | Check | Passes when |
|---|---|---|
| 1 | **Landing page** | loads, no console errors, links render |
| 2 | **Privacy & Demo Notice, signed out** | reachable and readable without an account |
| 3 | **Sign in / sign up** | the Clerk flow completes and lands in the app |
| 4 | **Home** | recent meetings and open action items render |
| 5 | **Record page** | opening it does **not** start recording — capture begins only on an explicit Start |
| 6 | **Short recording** | record a few seconds, stop, and it is accepted |
| 7 | **Transcript processing** | status advances and the meeting reaches READY |
| 8 | **Import / upload** | a file upload is accepted and processes |
| 9 | **Meeting brief** | transcript, summary and action items all present |
| 10 | **Ask Reverie** | a question returns a grounded answer with citations |
| 11 | **Library / search** | search finds the meeting just created |
| 12 | **Settings** | loads, and saves a change |
| 13 | **Sign out, sign back in** | the session ends, and the same account's data is there again |

Step 5 is not a formality. A recording page that arms itself on navigation is a
privacy failure, and it is the one thing on this list that is invisible when it
is wrong.

---

## 10. Secrets and environment variables

**No real secret value belongs in this repository, in this document, or in any
example file.** The templates in the repository carry variable *names* and
placeholder values, and that is all they may ever carry:

- [`deploy/oracle/.env.example`](../deploy/oracle/.env.example) — the
  production host's template.
- [`.env.example`](../.env.example) — the local development template.

Where each value actually lives:

| Consumer | Where its values are set |
|---|---|
| Frontend | the **Vercel** project's Environment Variables, per environment |
| `reverie-backend`, `reverie-ai`, `reverie-postgres`, Caddy | **`~/reverie/deploy/oracle/.env`** on the VM, `chmod 600`, never in Git |

Rules, and they are not negotiable:

- Secrets belong in the deployment environment or a secret manager — Vercel's
  environment variables, or the host's `.env`.
- `.env` files containing secrets must **not** be committed. `.env` is
  gitignored at every depth; `.env.example` is the only tracked half of the
  pair.
- Production values must **never** be copied into an example file, a README, an
  issue, or a pasted terminal snippet.
- Validate a populated Compose file with `docker compose config --quiet`, never
  plain `config`, which renders every resolved secret to stdout.

### One `.env`, and no service receives all of it

`deploy/oracle/docker-compose.yml` deliberately has no `env_file:` on any
service. Each lists the variables it reads and is handed nothing else.

| Container | Gets |
|---|---|
| Caddy | the hostname and the ACME contact address — nothing else |
| `reverie-postgres` | the three database passwords, and nothing else |
| `reverie-backend` | the datasources, Confluent (as a JAAS line), Clerk, the free-tier HMAC, R2, Resend, its own Sentry DSN, the internal token |
| `reverie-ai` | Confluent (as username/password), R2, the **unprivileged** database role, provider keys, its own Sentry DSN, the internal token |

What that buys is blast radius. The worker feeds untrusted media to `ffmpeg`,
so it is the most likely thing here to be compromised and it holds the least:
no schema-owner password, no Clerk secret key, no free-tier HMAC. In the other
direction the backend holds no provider key, because it never calls a provider.

Two things are genuinely shared and have to be: `REVERIE_INTERNAL_TOKEN`, the
shared secret on `/internal/**` — both sides need it or every worker callback
is a 401 — and the R2 credentials, since both read and write objects.

### The ones that fail by working

Every item here starts cleanly and is wrong anyway. That is what earns them a
list.

| Variable | What a wrong value does |
|---|---|
| `REVERIE_AUTH_MODE` | `dev` trusts an `X-Dev-User` header, so any request can impersonate any user. Production is `clerk` |
| `REVERIE_INTERNAL_TOKEN` | has no default. Unset means `/internal/**` refuses everything: meetings pile up in PROCESSING and the worker logs 401s — loud, and better than silently accepting callbacks from anyone |
| `APP_FRONTEND_URL` | the Vercel origin, and the only allowed CORS **and** STOMP origin. Wrong, and every browser request fails while the backend stays healthy |
| `APP_PUBLIC_URL` | where *this API* is reachable publicly, used by the calendar feed. Wrong, and subscribed calendars quietly stop updating |
| `NEXT_PUBLIC_API_URL` | scheme-less is read as a *relative* path, so the app calls itself; unset falls back to localhost, so every request goes to the visitor's own machine |
| `CLERK_SECRET_KEY` | `clerkMiddleware` reads it implicitly — there is no `process.env.CLERK_SECRET_KEY` to grep for. Without it the site answers 500, including the marketing page |
| `FREE_TIER_IDENTITY_HMAC_SECRET` | changing it makes every returning account look new and hands out another allowance, silently |
| `S3_PUBLIC_ENDPOINT` on `reverie-ai` | unset does not fail; AssemblyAI simply stops fetching from R2 itself, and every file crosses the container twice |

`DeploymentCheck` catches most of the first group at startup, names every
offending setting at once, and refuses to boot. That is the intended outcome.

---

## 11. External services

The provisioning detail that is still accurate, kept in one place. Nothing here
changes the architecture in section 1.

### Clerk

Production runs the **Clerk production configuration**. A development instance
— `pk_test_` / `sk_test_` keys, an issuer ending `.accounts.dev` — is not a
production instance with a different name: separate user list, relaxed session
handling, and a sign-in flow that depends on a dev-browser cookie. The backend
logs a warning whenever it sees `.accounts.dev` and starts anyway, because it
cannot tell staging from production; in production that line means the wrong
instance is wired up.

| Variable | Set in |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Vercel (build-time) |
| `CLERK_SECRET_KEY` | Vercel **and** the host `.env` — the same value, runtime only |
| `CLERK_ISSUER`, `CLERK_JWKS_URL` | the host `.env` |
| `FREE_TIER_IDENTITY_HMAC_SECRET` | the host `.env`; back it up with the database |

Add `reverieai.in` to the Clerk instance's allowed domains. Add an `email`
claim to the JWT template: Clerk's default session token carries none, and the
address is what a user sees on their own profile and what queued messages are
delivered to. The free allowance no longer depends on that claim alone — with
`CLERK_SECRET_KEY` set the backend resolves the verified primary address from
Clerk's Backend API — but the claim still saves a round trip.

### Cloudflare R2

One bucket for application objects (`S3_BUCKET`), plus the dedicated backup
location used by [section 7](#7-backups-and-restore). Both services need the
same credentials, and the token must have **write**: MP3 export writes the
converted copy back, so a read-only token produces a conversion that runs,
succeeds, and fails on the last step every time.

| Variable | Notes |
|---|---|
| `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_PUBLIC_ENDPOINT` | the same host unless a custom domain fronts the bucket; needed on **both** services |
| `S3_REGION` | `auto` — R2 accepts nothing else |
| `S3_BUCKET` | the same on both services; a mismatch is not an error, it is one service writing where the other never looks |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | object read **and** write |

**The bucket must allow the app's origin to GET and PUT**, or upload and MP3
export fail in the browser with nothing in any server log. The browser talks to
R2 directly with a presigned URL — deliberately not proxied through Spring,
because an hour of audio through a request thread is a denial-of-service tool
with a login. In **R2 → the bucket → Settings → CORS policy**:

```json
[
  {
    "AllowedOrigins": ["https://reverieai.in"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

`AllowedHeaders` must include `content-type`: `uploads.ts` sets it, which makes
the PUT a preflighted request. `AllowedOrigins` is the frontend origin — the
same value as `APP_FRONTEND_URL` — plus any other origin that uploads or
exports. Do not make the bucket public; everything is served by presigned URL.

### Confluent Cloud

One topic, **`meeting_uploaded`**, **1 partition**. It carries job dispatch from
the backend's outbox to the AI worker; break it and nothing transcribes. Every
stage the UI shows travels over the internal HTTP callbacks instead, so the
volume here is one message per meeting.

Confluent enforces a replication factor of 3 and rejects an explicit 1, so
`KafkaTopicsConfig` asks for `replicas(-1)` — Kafka's sentinel for "broker
default". Do not change it back to a literal.

The two services take the same credential in different shapes, and the variable
names differ on purpose:

| | Bootstrap variable | Credential |
|---|---|---|
| backend | `SPRING_KAFKA_BOOTSTRAP_SERVERS` | `KAFKA_SASL_JAAS_CONFIG`, the whole JAAS line |
| AI worker | `KAFKA_BOOTSTRAP_SERVERS` | `KAFKA_SASL_USERNAME` / `KAFKA_SASL_PASSWORD` |

Both also take `KAFKA_SECURITY_PROTOCOL=SASL_SSL` and
`KAFKA_SASL_MECHANISM=PLAIN`. Two things bite: the **trailing semicolon** on the
JAAS string is required, and its absence is reported as an authentication
failure rather than a parse error; and setting the wrong bootstrap variable
leaves that service quietly pointed at `localhost:9092`.

Neither service crashes when Kafka is unreachable — they degrade. The positive
signal is in the worker's log, and a meeting stuck at `QUEUED` with a growing
`SELECT count(*) FROM outbox_events WHERE published = FALSE` is the symptom.
That is designed behaviour: `OutboxPublisher` retries and preserves order, so an
outage queues meetings rather than losing them.

There is **no consumer-lag alert**. With one partition and one worker, nothing
notices a stuck message except somebody looking. Configuring one in Confluent —
consumer group `ai-service`, topic `meeting_uploaded`, lag above 5 for 15
minutes — is the obvious first alert to add.

### Resend

`RESEND_API_KEY` and `REVERIE_MAIL_FROM`, both in the host `.env`. The
from-address must be on a **domain verified in Resend**, and must match the
domain that is actually verified — verifying a subdomain does not verify the
root, or the other way round. `DeploymentCheck` refuses to start on `resend.dev`,
`example.*`, `localhost`, `test` and `invalid`, but it cannot tell a verified
real domain from an unverified one: that failure is silent, with messages
queued, retried for about five hours, and abandoned.

Resend places SPF and MX records on a `send.` subdomain even when the sending
domain is the root. That subdomain is the Return-Path for bounces, **not** a
second verified sender.

The self-only mode — `REVERIE_MAIL_SELF_ONLY=true` plus
`REVERIE_MAIL_SELF_USER_ID`, the Clerk user id — is for a deployment whose only
account is the operator's. It is enforced, not advisory: `SelfOnlyAccess`
refuses provisioning for every other Clerk subject with a 403, before any row is
written. **Both variables, or the service will not start**, and the id is
per-Clerk-instance. Unsetting it means deleting the variable, not blanking it —
Spring's `${VAR:false}` default applies only when the variable is *absent*.

### Not provisioned, deliberately

- **No Redis.** The one counter it held — burst protection on the
  streaming-token endpoint, 30 requests per user per 10 minutes — is a map
  inside the backend. That makes it per-instance, which is the one thing a
  second backend would change. If a Redis database still exists for this
  project, delete it or revoke its credentials: nothing has connected to it,
  and an unused datastore with live credentials is worse than one in use.
- **No billing.** Stripe checkout and its webhook were removed in V49. Every
  account gets the same allowance — 100 transcribed minutes and 3 imports, for
  the life of the account — so there is nothing for a payment to buy.

---

## 12. What is not covered

Stated as gaps rather than left to be discovered.

- **No automated deployment to the Oracle host.** CI checks a pull request; it
  does not deploy. An operator updates the checkout and runs Compose.
- **No alerting.** Sentry reports errors when somebody reads it. There is no
  pager, no uptime monitor and no consumer-lag alert.
- **One Kafka partition, one AI worker.** `meeting_uploaded` has a single
  partition and the worker consumes it serially, so one slow meeting delays
  every meeting behind it, and a second worker would idle. More partitions is
  the change, and it is a Confluent-side change first.
- **Rate limiting is per-instance.** Two backends would allow twice the limit.
  It is burst protection rather than a quota. The outbox is *not* on this list:
  `OutboxPublisher.publishBatch()` claims rows with `FOR UPDATE SKIP LOCKED`,
  so two backends divide the backlog.
- **No bounce handling.** Resend accepting a message is where Reverie's
  knowledge ends; a hard bounce is not fed back and nothing reconciles the row.
- **Mail delivery is at-least-once.** Each row is sent under a dedupe key passed
  as Resend's `Idempotency-Key`, which Resend honours for 24 hours. Automatic
  retries happen well inside that window; a manual replay after it can
  duplicate.
- **The SLO is not met and is not claimed.** The launch target for
  `list-meetings` is 50 VUs, p95 < 200 ms. See
  [`docs/load-testing-report.md`](load-testing-report.md) and the Performance
  section of [`deploy/oracle/README.md`](../deploy/oracle/README.md); the
  measurements there are local and CPU-bound, and are not evidence about the
  Oracle host.
