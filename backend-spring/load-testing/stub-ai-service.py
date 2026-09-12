#!/usr/bin/env python3
"""A stand-in for the AI service, for load tests only.

Why this exists
---------------

`rate-limit.js` drives `POST /api/v1/streaming/token`, which is limited to 30
requests per 10 minutes per account. Proving the limiter means proving *both*
halves: that the first 30 succeed and that the rest are refused.

Without a downstream, the first 30 do not succeed. Spring reaches for the AI
service, gets `ResourceAccessException`, and answers 503 -- so the run shows 30
failures followed by 429s and cannot tell "the limiter allowed it" apart from
"the limiter allowed it and then it broke". That is a weaker test than it looks,
because a limiter that refused *everything* would produce a similar-looking
summary.

So the downstream is stubbed rather than the assertion weakened.

What it is not
--------------

It is not a mock of the AI service's behaviour and must never become one. It
answers exactly one route with a fixed, obviously-fake token. It calls no
provider, spends nothing, holds no state and reads no request body. Anything
that needs real AI behaviour belongs in the ai-service's own test suite, where
`AI_PROVIDER=mock` already exists for the purpose.

Running it
----------

    docker run --rm -p 18000:18000 \
      -v "$PWD/backend-spring/load-testing:/s" \
      python:3.12-alpine python /s/stub-ai-service.py

Then point the backend under test at it:

    AI_SERVICE_URL=http://host.docker.internal:18000
"""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 18000

# Obviously fake, and short. If this string ever turns up anywhere that matters,
# something is pointed at the stub that should not be.
FAKE_TOKEN = {"token": "stub-streaming-token-not-real", "expiresInSeconds": 45}


class Handler(BaseHTTPRequestHandler):
    # Quiet: one line per request would drown the load-test output.
    def log_message(self, fmt, *args):  # noqa: A003 - base class name
        pass

    def _json(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self) -> None:  # noqa: N802 - base class name
        # The body is deliberately not read as data; it is drained so the
        # connection can be reused, and then discarded.
        length = int(self.headers.get("Content-Length") or 0)
        if length:
            self.rfile.read(length)

        if self.path == "/ai/streaming-token":
            self._json(200, FAKE_TOKEN)
            return
        self._json(404, {"detail": "stub serves /ai/streaming-token only"})

    def do_GET(self) -> None:  # noqa: N802 - base class name
        if self.path == "/health":
            self._json(200, {"status": "UP", "stub": True})
            return
        self._json(404, {"detail": "stub serves /ai/streaming-token only"})


if __name__ == "__main__":
    print(f"AI stub listening on :{PORT} (POST /ai/streaming-token only)", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
