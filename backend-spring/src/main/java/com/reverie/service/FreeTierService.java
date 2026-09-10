package com.reverie.service;

import com.reverie.common.ApiException;
import com.reverie.common.IdGenerator;
import com.reverie.entity.FreeTierEntitlement;
import com.reverie.entity.FreeTierIdentity;
import com.reverie.entity.UsageLimit;
import com.reverie.entity.UserEntity;
import com.reverie.repository.FreeTierEntitlementRepository;
import com.reverie.repository.FreeTierIdentityRepository;
import com.reverie.repository.UsageLimitRepository;
import com.reverie.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * The free allowance that belongs to a person rather than to an account.
 *
 * <h2>The bug this exists to close</h2>
 *
 * <p>100 minutes and 3 imports are described everywhere — on the landing page,
 * in Settings, in the refusal messages — as being "for the life of the
 * account". They were enforced by {@code usage_limits}, which is
 * {@code ON DELETE CASCADE} from {@code users}. So the allowance was for the
 * life of a *row*: close the account, sign up again with the same address, and
 * the counter came back at zero. The number was a formality for anybody who
 * noticed.
 *
 * <p>It is now two things instead of one. The account and everything in it is
 * as deletable as it ever was. The fact that this human has already been given
 * the free tier is a separate row that nothing cascades to, keyed to a hash of
 * their verified email rather than to a Clerk subject that changes when they
 * sign up again.
 *
 * <h2>The three moments</h2>
 *
 * <ol>
 *   <li><b>Provisioning.</b> {@link #linkOnProvision} runs inside
 *       {@code UserService.provision}, which every authenticated request goes
 *       through. It resolves the identity to an entitlement, creating one the
 *       first time, and writes the link onto the account.</li>
 *   <li><b>Spending.</b> {@link #forAccount} hands the entitlement id to
 *       {@code UsageLimitService}, which charges it with the atomic statements
 *       in {@code FreeTierEntitlementRepository}.</li>
 *   <li><b>Deletion.</b> {@link #bindCurrentIdentityBeforeDeletion}, and then
 *       nothing. {@code ErasureService} deletes the account and every row that
 *       hangs off it; the FK points from the account to the entitlement, so the
 *       entitlement is simply no longer referenced.</li>
 * </ol>
 *
 * <h2>Why deletion needs a step of its own</h2>
 *
 * <p>Because the account's link is the only thing holding the entitlement to a
 * person until an identity mapping says so, and deletion is what removes the
 * link. Everything else is recoverable: an address that changes today is
 * aliased on the next cached refresh, and nothing is lost by it being half an
 * hour late. Deletion has no next time.
 *
 * <pre>
 *   linked to A, the directory's cache holds A
 *   primary address changes A -> B at Clerk
 *   a cached read still answers A, so B is never aliased
 *   the account is deleted -> the link goes with it
 *   sign up again as B -> B maps to nothing -> another 100 minutes
 * </pre>
 *
 * <p>So the deletion path asks Clerk again, uncached, and writes the alias
 * before a single byte of anybody's content is destroyed. See the method's own
 * note for what happens when Clerk will not answer.
 *
 * <p><b>And nothing else is going to tell us.</b> This application has no
 * Clerk webhook receiver: no {@code user.updated} handler, no route that would
 * accept one, no signature verification for one. Every path in
 * {@code SecurityConfig} is authenticated except the actuator, the docs, the
 * websocket and {@code /internal/**}, and that last one is the ai-service's
 * own callback behind a shared secret. An address change is therefore only
 * ever <em>found</em> — by the next request's token claim, or by asking the
 * Backend API — which is why "the cached answer is up to half an hour behind"
 * is the entire exposure rather than one case of it, and why the fix is a
 * forced read at the one irreversible moment rather than an event handler.
 *
 * <p>If a {@code user.updated} subscription is ever added, the branch it wants
 * already exists: {@link #linkOnProvision} treats an unknown address on a
 * linked account as another alias of the entitlement that account already
 * has. Aliasing, never minting — and it must stay that way, because a handler
 * that created an entitlement for the new address would be handing out a
 * second allowance on every email change.
 *
 * <h2>Where the identity comes from</h2>
 *
 * <p>Two sources, in this order, and both are the server's:
 *
 * <ol>
 *   <li>The {@code email} claim on the session token, which this application
 *       has already verified against Clerk's JWKS. Free, and the common case
 *       for an instance whose JWT template carries one.</li>
 *   <li>Otherwise {@link ClerkDirectory} — {@code GET /v1/users/{id}} on
 *       Clerk's Backend API, for the subject of that same verified token.</li>
 * </ol>
 *
 * <p>The second exists because the first is optional. Clerk's default session
 * token has no email claim, so keying the allowance on it alone made the whole
 * guarantee conditional on a dashboard setting: an instance with the default
 * template granted entitlements that nothing could recognise afterwards, and
 * deleting an account then handed out another 100 minutes. A custom claim is
 * now an optimisation, not a requirement.
 *
 * <p>Neither source is ever a request body, a query parameter or a header. The
 * only thing that reaches this class from outside the server is a Clerk subject
 * that has already been cryptographically verified.
 *
 * <h2>No identity, no entitlement</h2>
 *
 * <p>If neither source produces a verified address, nothing is created. The
 * account exists and can be read, signed out of and deleted; what it cannot do
 * is spend a free allowance, because {@link #forAccount} refuses rather than
 * inventing one — see the note there.
 *
 * <p>That is the deliberate exceptional state, and it is the only honest one
 * available: an entitlement with no identity mapping is precisely the
 * resettable allowance this whole change exists to remove. Better to refuse
 * free usage for the minutes a Clerk incident lasts than to grant something
 * whose lifetime semantics cannot be enforced afterwards.
 *
 * <h2>Why the backfill is here and not in the migration</h2>
 *
 * <p>Existing accounts have consumed usage in {@code usage_limits} and it has
 * to carry over — starting the estate at zero would hand everybody a fresh 100
 * minutes, which is the bug with a migration number on it. But the identity
 * hash needs the HMAC key, which lives in configuration and must not be
 * committed to a SQL file.
 *
 * <p>So the seeding happens the first time each existing account signs in after
 * the deploy, which is the one moment both halves are present: the verified
 * address from the token, and the old counter in the database. It cannot be
 * missed, because provisioning runs before any request that could spend or
 * delete anything — including the request that closes the account.
 */
@Service
public class FreeTierService {

    private static final Logger log = LoggerFactory.getLogger(FreeTierService.class);

    private final FreeTierEntitlementRepository entitlements;
    private final FreeTierIdentityRepository identities;
    private final UsageLimitRepository usage;
    private final UserRepository users;
    private final FreeTierIdentityHasher hasher;
    private final ClerkDirectory clerk;
    private final boolean devMode;

    public FreeTierService(FreeTierEntitlementRepository entitlements,
                           FreeTierIdentityRepository identities,
                           UsageLimitRepository usage,
                           UserRepository users,
                           FreeTierIdentityHasher hasher,
                           ClerkDirectory clerk,
                           @Value("${reverie.auth-mode:dev}") String authMode) {
        this.entitlements = entitlements;
        this.identities = identities;
        this.usage = usage;
        this.users = users;
        this.hasher = hasher;
        this.clerk = clerk;
        this.devMode = !"clerk".equalsIgnoreCase(authMode == null ? "dev" : authMode.trim());
    }

    /**
     * Refuse a <em>new</em> account to an identity that has already spent the
     * whole allowance.
     *
     * <p>Called by {@code UserService.provision} immediately before it inserts
     * a users row, and only then — an account that already exists is never
     * refused by this, whatever its balance. That distinction is the whole
     * design:
     *
     * <ul>
     *   <li><b>A live account with nothing left.</b> Signs in exactly as
     *       before. It can read its meetings, export them, and close itself.
     *       Locking somebody out of their own data for spending their free
     *       minutes would be a punishment, not a limit.</li>
     *   <li><b>A closed account coming back with minutes left.</b> Allowed, and
     *       it resumes on the remaining balance — that is what
     *       {@link #linkOnProvision} does, unchanged.</li>
     *   <li><b>A closed account coming back with nothing left.</b> Refused
     *       here, before the row exists.</li>
     * </ul>
     *
     * <h2>Why refuse rather than let them in with a spent balance</h2>
     *
     * <p>Because that is what happened before, and it was a worse experience
     * for the same outcome: the account was created, the counters came back at
     * 100 and 3, and every attempt to record or import was refused one at a
     * time with no explanation of why a brand-new account had no allowance. One
     * sentence at the door beats a product that looks broken.
     *
     * <p>It is not what stops the abuse. The counters coming back is what does
     * that, and it already did. This is the same rule, said out loud.
     *
     * <h2>Minutes, and not imports</h2>
     *
     * <p>{@code MINUTES_ALLOWANCE} alone decides. Somebody who used all three
     * imports and no minutes still has the entire recording allowance, and
     * refusing them an account would be refusing the thing they can still do.
     * Minutes are the resource everything consumes: with none left,
     * {@code chargeMeetingOrThrow} refuses recordings and imports alike, so
     * there is genuinely nothing a new account could be used for.
     *
     * <h2>What happens when the identity cannot be resolved</h2>
     *
     * <p>Nothing — the account is created. Clerk being unreachable must not
     * refuse sign-up to people who have never been here, and it costs nothing
     * to allow: {@code linkOnProvision} grants no entitlement it cannot key to
     * an identity, so an account created during an outage has no free allowance
     * until the identity resolves. Fail-open here is safe precisely because the
     * grant itself fails closed.
     */
    @Transactional(readOnly = true)
    public void refuseIfExhaustedIdentity(String clerkUserId, String claimEmail) {
        Optional<String> hash = verifiedAddress(clerkUserId, claimEmail).flatMap(hasher::hash);
        if (hash.isEmpty()) {
            return;
        }
        Optional<FreeTierIdentity> known = identities.findByIdentityHash(hash.get());
        if (known.isEmpty()) {
            // Never been given the free tier. The overwhelmingly common case,
            // and one indexed lookup.
            return;
        }
        int spent = entitlements.findById(known.get().getEntitlementId())
                .map(FreeTierEntitlement::getRecordingMinutesUsed)
                .orElse(0);
        if (spent < UsageLimitService.MINUTES_ALLOWANCE) {
            // Been here, has minutes left. `linkOnProvision` will hand the
            // remaining balance back a moment from now.
            return;
        }
        /*
         * Logged without the address and without the hash. What is useful in a
         * log line is that the rule fired and for which Clerk subject; the
         * identity of the person is the one thing this table exists not to
         * hold in the clear.
         */
        log.info("Refused a new account for Clerk subject {}: this identity has already spent its "
                + "lifetime free allowance ({} of {} minutes).",
                clerkUserId, spent, UsageLimitService.MINUTES_ALLOWANCE);
        throw ApiException.freeTierExhausted(
                "This email address has already used all "
                        + UsageLimitService.MINUTES_ALLOWANCE
                        + " free transcription minutes. Closing an account doesn't reset them, so "
                        + "a new account can't be created with this address.");
    }

    /**
     * The verified address this account's allowance is keyed to, if there is one.
     *
     * <h2>The order, and why the claim comes first</h2>
     *
     * <p>The token is already verified by the time anything here runs, so a
     * claim on it is as trustworthy as the Backend API and costs no round trip.
     * The API is the fallback rather than the primary for that reason alone —
     * both are the server's own view of the same record.
     *
     * <p>An explicitly unverified claim never reaches this method: the filter
     * that reads the token drops the address when {@code email_verified} says
     * false, so an unverified primary falls through to the API, which applies
     * the same rule against Clerk's own record.
     *
     * <h2>Dev mode</h2>
     *
     * <p>There is no Clerk to ask and no verified anything: dev mode serves
     * whoever sends an {@code X-Dev-User} header. The subject becomes a
     * deterministic address in the reserved {@code .invalid} domain so the
     * local stack has a stable identity and the same code path is exercised.
     * It cannot collide with a real address, because {@code .invalid} can never
     * be registered — and dev mode is an authentication bypass by design, so
     * this adds no hole to it.
     */
    private Optional<String> verifiedAddress(String clerkUserId, String claimEmail) {
        String fromClaim = FreeTierIdentityHasher.normalize(claimEmail);
        if (fromClaim != null) {
            return Optional.of(fromClaim);
        }
        if (devMode) {
            return Optional.of("dev-" + clerkUserId + "@dev.invalid");
        }
        ClerkDirectory.Lookup lookup = clerk.verifiedPrimaryEmail(clerkUserId);
        return lookup.resolved() ? Optional.of(lookup.email()) : Optional.empty();
    }

    /**
     * Attach this account to the allowance its identity already owns, or to a
     * new one.
     *
     * <p>Called from provisioning, in system context, for every authenticated
     * request. Everything about it is idempotent: an account that is already
     * linked and whose address has not changed does one column read and stops.
     *
     * <h2>What each branch means</h2>
     *
     * <ul>
     *   <li><b>Identity known, account unlinked.</b> The returning case, and the
     *       whole point: somebody who deleted their account and signed up again
     *       is linked back to the usage they already spent.</li>
     *   <li><b>Identity unknown, account unlinked.</b> A genuinely new person,
     *       or an existing account signing in for the first time after this
     *       release. One entitlement is created, seeded from
     *       {@code usage_limits} — zero for the new person, whatever they have
     *       already spent for the existing one.</li>
     *   <li><b>Identity unknown, account already linked.</b> A verified primary
     *       email that has changed. The new address becomes another identity of
     *       the <em>same</em> entitlement, so the allowance follows the person.
     *       This is the branch that stops "change your email, get another 100
     *       minutes".</li>
     *   <li><b>Identity known and pointing somewhere else.</b> A collision —
     *       this account's new address is already another entitlement's
     *       identity. Nothing is merged, moved or granted; the account keeps the
     *       entitlement it has. See below.</li>
     * </ul>
     *
     * @param clerkUserId  the subject of the verified token, used to ask Clerk
     *                     for the primary address when the token carries none
     * @param claimEmail   the address from the verified token, or null when the
     *                     token carried no usable email claim
     */
    @Transactional
    public void linkOnProvision(String userId, String clerkUserId, String claimEmail) {
        UserEntity user = users.findById(userId).orElse(null);
        if (user == null) {
            return;
        }
        String linked = user.getFreeTierEntitlementId();

        Optional<String> maybeHash = verifiedAddress(clerkUserId, claimEmail).flatMap(hasher::hash);

        if (maybeHash.isEmpty()) {
            /*
             * NO VERIFIED IDENTITY, SO NO ENTITLEMENT. NOT EVEN A TEMPORARY ONE.
             *
             * <p>Reachable three ways, all of them Clerk's answer rather than
             * this account's fault: no verified primary address on the record,
             * a subject Clerk no longer has, or Clerk unreachable. See
             * {@link ClerkDirectory.Status}.
             *
             * <p>This used to create an entitlement with no identity mapping,
             * and that was the blocker: an unmapped allowance is a resettable
             * allowance — delete the account, sign up again, and nothing can
             * recognise you. So nothing is created now.
             *
             * <p>An account that is already linked is untouched and keeps
             * working. Only an unlinked one is affected, and what it loses is
             * free usage until the identity resolves — `forAccount` refuses,
             * `getUsage` fails, and the interface treats an unreadable balance
             * as no balance, which it already does for every other reason a
             * balance cannot be read.
             */
            if (linked == null) {
                log.warn("Account {} has no resolvable verified identity, so it has been given no "
                        + "free-tier allowance. Free usage stays closed until Clerk provides a "
                        + "verified primary email for it.", userId);
            }
            return;
        }

        String hash = maybeHash.get();
        Optional<FreeTierIdentity> known = identities.findByIdentityHash(hash);

        if (known.isPresent()) {
            String owner = known.get().getEntitlementId();
            if (linked == null) {
                // The returning identity. Their spent usage comes back with them.
                users.attachFreeTierEntitlement(userId, owner);
                return;
            }
            if (!owner.equals(linked)) {
                /*
                 * COLLISION, AND IT IS LEFT ALONE ON PURPOSE.
                 *
                 * This account is linked to one entitlement and its verified
                 * address is already the identity of another. Reachable if
                 * somebody closes an account, signs up with a second address,
                 * and then moves the first address onto the new account at the
                 * provider.
                 *
                 * Every automatic resolution is worse than doing nothing.
                 * Re-pointing this account at `owner` would let somebody
                 * inherit an allowance by claiming an address. Merging the two
                 * would move usage between people. Granting a fresh one is the
                 * bug. So the account keeps what it has, the other mapping
                 * keeps what it has, and nobody gains an allowance either way.
                 *
                 * Logged at WARN with no address and no hash in it, because the
                 * only thing to do about it is look.
                 */
                log.warn("Free-tier identity collision for account {}: its verified address is "
                        + "already mapped to another entitlement. Left as it is -- no merge, no "
                        + "transfer, no new allowance.", userId);
            }
            return;
        }

        // An address nobody has used before.
        if (linked != null) {
            // A changed primary email. It becomes an alias of the entitlement
            // this account already spends against, so no second grant exists to
            // be found later.
            identities.insertIfAbsent(hash, FreeTierIdentityHasher.HASH_VERSION, linked);
            return;
        }

        /*
         * A new identity and an unlinked account: create the allowance.
         *
         * The insert order is entitlement, then mapping, then link. The mapping
         * insert is the one that decides a race — two first requests for the
         * same brand-new identity both reach here, both create an entitlement,
         * and only one can claim the hash. The loser reads the winner's mapping
         * and links to that instead, so the two accounts (which are the same
         * account) end up on one allowance.
         *
         * The loser's own entitlement row is left behind, unreferenced and
         * holding zero. Not deleted: an unreferenced row of two zeroes is
         * harmless, and a delete here would be a delete of a row another
         * transaction may just have linked itself to.
         */
        String created = createSeededEntitlement(userId);
        int claimed = identities.insertIfAbsent(hash, FreeTierIdentityHasher.HASH_VERSION, created);
        String winner = claimed == 1
                ? created
                : identities.findByIdentityHash(hash).map(FreeTierIdentity::getEntitlementId)
                        .orElse(created);
        users.attachFreeTierEntitlement(userId, winner);
    }

    /**
     * Make sure this account's <em>current</em> verified identity names its
     * allowance, before the account stops existing.
     *
     * <p>Called by {@code PrivacyService.closeAccount} immediately before
     * {@code ErasureService.eraseAccount}, and deliberately before it: erasure
     * deletes storage objects first and no transaction can bring those back, so
     * a prerequisite that ran afterwards would be a prerequisite that had
     * already failed.
     *
     * <h2>What it does</h2>
     *
     * <ul>
     *   <li>No entitlement on the account — nothing to protect, and nothing to
     *       alias. Deletion proceeds.</li>
     *   <li>The current address already names this entitlement — the ordinary
     *       case. Nothing to write. Deletion proceeds.</li>
     *   <li>The current address names nothing — it is written as another alias
     *       of this entitlement, and the write is read back before deletion is
     *       allowed to continue.</li>
     *   <li>The current address names a <em>different</em> entitlement — refused.
     *       Nothing is merged, moved or created; see below.</li>
     *   <li>Clerk cannot say — refused, retryably.</li>
     * </ul>
     *
     * <h2>Why a refusal rather than deleting anyway</h2>
     *
     * <p>Deleting anyway is the resettable-allowance bug with extra steps: the
     * link disappears, the new address was never recorded, and signing up again
     * with it is a fresh 100 minutes. The alternative is asking somebody to
     * press a button twice, which is the smaller cost — and the message says so
     * without mentioning Clerk, which a reader can do nothing with.
     *
     * <p>The refusal is a {@code 503} and the transaction has not touched
     * anything yet, so nothing is half-deleted. That is the property worth
     * having: an account is either intact or gone.
     *
     * <h2>Why it runs in its own transaction, on the system connection</h2>
     *
     * <p>{@code free_tier_identities} has no row-level security policy at all
     * (V69), so a tenant connection can neither read nor write it — which is
     * the point: {@code FOR ALL} would have carried DELETE, and deleting your
     * own mapping before deleting your account is the reset this class exists
     * to prevent. Both writers therefore run as system, and this is the one
     * that does not get that for free: {@code closeAccount} is a request, and
     * requests hold tenant connections.
     *
     * <p>The route is chosen at connection checkout, so it cannot be changed
     * inside a transaction that already has one. {@code REQUIRES_NEW} is what
     * makes it work — the caller wraps this in
     * {@code TenantContext.runAsSystem}, a new transaction begins, and the
     * checkout that opens it reads the flag and takes the privileged pool.
     *
     * <p>Committing separately is wanted here rather than merely tolerated.
     * Erasure destroys storage objects, and no transaction brings those back;
     * having the mapping already <em>committed</em> before that starts is
     * strictly safer than having it pending in the same transaction. The other
     * order — mapping committed, erasure then failing — leaves an intact
     * account carrying one extra alias for its own current address, which is
     * the alias the next provisioning read would have written anyway.
     *
     * <p>Seeing all of the ledger is also what makes the conflict branch below
     * mean anything: a tenant-visible slice would hide precisely the row that
     * says this address already belongs to somebody else's allowance.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void bindCurrentIdentityBeforeDeletion(String userId, String clerkUserId) {
        String linked = users.findById(userId)
                .map(UserEntity::getFreeTierEntitlementId)
                .orElse(null);
        if (linked == null) {
            // Never had a resolvable identity, so it never got an allowance --
            // there is nothing here anybody could reset. See `linkOnProvision`.
            return;
        }

        Optional<String> current = refreshedAddress(clerkUserId).flatMap(hasher::hash);
        if (current.isEmpty()) {
            log.warn("Refusing to delete account {}: its current verified identity could not be "
                    + "confirmed, and deleting it now would leave its spent free allowance "
                    + "unclaimable.", userId);
            throw ApiException.serviceUnavailable(
                    "We couldn't complete account deletion just now. Please try again.");
        }

        String hash = current.get();
        Optional<FreeTierIdentity> known = identities.findByIdentityHash(hash);
        if (known.isPresent()) {
            if (known.get().getEntitlementId().equals(linked)) {
                return;
            }
            /*
             * The current address belongs to somebody else's allowance. Every
             * automatic resolution is worse than refusing: re-pointing lets an
             * allowance be inherited by claiming an address, merging moves usage
             * between people, and a third entitlement is the original bug.
             *
             * Conflict rather than 503 because retrying will not help, and the
             * account is left intact either way.
             */
            log.error("Refusing to delete account {}: its current verified identity already "
                    + "belongs to a different lifetime entitlement. No merge, no transfer, no "
                    + "new allowance.", userId);
            throw ApiException.conflict(
                    "We couldn't complete account deletion just now. Please try again, or get in "
                            + "touch if it keeps happening.");
        }

        identities.insertIfAbsent(hash, FreeTierIdentityHasher.HASH_VERSION, linked);
        /*
         * Read back, rather than trusting the row count. `ON CONFLICT DO
         * NOTHING` returns 0 both when somebody else wrote the same mapping --
         * fine -- and if it were ever to conflict on something else, and the
         * whole point of this method is that the mapping *exists* before the
         * account stops existing. So it is checked, once, against the database.
         */
        String owner = identities.findByIdentityHash(hash)
                .map(FreeTierIdentity::getEntitlementId)
                .orElse(null);
        if (!linked.equals(owner)) {
            log.error("Refusing to delete account {}: the alias for its current verified identity "
                    + "did not persist, so its spent free allowance would be unclaimable.", userId);
            throw ApiException.serviceUnavailable(
                    "We couldn't complete account deletion just now. Please try again.");
        }
        log.info("Bound account {}'s current verified identity to its lifetime entitlement before "
                + "deletion.", userId);
    }

    /**
     * The address Clerk holds <em>now</em>, cache ignored.
     *
     * <p>Dev mode never asks: its identity is derived from the subject and
     * cannot go stale, because there is no external record to disagree with.
     * See {@link #verifiedAddress}.
     */
    private Optional<String> refreshedAddress(String clerkUserId) {
        if (devMode) {
            return Optional.of("dev-" + clerkUserId + "@dev.invalid");
        }
        ClerkDirectory.Lookup lookup = clerk.refreshVerifiedPrimaryEmail(clerkUserId);
        return lookup.resolved() ? Optional.of(lookup.email()) : Optional.empty();
    }

    /**
     * The entitlement this account spends against.
     *
     * <p>Read from the account rather than re-derived, so the charging path
     * never needs the address: minutes are charged by a worker callback that
     * has a meeting and a user id and no business holding an email.
     *
     * <h2>It refuses rather than creating one</h2>
     *
     * <p>An unlinked account is one whose verified identity could not be
     * resolved — see {@link #linkOnProvision}. Creating an entitlement here to
     * keep the request moving would create exactly the thing that must not
     * exist: an allowance with no identity mapping, which resets when the
     * account is deleted and remade.
     *
     * <p>503 rather than a 4xx, because it is true and temporary: nothing about
     * this account is wrong, and it will work as soon as Clerk answers. The
     * message says nothing about Clerk — a reader can do nothing with that, and
     * naming an internal dependency in an error string is how one ends up in a
     * screenshot.
     */
    @Transactional
    public String forAccount(String userId) {
        String linked = users.findById(userId)
                .map(UserEntity::getFreeTierEntitlementId)
                .orElse(null);
        if (linked != null) {
            return linked;
        }
        log.warn("Account {} has no free-tier entitlement, so its allowance cannot be read or "
                + "spent. Its verified identity has not resolved yet.", userId);
        throw ApiException.serviceUnavailable(
                "Reverie could not confirm your free allowance just now. Nothing has been used up "
                        + "-- try again in a moment.");
    }

    /** The counters, for the Usage panel. Absent only if the row has gone. */
    @Transactional(readOnly = true)
    public Optional<FreeTierEntitlement> read(String entitlementId) {
        return entitlements.findById(entitlementId);
    }

    /**
     * A new entitlement carrying whatever this account has already spent.
     *
     * <p>The seed is the migration (§20's "do not initialise everybody at
     * zero") expressed as code. For a genuinely new account there is no
     * {@code usage_limits} row and the seed is zero; for an account that
     * existed before this release it is exactly what that row says, so nobody
     * gains minutes by being early or late to sign in after the deploy.
     */
    private String createSeededEntitlement(String userId) {
        UsageLimit existing = usage.findByUserId(userId).orElse(null);
        int minutes = existing == null ? 0 : Math.max(0, existing.getAiMinutesUsed());
        int imports = existing == null ? 0 : Math.max(0, existing.getImportsUsed());
        String id = IdGenerator.freeTier();
        entitlements.insertIfAbsent(id, minutes, imports);
        if (minutes > 0 || imports > 0) {
            log.info("Carried {} minute(s) and {} import(s) of existing usage into a lifetime "
                    + "free-tier entitlement for account {}.", minutes, imports, userId);
        }
        return id;
    }
}
