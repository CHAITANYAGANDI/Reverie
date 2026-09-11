"""Who is allowed to call the AI service.

Every ``/ai/*`` route is internal: Spring calls them, browsers never do. Until
this existed the only thing saying so was the network -- Render runs the AI
service as a private service, unreachable from the internet -- and network
placement is a deployment fact, not an application one. It is one misconfigured
service definition, one SSRF from another component inside the same private
network, or one `docker compose` port mapping away from being wrong, and
nothing in the process would notice.

That matters more here than it would for most internal services, because these
routes take ``user_id`` from the caller and use it as the tenant. PostgreSQL
row-level security means a caller who lies about it still cannot read another
tenant's rows -- that protection is independent and stays exactly as it is --
but an unauthenticated caller could still spend OpenAI and AssemblyAI credit at
will, and could index text into a tenant it named.

So the same shared secret already used in the other direction is required in
this one. ``callback.py`` sends ``X-Internal-Token`` to Spring, Spring's
``InternalTokenFilter`` checks it, and Render already puts the same value in
both services -- so this is a second use of an existing credential rather than
a new one to distribute and rotate.

``/health`` is deliberately not covered. Render polls it to decide whether the
service is up, and a health check that needs a secret is a health check that
reports "down" for a configuration mistake that has not happened yet.
"""

from __future__ import annotations

import hmac
import logging

from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings

logger = logging.getLogger("ai-service.service-auth")

HEADER = "X-Internal-Token"


def require_internal_token(
    x_internal_token: str | None = Header(default=None, alias=HEADER),
    settings: Settings = Depends(get_settings),
) -> None:
    """Refuse anything that cannot present the shared internal secret.

    Fails closed on a blank configured token. A service that accepted every
    request because nobody set the variable would look exactly like a working
    one, right up until it was reachable -- and this is the class of mistake the
    dependency exists to catch, so it cannot be the dependency's own default.

    The comparison is constant-time, matching the Spring filter on the other
    side of the same secret. The token is never logged, and never appears in
    the response: a caller learns that it was refused, not how close it got.
    """
    expected = (settings.reverie_internal_token or "").strip()
    if not expected:
        logger.error(
            "REVERIE_INTERNAL_TOKEN is not set; refusing every internal request. "
            "Set it to the same value the backend uses."
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Internal authentication is not configured",
        )

    presented = (x_internal_token or "").strip()
    if not presented or not hmac.compare_digest(presented, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Internal authentication required",
        )
