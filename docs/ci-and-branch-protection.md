# CI, and the branch protection it is for

## What runs

`.github/workflows/ci.yml`, on pull requests into `dev` and `main` and on pushes
to either. Four jobs, in parallel:

| Job | Name as GitHub reports it | What it proves |
| --- | --- | --- |
| `frontend` | **Frontend** | `npm ci` → lint → typecheck → Vitest → production `next build` |
| `backend` | **Spring** | `mvn verify` — the full suite, then packaging |
| `ai-service` | **AI service** | `pip install -r requirements.txt` → `pytest` |
| `migrations` | **Migrations from empty** | every Flyway migration against a real PostgreSQL, then Hibernate mapping against the result |

The four names in the middle column are what you select as required status
checks. They come from each job's `name:`, so renaming a job silently unsets
its protection — GitHub keeps requiring a check that no longer reports.

### Why `migrations` is separate

It answers a different question from the other three. They ask "does the code
pass"; it asks "can this schema be built from nothing", which is what a new
environment does and what no unit test exercises. It runs
`ApplicationContextSmokeTest` against the `pgvector/pgvector:pg16` service
container, which starts the real application: Flyway applies every migration in
order to an empty database and Hibernate then has to agree with the schema that
came out. A migration that applies cleanly and leaves a column Hibernate cannot
map fails there.

That test skips itself when `REVERIE_IT_DB_URL` is unset, which is why the suite
stays green on a laptop with no database and is still checked here.

### What CI deliberately does not do

It never contacts Clerk, OpenAI, AssemblyAI, Resend, R2 or Confluent. The AI
service pins `AI_PROVIDER=mock`; the Spring suite mocks every client; the
frontend build takes placeholder `NEXT_PUBLIC_*` values. A pipeline that needed
live credentials could not run on a fork and could fail for reasons that have
nothing to do with the change under review.

It also does not deploy. Render and Vercel watch the branches themselves.

---

## Branch protection — not applied, and why

**This has not been configured.** It is a repository setting, not a file in the
repository, so nothing in this pass could change it and nothing here should be
read as having done so. The steps below are exact; they take about two minutes.

Do this **after** the first CI run on a pull request, not before: GitHub only
offers a status check in the picker once it has seen that check report at least
once. Requiring a check that has never run blocks every merge with "Expected —
waiting for status to be reported".

### `dev`

Settings → Branches → Add branch ruleset (or Add rule), targeting `dev`:

- **Require a pull request before merging** — on
  - Required approvals: **0**. This is a solo-maintained project; requiring an
    approval you cannot give yourself means nothing merges. The value is the PR
    and its checks, not a second pair of eyes that does not exist.
  - **Dismiss stale approvals when new commits are pushed** — on, harmless at 0
    and correct the moment a second maintainer appears.
- **Require status checks to pass** — on
  - **Require branches to be up to date before merging** — on. Two PRs that each
    pass alone can fail together, and this is what catches it.
  - Required checks: `Frontend`, `Spring`, `AI service`, `Migrations from empty`
- **Require conversation resolution before merging** — on
- **Block force pushes** — on
- **Restrict deletions** — on
- Do **not** enable "Allow bypass" for administrators. The point is that the
  rule applies to the person most able to talk themselves out of it.

### `main`

`main` is the production branch, so everything above applies and these change:

- **Require status checks** with the same four checks, and
  **Require branches to be up to date** — on
- **Require linear history** — on, so production history reads as a sequence of
  releases rather than a merge graph
- Merges into `main` come from `dev` only, as releases. Nothing should be
  committed to `main` directly.

### After enabling

Confirm it actually took effect rather than assuming:

```bash
gh api repos/CHAITANYAGANDI/Reverie/branches/dev/protection \
  --jq '{checks: .required_status_checks.contexts, force_push: .allow_force_pushes.enabled}'
```

A 404 means no protection is applied to that branch, whatever the settings page
appeared to say.

---

## The one thing CI does not cover

`backend-spring/Dockerfile` packages with `-DskipTests`. That is correct in an
image build — the tests have run by then and running them again doubles the
build for no information — but it is only correct if something ran them first.
Before this workflow existed, nothing did, and the image was built from whatever
was on the branch. That is the gap this closes, and it closes it only once the
status checks above are actually required.
