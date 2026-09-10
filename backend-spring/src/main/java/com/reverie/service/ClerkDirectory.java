package com.reverie.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.ResourceAccessException;

import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Who a Clerk user actually is, asked of Clerk.
 *
 * <h2>Why this exists</h2>
 *
 * <p>The lifetime free allowance is keyed to a verified email address, and the
 * first place to look for one is the session token — Reverie already verifies
 * that against Clerk's JWKS, so a claim on it is trustworthy. The problem is
 * that the claim is <em>optional</em>: Clerk's default session token carries no
 * email at all, and it only appears if somebody wrote a JWT template.
 *
 * <p>Which made the whole anti-reset guarantee conditional on a dashboard
 * setting. An account provisioned from a token with no email claim used to get
 * an entitlement with no identity mapping — so deleting it and signing up again
 * handed out another 100 minutes, exactly the bug the entitlement was built to
 * close, reachable by anyone whose instance had the default template.
 *
 * <p>So there is a second source, and it is the authoritative one:
 * {@code GET /v1/users/{id}} on Clerk's Backend API, called with the secret
 * key, for the subject of the token that has already been verified. No JWT
 * template is required for the guarantee to hold.
 *
 * <h2>What is trusted</h2>
 *
 * <p>Only the primary address, and only when Clerk says it is verified. Not the
 * first address in the list, not an unverified one, and never an address that
 * arrived in a request body or a header. See {@link #verifiedPrimaryEmail}.
 *
 * <h2>The cache, and why it has a TTL rather than being permanent</h2>
 *
 * <p>Provisioning runs on every authenticated request, so an uncached lookup
 * would be a Clerk API call per request. A permanent cache would be worse than
 * it sounds in the other direction: a primary address that changes at Clerk has
 * to be noticed, because the new address must become an alias of the same
 * entitlement — otherwise somebody could change their email, delete the
 * account, and sign up again as the new address for a fresh allowance.
 *
 * <p>Half an hour is the compromise: one call per active user per half hour,
 * for an address that changes at most a handful of times in an account's life.
 *
 * <h2>Where the cache is not allowed to answer</h2>
 *
 * <p>"An alias goes unrecorded for up to half an hour" sounds harmless and is
 * not, because one operation makes it permanent:
 *
 * <pre>
 *   account linked to A, cache holds A
 *   primary address changes A -> B at Clerk
 *   cached lookup still answers A, so B is never aliased
 *   the account is deleted -> the link to the entitlement goes with it
 *   sign up again as B -> B maps to nothing -> a fresh 100 minutes
 * </pre>
 *
 * <p>The cache is not wrong there; it is simply half an hour behind, and
 * deletion is the one moment where being behind cannot be corrected later. So
 * the deletion path uses {@link #refreshVerifiedPrimaryEmail} instead, which
 * ignores the cache and replaces it. Everything else keeps the cached read.
 *
 * <h2>Nothing here is logged</h2>
 *
 * <p>No address, no secret, no response body. The subject id appears in a
 * warning because it is the only thing that makes one actionable, and it is
 * already in every other log line on the request.
 */
@Component
public class ClerkDirectory {

    private static final Logger log = LoggerFactory.getLogger(ClerkDirectory.class);

    /**
     * Short, because this is on the provisioning path of a live request.
     *
     * <p>Clerk's API is fast and this is one primary-key read on their side. A
     * generous timeout here would mean a Clerk incident turning into slow
     * sign-ins for everybody rather than a refusal for the accounts that are
     * not yet linked.
     */
    private static final Duration TIMEOUT = Duration.ofSeconds(5);

    /** See the class note: one lookup per active user per half hour. */
    private static final Duration CACHE_TTL = Duration.ofMinutes(30);

    /** Enough for a busy instance; evicted by age, and by size when it grows. */
    private static final int CACHE_MAX = 10_000;

    private final RestClient client;
    private final String secretKey;
    private final boolean enabled;
    private final ConcurrentHashMap<String, Cached> cache = new ConcurrentHashMap<>();

    private record Cached(String email, Instant at) {
    }

    /** Why a lookup did not produce an address, which decides what is logged. */
    public enum Status {
        /** Clerk returned a verified primary address. */
        RESOLVED,
        /** Clerk answered, and the primary address is missing or unverified. */
        NO_VERIFIED_EMAIL,
        /** Clerk has no such user. */
        NOT_FOUND,
        /** Clerk could not be reached, or answered with a fault. */
        UNAVAILABLE,
        /** No secret key configured, so there is nothing to ask. */
        DISABLED,
    }

    /**
     * The outcome of one lookup.
     *
     * <p>A record rather than {@code Optional<String>} because the four ways of
     * having no address are not the same thing to an operator: an unverified
     * primary address is somebody's account state, a 404 is a race with a
     * deletion, and a timeout is an incident. Every one of them means the same
     * thing to the caller — no entitlement — and that is asserted rather than
     * assumed.
     */
    public record Lookup(String email, Status status) {
        public boolean resolved() {
            return status == Status.RESOLVED && email != null && !email.isBlank();
        }

        static Lookup of(String email) {
            return new Lookup(email, Status.RESOLVED);
        }

        static Lookup without(Status status) {
            return new Lookup(null, status);
        }
    }

    public ClerkDirectory(
            @Value("${reverie.clerk.secret-key:}") String secretKey,
            @Value("${reverie.clerk.api-url:https://api.clerk.com/v1}") String apiUrl) {
        this.secretKey = secretKey == null ? "" : secretKey.trim();
        this.enabled = !this.secretKey.isEmpty();

        // Same shape as `Mailer` and `AiClient`: a JDK client with an explicit
        // connect timeout, because RestClient's default has none and a hung
        // socket on this path would hang a sign-in.
        HttpClient jdk = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(TIMEOUT)
                .build();
        this.client = RestClient.builder()
                .requestFactory(new JdkClientHttpRequestFactory(jdk) {
                    {
                        setReadTimeout(TIMEOUT);
                    }
                })
                .baseUrl(apiUrl)
                .build();

        if (!enabled) {
            log.info("CLERK_SECRET_KEY is not set, so the free-tier identity can only come from "
                    + "an email claim on the session token. A production deployment refuses to "
                    + "start without the key; see DeploymentCheck.");
        }
    }

    /** Whether there is a secret to ask Clerk with. */
    public boolean enabled() {
        return enabled;
    }

    /**
     * The verified primary email of a Clerk user.
     *
     * <p>Called with the subject of a token this application has already
     * verified against Clerk's JWKS, so the id is not user input in any
     * meaningful sense — it is the identity Clerk asserted a moment ago.
     *
     * <h2>What "primary" and "verified" mean here</h2>
     *
     * <p>Clerk's user record carries a list of addresses and a
     * {@code primary_email_address_id} naming one of them. This resolves that
     * one and no other: taking the first address in the list would let somebody
     * with two addresses choose which identity their allowance is keyed to, and
     * taking any verified address would do the same.
     *
     * <p>The address must also carry {@code verification.status == "verified"}.
     * An unverified primary is a real state — Clerk allows it in some
     * configurations — and keying a lifetime allowance to an address nobody has
     * proved they own would make the allowance transferable by typing.
     */
    public Lookup verifiedPrimaryEmail(String clerkUserId) {
        if (!enabled) {
            return Lookup.without(Status.DISABLED);
        }
        if (clerkUserId == null || clerkUserId.isBlank()) {
            return Lookup.without(Status.NOT_FOUND);
        }

        Cached hit = cache.get(clerkUserId);
        if (hit != null && hit.at().isAfter(Instant.now().minus(CACHE_TTL))) {
            return Lookup.of(hit.email());
        }
        return fetch(clerkUserId);
    }

    /**
     * The verified primary email as Clerk holds it <em>now</em>.
     *
     * <p>Ignores the cache on the way in and replaces it on the way out, so
     * every later cached read agrees with what this saw. A failed refresh
     * evicts the entry rather than leaving it: whatever is in there is known to
     * be untrustworthy by the time anybody asks this question, and a stale
     * answer is the thing being refused.
     *
     * <p>Called from exactly one place — the moment before an account is
     * permanently deleted, where a half-hour-old address stops being a
     * performance detail and becomes an allowance somebody gets back. See
     * {@code FreeTierService.bindCurrentIdentityBeforeDeletion}. Deleting an
     * account is rare and deliberate, so one uncached call costs nothing worth
     * measuring.
     *
     * <p>A separate method rather than a boolean argument on the one above: a
     * {@code verifiedPrimaryEmail(subject, true)} at a call site says nothing
     * about why, and the answer to "why" is the whole reason this exists.
     */
    public Lookup refreshVerifiedPrimaryEmail(String clerkUserId) {
        if (!enabled) {
            return Lookup.without(Status.DISABLED);
        }
        if (clerkUserId == null || clerkUserId.isBlank()) {
            return Lookup.without(Status.NOT_FOUND);
        }
        cache.remove(clerkUserId);
        Lookup fresh = fetch(clerkUserId);
        if (!fresh.resolved()) {
            // Belt and braces: `fetch` only writes the cache on success, and
            // the entry is already gone. Stated so that adding a write there
            // later cannot quietly re-introduce a stale answer.
            cache.remove(clerkUserId);
        }
        return fresh;
    }

    /** One uncached call to Clerk, and the only place the response is read. */
    private Lookup fetch(String clerkUserId) {
        Map<String, Object> user;
        try {
            user = client.get()
                    .uri("/users/{id}", clerkUserId)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + secretKey)
                    .retrieve()
                    .body(new org.springframework.core.ParameterizedTypeReference<>() {
                    });
        } catch (HttpClientErrorException.NotFound e) {
            // Reachable without anything being wrong: a token can outlive the
            // user it names by the length of its own expiry.
            log.warn("Clerk has no user {}; no free-tier identity can be established for it.",
                    clerkUserId);
            return Lookup.without(Status.NOT_FOUND);
        } catch (HttpClientErrorException e) {
            // 401 and 403 are the secret being wrong, which is configuration
            // rather than this user. Named as unavailable because that is what
            // it means for the caller: nothing can be resolved until somebody
            // fixes it, and no allowance may be granted in the meantime.
            log.error("Clerk refused a user lookup ({}). The free-tier identity cannot be "
                    + "established until this is fixed; check CLERK_SECRET_KEY.",
                    e.getStatusCode());
            return Lookup.without(Status.UNAVAILABLE);
        } catch (HttpServerErrorException | ResourceAccessException e) {
            log.warn("Clerk could not be reached for a user lookup: {}", e.getClass().getSimpleName());
            return Lookup.without(Status.UNAVAILABLE);
        } catch (RuntimeException e) {
            // A body that does not deserialise, a redirect, anything else. It
            // is not an address, so it is not an identity.
            log.warn("Clerk returned something unusable for a user lookup: {}",
                    e.getClass().getSimpleName());
            return Lookup.without(Status.UNAVAILABLE);
        }

        String email = primaryVerifiedAddress(user);
        if (email == null) {
            log.warn("Clerk user {} has no verified primary email address, so no lifetime "
                    + "free-tier identity can be established for it.", clerkUserId);
            return Lookup.without(Status.NO_VERIFIED_EMAIL);
        }

        remember(clerkUserId, email);
        return Lookup.of(email);
    }

    /**
     * Pull the verified primary address out of a Clerk user record.
     *
     * <p>Defensive at every step, and deliberately so: this is parsing a
     * third-party JSON shape into the key of a lifetime entitlement, and every
     * unexpected shape has to end at "no identity" rather than at a guess. A
     * missing field, a list of the wrong type, an id that matches nothing — all
     * of them return null.
     *
     * <p>Package-private so the parsing can be asserted directly, without a
     * server to answer.
     */
    static String primaryVerifiedAddress(Map<String, Object> user) {
        if (user == null) {
            return null;
        }
        Object primaryId = user.get("primary_email_address_id");
        if (!(primaryId instanceof String primary) || primary.isBlank()) {
            return null;
        }
        if (!(user.get("email_addresses") instanceof List<?> addresses)) {
            return null;
        }
        for (Object entry : addresses) {
            if (!(entry instanceof Map<?, ?> address)) {
                continue;
            }
            if (!Objects.equals(primary, address.get("id"))) {
                continue;
            }
            if (!(address.get("email_address") instanceof String value) || value.isBlank()) {
                return null;
            }
            if (!(address.get("verification") instanceof Map<?, ?> verification)) {
                return null;
            }
            return "verified".equals(verification.get("status")) ? value : null;
        }
        return null;
    }

    private void remember(String clerkUserId, String email) {
        if (cache.size() >= CACHE_MAX) {
            // Crude, and enough: this is a cache in front of an idempotent
            // lookup, so dropping all of it costs one round trip per user.
            cache.clear();
        }
        cache.put(clerkUserId, new Cached(email, Instant.now()));
    }

    /** Forget a cached address. Exists for tests and for an address change. */
    public void forget(String clerkUserId) {
        if (clerkUserId != null) {
            cache.remove(clerkUserId);
        }
    }
}
