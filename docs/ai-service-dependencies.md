# AI-service dependencies

## The problem this solves

`pyproject.toml` declared lower bounds — `fastapi>=0.111`, `openai>=1.35`,
`psycopg>=3.2` — and `requirements.txt` mirrored them, and the Dockerfile
installed from that. So the same Git commit, built two months apart, produced
two different services. For a component that holds an OpenAI SDK, a Kafka
client, a PostgreSQL driver and an object-store client, "whatever was newest on
build day" is not a dependency policy, and a failure caused by it looks like a
code bug in whatever broke.

## How it is laid out

One canonical source and two generated artifacts. Nothing is maintained by
hand in the generated files.

| File | Generated? | Who installs it |
| --- | --- | --- |
| `pyproject.toml` | **canonical, edited by hand** | local development (`pip install -e ".[test]"`) |
| `requirements.txt` | generated | `ai-service/Dockerfile` — production runtime only |
| `requirements-dev.txt` | generated | CI — runtime plus the `test` extra |

Both locks pin exact versions **with hashes**. A file carrying hashes makes pip
enforce them, so a substituted or tampered artifact fails the install instead of
shipping. CI passes `--require-hashes` explicitly as well, so the guarantee is
stated rather than inherited from a file format.

## Changing a dependency

Edit the range in `pyproject.toml`, then regenerate **both** locks:

```bash
cd ai-service
uv pip compile pyproject.toml \
  --python-version 3.12 --python-platform linux --generate-hashes \
  --output-file requirements.txt

uv pip compile pyproject.toml --extra test \
  --python-version 3.12 --python-platform linux --generate-hashes \
  --output-file requirements-dev.txt
```

`--python-version 3.12` and `--python-platform linux` are not optional and are
not about the machine you are sitting at. They describe where this runs:
`python:3.12-slim` in the Dockerfile and `ubuntu-latest` in CI. Resolving for
anything else produces a lock that installs correctly for you and fails in the
image — `aiokafka` pulls `async-timeout` on 3.11 and not on 3.12, and wheel
selection differs by platform.

Commit both files with the `pyproject.toml` change. CI installs the lock, so a
regenerated lock that does not work is a failed build rather than a failed
deploy.

## Local development

Install from the canonical source, not the lock:

```bash
pip install -e ".[test]"
```

The locks are built for linux/3.12 and will refuse to install on Windows or
macOS. That is the correct trade: reproducibility is a property production
needs, and forcing it on a laptop buys nothing and breaks everyone not on
linux.

## A discrepancy worth fixing

The committed development virtualenv at `ai-service/.venv` is **Python 3.11.9**,
while `pyproject.toml` requires `>=3.12` and both the Dockerfile and CI use
3.12. The suite passes on 3.11 today, which is why nobody has noticed, but it
means local test runs are not exercising the interpreter that ships. Recreating
the venv on 3.12 is the fix:

```bash
py -3.12 -m venv .venv     # once 3.12 is installed
.venv/Scripts/pip install -e ".[test]"
```

Until then, CI on 3.12 is the only place the shipped interpreter is tested.
