package com.reverie.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Optional;

/**
 * Who somebody is, for the purpose of one number they only get once.
 *
 * <h2>What this is for</h2>
 *
 * <p>The free allowance is a lifetime one, so something has to remember that a
 * person has already had it — after their account, their meetings and their
 * profile are gone. That "something" has to be durable, has to survive the
 * provider issuing a new user id, and must not be a record of who they were.
 *
 * <p>So it is a keyed hash of the one fact the provider verifies and keeps
 * stable: the primary email address on the token.
 *
 * <h2>Why not the Clerk user id</h2>
 *
 * <p>Because deleting a Clerk account and making another produces a different
 * subject for the same person, which is precisely the reset this exists to
 * stop. The subject is the right key for *an account* — {@code users
 * .clerk_user_id} still is — and the wrong one for *a human*.
 *
 * <h2>Why HMAC and not SHA-256</h2>
 *
 * <p>An email address is not a secret and its input space is small: a plain
 * digest of one is recoverable from a word list in seconds, so a table of
 * SHA-256 email digests is a table of email addresses with extra steps. HMAC
 * with a key that is not in the database makes the ledger useless to anybody
 * who only has the ledger.
 *
 * <p>The key is never returned by an API, never logged, and never written to
 * the database. Neither is the address it is applied to — see
 * {@link #hash(String)}, which logs nothing at all.
 *
 * <h2>Why the secret must outlive a restart</h2>
 *
 * <p>Change the key and every existing hash stops matching, so every returning
 * user looks new and is handed another 100 minutes. That failure is silent,
 * which is what makes it dangerous: nothing breaks, the numbers just go back up.
 *
 * <p>Hence two rules, both enforced rather than documented. The key is read
 * from configuration and there is <b>no generated default</b> — a missing key
 * in provider mode makes {@link #hash} throw rather than quietly minting
 * identities nothing can match again. And {@code DeploymentCheck} refuses to
 * start a production deployment without it, so the failure happens at boot
 * with a named cause instead of at the first sign-up.
 *
 * <p>The development default below is a fixed, published string. That is safe
 * for exactly the reason dev mode is: dev mode trusts an {@code X-Dev-User}
 * header, so an attacker who can reach a dev-mode deployment does not need to
 * forge an identity hash to be anybody. It is fixed rather than random so that
 * restarting the local stack does not hand the local account a fresh allowance
 * — which would make the feature untestable on a laptop.
 *
 * <h2>Normalisation</h2>
 *
 * <p>Trim and lowercase, and nothing else. Both are safe: the local part is
 * case-insensitive at every provider anybody actually uses, and leading
 * whitespace is a copy-paste artefact rather than an address.
 *
 * <p>Deliberately <b>not</b> done: removing Gmail's dots, stripping
 * {@code +tags}, or any other provider-specific canonicalisation. Each would
 * merge addresses that Reverie's own provider treats as different accounts, so
 * each is a way for one person's allowance to be spent by another person who
 * happens to own {@code a.b@gmail.com}. Under-merging costs a duplicate free
 * tier for somebody who deliberately used an alias; over-merging locks a
 * stranger out. Only one of those is recoverable.
 */
@Component
public class FreeTierIdentityHasher {

    private static final Logger log = LoggerFactory.getLogger(FreeTierIdentityHasher.class);

    /**
     * Which key and algorithm produced a hash. Stored beside it.
     *
     * <p>One, and there is no rotation machinery to go with it. What it buys is
     * that a future rotation can be additive — hash the identity under both
     * versions, match either — rather than a migration that cannot be written
     * because the old hashes are unmatchable. A column is cheap; discovering
     * later that you needed one is not.
     */
    public static final short HASH_VERSION = 1;

    private static final String ALGORITHM = "HmacSHA256";

    /**
     * The key a laptop uses. Published on purpose — see the class note.
     *
     * <p>Named so that {@code DeploymentCheck} can recognise it in a production
     * deployment that copied a local {@code .env}, which is the way a
     * development secret actually reaches the internet.
     */
    public static final String DEVELOPMENT_SECRET = "dev-free-tier-identity-secret";

    private final String secret;
    private final boolean devMode;

    public FreeTierIdentityHasher(
            @Value("${reverie.free-tier.identity-secret:}") String secret,
            @Value("${reverie.auth-mode:dev}") String authMode) {
        this.devMode = !"clerk".equalsIgnoreCase(authMode == null ? "dev" : authMode.trim());
        String configured = secret == null ? "" : secret.trim();
        if (configured.isEmpty() && devMode) {
            // Said once, at startup, and worth saying: somebody reading logs on
            // a laptop should know which key their local allowance is keyed to.
            log.info("No FREE_TIER_IDENTITY_HMAC_SECRET set; using the fixed development key. "
                    + "A production deployment refuses to start without a real one.");
        }
        this.secret = configured;
    }

    /**
     * The durable identity of a verified email address.
     *
     * <p>{@link Optional#empty()} when there is no address to key on. That is a
     * real case: Clerk's default session token carries no email claim unless a
     * JWT template adds one, and this must not invent an identity to cover for
     * a missing claim — an invented one is either shared between strangers or
     * unmatchable tomorrow.
     *
     * @throws IllegalStateException in provider mode with no configured secret.
     *         Refusing is the only safe answer: hashing under a key that is
     *         about to change would hand out allowances that nothing can ever
     *         reconcile, and hashing under a random one does it silently.
     */
    public Optional<String> hash(String verifiedEmail) {
        String normalized = normalize(verifiedEmail);
        if (normalized == null) {
            return Optional.empty();
        }
        return Optional.of(hmac(normalized));
    }

    /**
     * Lowercased, trimmed, or null when there is nothing usable.
     *
     * <p>Package-private and pure so the rules can be asserted directly. The
     * shape check is deliberately weak — one {@code @} with something on each
     * side — because this is not a validator: the address has already been
     * verified by the provider, and a stricter rule here could only reject an
     * address that really does exist.
     */
    static String normalize(String email) {
        if (email == null) {
            return null;
        }
        String trimmed = email.trim().toLowerCase(Locale.ROOT);
        if (trimmed.isEmpty()) {
            return null;
        }
        int at = trimmed.indexOf('@');
        if (at <= 0 || at == trimmed.length() - 1) {
            return null;
        }
        return trimmed;
    }

    private String hmac(String normalized) {
        String key = secret.isEmpty() ? developmentKeyOrRefuse() : secret;
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), ALGORITHM));
            return HexFormat.of().formatHex(mac.doFinal(normalized.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            // HmacSHA256 is required of every JVM, and the key is a non-empty
            // byte array by here. Neither is recoverable and neither should be
            // swallowed into "this person is new".
            throw new IllegalStateException("Could not compute the free-tier identity hash.", e);
        }
    }

    private String developmentKeyOrRefuse() {
        if (devMode) {
            return DEVELOPMENT_SECRET;
        }
        throw new IllegalStateException(
                "reverie.free-tier.identity-secret (FREE_TIER_IDENTITY_HMAC_SECRET) is not set. "
                        + "The lifetime free allowance is keyed to it, so without it Reverie "
                        + "cannot tell a returning identity from a new one. Set it to a stable "
                        + "value -- the same value across restarts and deployments -- and "
                        + "restart.");
    }
}
