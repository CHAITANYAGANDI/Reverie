package com.reverie.security;

import com.reverie.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Turns a verified subject into a local user id, without going to the database
 * when it already knows the answer.
 *
 * <h2>What this is for</h2>
 *
 * <p>{@code UserService.provision} runs on every authenticated request through
 * both doors, and for a returning user it re-derives a mapping that has not
 * changed. Against a loopback database that was invisible. Against a network
 * database it is not: the round trip measured ~16-17 ms on the managed
 * PostgreSQL production used at the time, and provisioning spends four of
 * them — a system-pool checkout and its {@code set_config}, the lookup by
 * {@code clerk_user_id}, the free-tier identity lookup, and the commit — before
 * the request's own query has issued a single statement. Measured against the
 * launch gate that was a ~114 ms median where the SQL itself accounts for
 * ~0.36 ms.
 *
 * <p>So the mapping is remembered, and a returning request answers from memory.
 *
 * <h2>Why it is a separate bean and not an early return inside provision()</h2>
 *
 * <p>Because {@code provision} is {@code @Transactional}, and the transaction is
 * most of the cost. Returning early from inside it would still open the
 * transaction, still check out a system-pool connection, still write
 * {@code set_config} on that connection and still commit — three of the four
 * round trips, paid to discover there was nothing to do. The check has to
 * happen <em>before</em> the proxy is entered, which means it has to live in a
 * different bean. This one.
 *
 * <p>It is therefore deliberately not transactional and deliberately does no
 * database work of its own. On a miss it enters system context and calls the
 * existing method, which remains the only place that provisions anything.
 *
 * <h2>Why both doors go through here</h2>
 *
 * <p>{@link AuthenticationFilter} and {@link StompAuthInterceptor} previously
 * each wrote their own {@code asSystem(() -> provision(...))}. Sharing this
 * resolver is the same argument {@link ClerkTokens} makes about verification:
 * two copies of an identity decision drift, and the one that drifts is not
 * discovered until it is the one being relied on.
 *
 * <h2>The cache is process-local, and that is a real limit</h2>
 *
 * <p>Production is one backend container, so today there is one cache and
 * {@link #forget} reaches all of it. <b>That assumption is load-bearing for
 * account deletion.</b> With a second replica, one instance evicting a deleted
 * subject would leave the other answering from a mapping to a row that no
 * longer exists, for up to {@link #CACHE_TTL}. Horizontal scaling therefore
 * needs either distributed invalidation or a different shape here — it is not a
 * matter of raising an instance count and leaving this as it is.
 */
@Component
public class ProvisionedIdentityResolver {

    /**
     * Matches {@code ClerkDirectory.CACHE_TTL} on purpose.
     *
     * <p>That cache already bounds how stale this application's view of an
     * address can be when the token carries no email claim, and the free-tier
     * note describes half an hour behind as the accepted exposure. Using the
     * same window means this cache widens nothing: the staleness envelope of
     * the system is still one number, and it is still that one.
     */
    private static final Duration CACHE_TTL = Duration.ofMinutes(30);

    /** Bounded so an attacker minting subjects cannot grow this without end. */
    private static final int CACHE_MAX = 10_000;

    private final UserService users;
    private final SelfOnlyAccess selfOnly;
    private final Duration ttl;

    private final ConcurrentHashMap<String, Provisioned> cache = new ConcurrentHashMap<>();

    /**
     * What was true the last time this subject was provisioned.
     *
     * <p>{@code claimEmail} is the address exactly as it was handed to
     * {@code provision}, not a normalised or hashed form of it, and that is the
     * point: it is the input whose change would change what {@code provision}
     * does. {@code provision} compares the claim to the stored column with
     * {@code equals}, so a difference of case is a difference that writes to the
     * row — normalising here would hide precisely that write behind a cache hit.
     *
     * <p>Holding an address in process memory is not a new exposure: {@code
     * ClerkDirectory} already caches verified addresses this way, for the same
     * reason and with the same lifetime. No token, no JWT and no Clerk secret
     * is stored here — only the subject, the local user id, and the claim that
     * was already in memory from a token this process had just verified.
     */
    private record Provisioned(String localUserId, String claimEmail, Instant at) {
    }

    /**
     * Annotated because there are two constructors and Spring would otherwise
     * have no way to choose — see {@code ApplicationWiringTest}, which fails
     * the build for exactly that rather than letting it fail at startup.
     */
    @Autowired
    public ProvisionedIdentityResolver(UserService users, SelfOnlyAccess selfOnly) {
        this(users, selfOnly, CACHE_TTL);
    }

    /**
     * The same thing with a shorter memory, so expiry can be asserted without a
     * test that sleeps for half an hour. Package-private: nothing in the
     * application may choose its own TTL, because then there would be two.
     */
    ProvisionedIdentityResolver(UserService users, SelfOnlyAccess selfOnly, Duration ttl) {
        this.users = users;
        this.selfOnly = selfOnly;
        this.ttl = ttl;
    }

    /**
     * The local user id for a subject whose token has already been verified.
     *
     * @param clerkUserId the {@code sub} of a verified token, or the dev header
     *     in dev mode. Never anything a caller supplied unchecked.
     * @param claimEmail the verified address from that token, or null when it
     *     carried none the filter was willing to use
     * @throws com.reverie.common.ApiException if this deployment refuses the
     *     subject, or provisioning does
     */
    public String resolve(String clerkUserId, String claimEmail) {
        /*
         * EVERY REQUEST, BEFORE THE CACHE IS EVEN CONSULTED.
         *
         * <p>A cache hit is a statement about which row belongs to a subject.
         * It is not a statement that the subject is still allowed in, and
         * conflating the two is how a revoked identity keeps working until a
         * timer expires. The check reads two configured strings and compares
         * one of them, so there is no cost worth optimising away.
         *
         * <p>`provision` keeps its own copy of this check for the miss path.
         * Two gates rather than a moved one: this class is not the only way to
         * reach provisioning, and the one that guards the database should not
         * depend on callers remembering to guard themselves.
         */
        selfOnly.requireOrThrow(clerkUserId);

        if (clerkUserId == null || clerkUserId.isBlank()) {
            return null;
        }

        Provisioned hit = cache.get(clerkUserId);
        if (fresh(hit, claimEmail)) {
            return hit.localUserId();
        }

        String localUserId = provision(clerkUserId, claimEmail);

        /*
         * AFTER SUCCESS, AND ONLY AFTER SUCCESS.
         *
         * <p>Every refusal and every failure leaves this method by throwing,
         * so there is no path on which a self-only refusal, a spent free-tier
         * identity, an invalid token or a database error reaches this line. A
         * cache populated by a failure is a failure that has been made
         * permanent for the length of a TTL.
         *
         * <p>Concurrent first requests for the same new subject all miss, all
         * provision, and all write the same id here -- which is correct without
         * any locking, because `insertIfAbsent` decided the race in Postgres
         * and every one of them read the same winner.
         */
        if (localUserId != null && !localUserId.isBlank()) {
            store(clerkUserId, new Provisioned(localUserId, claimEmail, Instant.now()));
        }
        return localUserId;
    }

    /**
     * Whether a cached mapping may answer this request.
     *
     * <h2>The email rule, and why an absent claim is not a change</h2>
     *
     * <p>When the token carries a usable address, the application learns about
     * an address change on the very next request — no TTL involved. That is a
     * property worth keeping, so a claim that differs from the cached one is a
     * miss immediately, and provisioning runs to write the new address and
     * alias it onto the existing entitlement.
     *
     * <p>When the token carries no address, the token has said nothing and
     * therefore cannot contradict what was cached. Identity refresh in that
     * case is {@code ClerkDirectory}'s business and is governed by its TTL,
     * which is the same length as this one. Treating silence as a change would
     * turn every request on a default Clerk template back into a full
     * provisioning round trip, which is the cost this class exists to remove.
     */
    private boolean fresh(Provisioned entry, String claimEmail) {
        if (entry == null) {
            return false;
        }
        if (!entry.at().isAfter(Instant.now().minus(ttl))) {
            return false;
        }
        if (claimEmail == null) {
            return true;
        }
        return claimEmail.equals(entry.claimEmail());
    }

    /**
     * The miss path: the existing transactional provisioning, unchanged.
     *
     * <p>System context because provisioning runs before the local user id
     * exists, so nothing it does can satisfy a tenant policy yet — the same
     * bootstrap both callers performed for themselves before this class.
     *
     * <p>{@code asSystem} declares {@code Exception} because it takes a
     * {@code Callable}. {@code provision} declares none, so the only things
     * that can arrive here are unchecked and are rethrown exactly as they are:
     * a refusal must reach {@link AuthenticationFilter}'s handler as the
     * {@code ApiException} it is, with its own status, or the browser is sent
     * round a sign-in loop that cannot succeed.
     */
    private String provision(String clerkUserId, String claimEmail) {
        try {
            return TenantContext.asSystem(() -> users.provision(clerkUserId, claimEmail));
        } catch (RuntimeException propagate) {
            throw propagate;
        } catch (Exception unreachable) {
            throw new IllegalStateException(
                    "Provisioning threw a checked exception, which it does not declare",
                    unreachable);
        }
    }

    /**
     * Forget a subject's mapping.
     *
     * <p>Called when an account is deleted, <b>after that deletion has
     * committed</b> — see {@code PrivacyService.closeAccount}. A mapping to a
     * row that no longer exists is not a security hole, because the id it names
     * is the deleted account's own and row-level security answers it with
     * nothing; it is worse than that in practice, because the subject would
     * sign in again, be handed an id whose row is gone, and see an intact
     * account as an empty one until the entry expired.
     */
    public void forget(String clerkUserId) {
        if (clerkUserId != null) {
            cache.remove(clerkUserId);
        }
    }

    /**
     * Crude, and enough — the same bound {@code ClerkDirectory} uses.
     *
     * <p>This is a cache in front of an idempotent lookup: throwing all of it
     * away costs one provisioning round trip per active subject and cannot
     * produce a wrong answer. An eviction policy that could would be a worse
     * trade than the one it replaced.
     */
    private void store(String clerkUserId, Provisioned entry) {
        if (cache.size() >= CACHE_MAX) {
            cache.clear();
        }
        cache.put(clerkUserId, entry);
    }

    /** Empty the cache. For tests, and for nothing else. */
    void clear() {
        cache.clear();
    }

    /** Whether a subject is currently remembered. For tests. */
    boolean remembers(String clerkUserId) {
        return fresh(cache.get(clerkUserId), null);
    }
}
