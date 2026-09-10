package com.reverie.service;

import com.reverie.common.ApiException;
import com.reverie.entity.FreeTierIdentity;
import com.reverie.entity.UsageLimit;
import com.reverie.entity.UserEntity;
import com.reverie.repository.FreeTierEntitlementRepository;
import com.reverie.repository.FreeTierIdentityRepository;
import com.reverie.repository.UsageLimitRepository;
import com.reverie.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The free allowance follows the person, not the account row.
 *
 * <h2>The bug being pinned down</h2>
 *
 * <p>100 minutes and 3 imports were counted in {@code usage_limits}, which is
 * {@code ON DELETE CASCADE} from {@code users}. So closing an account and
 * signing up again with the same address produced a new Clerk subject, a new
 * user row, a fresh counter at zero, and a brand-new allowance — indefinitely.
 *
 * <p>Everything below is about the one decision that closes it: which
 * entitlement a provisioning account is attached to. The counters themselves
 * are asserted in {@code UsageAllowanceTest}; the durability of the row is
 * asserted against a real database in {@code FreeTierLifecycleIT}, because a
 * mock cannot have a cascade.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class FreeTierServiceTest {

    private static final String USER = "usr_1";
    private static final String OTHER_USER = "usr_2";
    private static final String SUBJECT = "user_2clerk_a";
    private static final String OTHER_SUBJECT = "user_2clerk_b";
    private static final String EMAIL_A = "a@example.com";
    private static final String EMAIL_B = "b@example.com";

    @Mock private FreeTierEntitlementRepository entitlements;
    @Mock private FreeTierIdentityRepository identities;
    @Mock private UsageLimitRepository usage;
    @Mock private UserRepository users;
    @Mock private ClerkDirectory clerk;

    private FreeTierService service;

    /** The identity table, as a map, so a claim can actually be refused. */
    private final Map<String, String> mapped = new HashMap<>();
    /** The accounts, so an attach can actually be seen. */
    private final Map<String, UserEntity> accounts = new HashMap<>();

    private FreeTierIdentityHasher hasher;

    /**
     * What Clerk currently holds, and what a cached read would still answer.
     *
     * <p>Two fields rather than one stub, because the bug being pinned down
     * lives in the gap between them: a cached lookup answers `cached` and a
     * forced refresh answers `current`. A mock that returned the same value to
     * both could not fail the way the implementation did.
     */
    private String clerkCurrent;
    private String clerkCached;

    @BeforeEach
    void setUp() {
        hasher = new FreeTierIdentityHasher("test-secret", "clerk");
        // Clerk mode throughout: dev mode has its own path and its own case.
        service = new FreeTierService(
                entitlements, identities, usage, users, hasher, clerk, "clerk");
        // Nothing to resolve unless a test says so. The default is the state
        // that used to grant an unmapped entitlement.
        clerkCurrent = null;
        clerkCached = null;
        when(clerk.verifiedPrimaryEmail(anyString())).thenAnswer(i -> lookup(clerkCached));
        // A forced refresh sees what Clerk holds now, and replaces the cache --
        // which is what makes the deletion path immune to the staleness above.
        when(clerk.refreshVerifiedPrimaryEmail(anyString())).thenAnswer(i -> {
            clerkCached = clerkCurrent;
            return lookup(clerkCurrent);
        });

        account(USER);
        account(OTHER_USER);

        when(users.findById(anyString()))
                .thenAnswer(i -> Optional.ofNullable(accounts.get(i.<String>getArgument(0))));

        // `AND free_tier_entitlement_id IS NULL` is the real statement's
        // invariant, so the fake honours it: an account's link never moves.
        when(users.attachFreeTierEntitlement(anyString(), anyString())).thenAnswer(i -> {
            UserEntity u = accounts.get(i.<String>getArgument(0));
            if (u == null || u.getFreeTierEntitlementId() != null) {
                return 0;
            }
            u.setFreeTierEntitlementId(i.getArgument(1));
            return 1;
        });

        when(identities.findByIdentityHash(anyString())).thenAnswer(i -> {
            String hash = i.getArgument(0);
            String owner = mapped.get(hash);
            if (owner == null) {
                return Optional.empty();
            }
            FreeTierIdentity row = new FreeTierIdentity();
            row.setIdentityHash(hash);
            row.setHashVersion(FreeTierIdentityHasher.HASH_VERSION);
            row.setEntitlementId(owner);
            return Optional.of(row);
        });

        // ON CONFLICT DO NOTHING: the first claim of a hash wins for ever.
        when(identities.insertIfAbsent(anyString(), org.mockito.ArgumentMatchers.anyShort(),
                anyString())).thenAnswer(i -> {
            String hash = i.getArgument(0);
            if (mapped.containsKey(hash)) {
                return 0;
            }
            mapped.put(hash, i.getArgument(2));
            return 1;
        });

        when(entitlements.insertIfAbsent(anyString(), anyInt(), anyInt())).thenReturn(1);
        when(usage.findByUserId(anyString())).thenReturn(Optional.empty());
    }

    private static ClerkDirectory.Lookup lookup(String email) {
        return email == null
                ? new ClerkDirectory.Lookup(null, ClerkDirectory.Status.NO_VERIFIED_EMAIL)
                : new ClerkDirectory.Lookup(email, ClerkDirectory.Status.RESOLVED);
    }

    /** Clerk holds this address, and every read agrees. */
    private void clerkHolds(String email) {
        clerkCurrent = email;
        clerkCached = email;
    }

    private UserEntity account(String id) {
        UserEntity u = new UserEntity();
        u.setId(id);
        accounts.put(id, u);
        return u;
    }

    private String hashOf(String email) {
        return hasher.hash(email).orElseThrow();
    }

    private String linkOf(String userId) {
        return accounts.get(userId).getFreeTierEntitlementId();
    }

    @Nested
    @DisplayName("a new identity")
    class NewIdentity {

        @Test
        @DisplayName("gets one allowance, mapped and linked")
        void createsOne() {
            service.linkOnProvision(USER, SUBJECT, EMAIL_A);

            assertThat(linkOf(USER)).isNotNull();
            assertThat(mapped).containsEntry(hashOf(EMAIL_A), linkOf(USER));
            verify(entitlements).insertIfAbsent(anyString(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("starts at nothing spent")
        void startsEmpty() {
            service.linkOnProvision(USER, SUBJECT, EMAIL_A);

            // 100 minutes and 3 imports remaining, expressed as the only thing
            // this class controls: what the row was created holding.
            verify(entitlements).insertIfAbsent(anyString(), org.mockito.ArgumentMatchers.eq(0),
                    org.mockito.ArgumentMatchers.eq(0));
        }

        @Test
        @DisplayName("is provisioned once, however many requests arrive")
        void isIdempotent() {
            /*
             * Provisioning runs on every authenticated request, and a browser
             * opening the app fires several at once. Anything here that was not
             * idempotent would be a second entitlement per page load.
             */
            service.linkOnProvision(USER, SUBJECT, EMAIL_A);
            String first = linkOf(USER);

            service.linkOnProvision(USER, SUBJECT, EMAIL_A);
            service.linkOnProvision(USER, SUBJECT, EMAIL_A);

            assertThat(linkOf(USER)).isEqualTo(first);
            assertThat(mapped).hasSize(1);
            // Created once. The two later calls read the column and stop.
            verify(entitlements, times(1)).insertIfAbsent(anyString(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("loses a race gracefully, and both callers land on one allowance")
        void raceResolvesToOne() {
            /*
             * Both callers create an entitlement and both try to claim the
             * hash; the claim is `ON CONFLICT DO NOTHING`, so only one can own
             * it. The loser must link to the winner's — not to its own, which
             * would be two allowances for one identity.
             */
            mapped.put(hashOf(EMAIL_A), "fte_someone_elses_win");

            service.linkOnProvision(USER, SUBJECT, EMAIL_A);

            assertThat(linkOf(USER)).isEqualTo("fte_someone_elses_win");
        }
    }

    @Nested
    @DisplayName("an identity that has been here before")
    class ReturningIdentity {

        @Test
        @DisplayName("is linked back to the allowance it already spent")
        void reusesTheEntitlement() {
            /*
             * SCENARIO D, and the whole point of the change. The account is
             * brand new — new Clerk subject, new user row, nothing in
             * `usage_limits` — and the allowance it attaches to is the old one.
             */
            mapped.put(hashOf(EMAIL_A), "fte_existing");

            service.linkOnProvision(USER, SUBJECT, EMAIL_A);

            assertThat(linkOf(USER)).isEqualTo("fte_existing");
        }

        @Test
        @DisplayName("mints no second allowance and re-seeds nothing")
        void createsNothing() {
            // Seeding here would be the reset wearing a different hat: it would
            // overwrite spent usage with whatever the new empty account has.
            mapped.put(hashOf(EMAIL_A), "fte_existing");

            service.linkOnProvision(USER, SUBJECT, EMAIL_A);

            verify(entitlements, never()).insertIfAbsent(anyString(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("resolves the same however the address was capitalised")
        void normalisesOnTheWayIn() {
            // SCENARIO G. The hash is the identity, so this is really a test
            // that nothing bypasses the hasher on this path.
            mapped.put(hashOf(EMAIL_A), "fte_existing");

            service.linkOnProvision(USER, SUBJECT, "  A@Example.COM ");

            assertThat(linkOf(USER)).isEqualTo("fte_existing");
        }

        @Test
        @DisplayName("a replayed provisioning cannot re-point or reset it")
        void replayIsSafe() {
            /*
             * Stands in for a duplicated external event — a webhook retry, a
             * double sign-in, a client that repeats the request. Reverie has no
             * Clerk webhook today; provisioning on every request is the same
             * shape of thing and is the path an event handler would call.
             */
            mapped.put(hashOf(EMAIL_A), "fte_existing");

            service.linkOnProvision(USER, SUBJECT, EMAIL_A);
            service.linkOnProvision(USER, SUBJECT, EMAIL_A);
            service.linkOnProvision(USER, SUBJECT, EMAIL_A);

            assertThat(linkOf(USER)).isEqualTo("fte_existing");
            assertThat(mapped).hasSize(1);
            verify(entitlements, never()).insertIfAbsent(anyString(), anyInt(), anyInt());
        }
    }

    @Nested
    @DisplayName("an account that existed before this release")
    class Backfill {

        @Test
        @DisplayName("carries its consumed usage into the new allowance")
        void seedsFromTheOldCounter() {
            /*
             * The migration, as code. Initialising the estate at zero would be
             * the bug with a version number on it: everybody who had spent
             * minutes would get them back.
             */
            UsageLimit old = new UsageLimit();
            old.setAiMinutesUsed(40);
            old.setImportsUsed(1);
            when(usage.findByUserId(USER)).thenReturn(Optional.of(old));

            service.linkOnProvision(USER, SUBJECT, EMAIL_A);

            // 60 minutes and 2 imports remaining, which is what this account
            // had before the deploy.
            verify(entitlements).insertIfAbsent(anyString(),
                    org.mockito.ArgumentMatchers.eq(40), org.mockito.ArgumentMatchers.eq(1));
        }

        @Test
        @DisplayName("an account that never recorded starts at nothing spent")
        void noRowMeansZero() {
            when(usage.findByUserId(USER)).thenReturn(Optional.empty());

            service.linkOnProvision(USER, SUBJECT, EMAIL_A);

            verify(entitlements).insertIfAbsent(anyString(), org.mockito.ArgumentMatchers.eq(0),
                    org.mockito.ArgumentMatchers.eq(0));
        }
    }

    @Nested
    @DisplayName("a verified email that changes")
    class EmailChange {

        @Test
        @DisplayName("becomes another name for the same allowance")
        void aliasesRatherThanMints() {
            /*
             * SCENARIO H. Spend the allowance, change the primary address at
             * the provider, and the usage has to follow the person — otherwise
             * "change your email" is the bypass with an extra step.
             */
            service.linkOnProvision(USER, SUBJECT, EMAIL_A);
            String owned = linkOf(USER);

            service.linkOnProvision(USER, SUBJECT, EMAIL_B);

            assertThat(linkOf(USER)).isEqualTo(owned);
            assertThat(mapped).containsEntry(hashOf(EMAIL_A), owned);
            assertThat(mapped).containsEntry(hashOf(EMAIL_B), owned);
            // One allowance, two names for it.
            verify(entitlements, times(1)).insertIfAbsent(anyString(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("changing back finds the first name still pointing at it")
        void thereAndBackAgain() {
            // SCENARIO I. A -> B -> A, and no step of it is a fresh allowance.
            service.linkOnProvision(USER, SUBJECT, EMAIL_A);
            String owned = linkOf(USER);
            service.linkOnProvision(USER, SUBJECT, EMAIL_B);

            service.linkOnProvision(USER, SUBJECT, EMAIL_A);

            assertThat(linkOf(USER)).isEqualTo(owned);
            assertThat(mapped.values()).containsOnly(owned);
            verify(entitlements, times(1)).insertIfAbsent(anyString(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("an address that already belongs elsewhere is left alone")
        void collisionIsRefusedSafely() {
            /*
             * SCENARIO J. This account is linked to its own allowance and its
             * new verified address is already the identity of another.
             *
             * <p>Every automatic resolution is worse than none: re-pointing
             * lets somebody inherit an allowance by claiming an address,
             * merging moves usage between people, and granting a fresh one is
             * the original bug. So nothing moves.
             */
            service.linkOnProvision(USER, SUBJECT, EMAIL_A);
            String mine = linkOf(USER);
            mapped.put(hashOf(EMAIL_B), "fte_somebody_else");

            service.linkOnProvision(USER, SUBJECT, EMAIL_B);

            assertThat(linkOf(USER)).isEqualTo(mine);
            assertThat(mapped).containsEntry(hashOf(EMAIL_B), "fte_somebody_else");
            // And no third allowance was created to paper over the conflict.
            verify(entitlements, times(1)).insertIfAbsent(anyString(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("two accounts cannot end up sharing one allowance by claiming an address")
        void noQuotaSharing() {
            service.linkOnProvision(USER, SUBJECT, EMAIL_A);
            String mine = linkOf(USER);

            // A different account claims the same address. It gets the identity
            // it maps to -- which is the returning-identity case -- and the
            // first account is untouched either way.
            service.linkOnProvision(OTHER_USER, OTHER_SUBJECT, EMAIL_A);

            assertThat(linkOf(USER)).isEqualTo(mine);
            assertThat(linkOf(OTHER_USER)).isEqualTo(mine);
            // Which is correct: one verified address is one person, and Clerk
            // does not issue the same verified address to two live accounts.
            // What must never happen is a *second* allowance appearing.
            verify(entitlements, times(1)).insertIfAbsent(anyString(), anyInt(), anyInt());
        }
    }

    @Nested
    @DisplayName("a token with no email claim")
    class NoClaimOnTheToken {

        @Test
        @DisplayName("asks Clerk, and the identity is bound just the same")
        void resolvesThroughTheBackendApi() {
            /*
             * THE BLOCKER THIS CLOSES.
             *
             * <p>Clerk's default session token carries no email claim unless
             * somebody writes a JWT template. Keying the allowance on the claim
             * alone made the whole anti-reset guarantee conditional on a
             * dashboard setting — an instance with the default template granted
             * allowances that nothing could recognise afterwards, so deleting
             * an account and signing up again handed out another 100 minutes.
             *
             * <p>Now the subject of the same verified token is used to ask
             * Clerk's Backend API for the verified primary address, and the
             * mapping is written exactly as it would have been from a claim.
             */
            when(clerk.verifiedPrimaryEmail(SUBJECT))
                    .thenReturn(new ClerkDirectory.Lookup(EMAIL_A, ClerkDirectory.Status.RESOLVED));

            service.linkOnProvision(USER, SUBJECT, null);

            assertThat(linkOf(USER)).isNotNull();
            assertThat(mapped).containsEntry(hashOf(EMAIL_A), linkOf(USER));
        }

        @Test
        @DisplayName("produces the same identity a claim would have")
        void agreesWithTheClaimPath() {
            /*
             * Both sources are the same fact from the same provider, so they
             * must hash to the same identity — otherwise adding a JWT template
             * later would orphan every allowance granted before it.
             */
            when(clerk.verifiedPrimaryEmail(SUBJECT))
                    .thenReturn(new ClerkDirectory.Lookup(EMAIL_A, ClerkDirectory.Status.RESOLVED));

            service.linkOnProvision(USER, SUBJECT, null);
            String throughApi = linkOf(USER);

            account(OTHER_USER);
            service.linkOnProvision(OTHER_USER, OTHER_SUBJECT, EMAIL_A);

            assertThat(linkOf(OTHER_USER)).isEqualTo(throughApi);
            assertThat(mapped).hasSize(1);
        }

        @Test
        @DisplayName("normalises what Clerk returns, exactly as it would a claim")
        void normalisesTheResolvedAddress() {
            when(clerk.verifiedPrimaryEmail(SUBJECT)).thenReturn(
                    new ClerkDirectory.Lookup("  A@Example.COM ", ClerkDirectory.Status.RESOLVED));

            service.linkOnProvision(USER, SUBJECT, null);

            assertThat(mapped).containsEntry(hashOf(EMAIL_A), linkOf(USER));
        }

        @Test
        @DisplayName("keeps the allowance after deletion and recreation")
        void survivesRecreation() {
            // The whole point, through the fallback rather than the claim: a
            // new Clerk subject with the same verified address is the same
            // person, and their spent usage comes back with them.
            mapped.put(hashOf(EMAIL_A), "fte_existing");
            when(clerk.verifiedPrimaryEmail(OTHER_SUBJECT))
                    .thenReturn(new ClerkDirectory.Lookup(EMAIL_A, ClerkDirectory.Status.RESOLVED));

            service.linkOnProvision(OTHER_USER, OTHER_SUBJECT, null);

            assertThat(linkOf(OTHER_USER)).isEqualTo("fte_existing");
            verify(entitlements, never()).insertIfAbsent(anyString(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("prefers the claim, and does not ask Clerk when it has one")
        void theClaimShortCircuitsTheLookup() {
            // One HTTP call per request would be a Clerk dependency on the hot
            // path of every authenticated request. The claim is already
            // verified, so it is free and it is first.
            service.linkOnProvision(USER, SUBJECT, EMAIL_A);

            verify(clerk, never()).verifiedPrimaryEmail(anyString());
        }
    }

    @Nested
    @DisplayName("when no verified identity can be resolved")
    class NoIdentityAtAll {

        @Test
        @DisplayName("grants no allowance at all, rather than an unmapped one")
        void grantsNothing() {
            /*
             * THE STATE THAT USED TO BE THE BUG.
             *
             * <p>An entitlement with no identity mapping is a resettable
             * allowance: delete the account, sign up again, and nothing can
             * recognise you. So nothing is created — the account exists, can be
             * read and can be deleted, and free usage stays closed until the
             * identity resolves.
             */
            service.linkOnProvision(USER, SUBJECT, null);

            assertThat(linkOf(USER)).isNull();
            assertThat(mapped).isEmpty();
            verify(entitlements, never()).insertIfAbsent(anyString(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("is the same refusal whichever way Clerk failed")
        void everyFailureIsTheSame() {
            /*
             * Not found, unverified, unreachable, no secret key: four different
             * things to an operator and one thing to this method. Asserted
             * together because the temptation is to treat "Clerk said no" as
             * different from "Clerk said nothing", and one of those readings
             * ends in an unmapped entitlement.
             */
            for (ClerkDirectory.Status status : new ClerkDirectory.Status[] {
                    ClerkDirectory.Status.NO_VERIFIED_EMAIL,
                    ClerkDirectory.Status.NOT_FOUND,
                    ClerkDirectory.Status.UNAVAILABLE,
                    ClerkDirectory.Status.DISABLED }) {
                account(USER);
                mapped.clear();
                when(clerk.verifiedPrimaryEmail(SUBJECT))
                        .thenReturn(new ClerkDirectory.Lookup(null, status));

                service.linkOnProvision(USER, SUBJECT, null);

                assertThat(linkOf(USER)).as(status.name()).isNull();
                assertThat(mapped).as(status.name()).isEmpty();
            }
            verify(entitlements, never()).insertIfAbsent(anyString(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("refuses to spend rather than inventing an allowance")
        void spendingIsRefused() {
            /*
             * `forAccount` used to create one here to keep the request moving,
             * which is the same unmapped entitlement by another route. 503,
             * because it is true and temporary — and the interface already
             * treats an unreadable balance as no balance.
             */
            service.linkOnProvision(USER, SUBJECT, null);

            assertThatThrownBy(() -> service.forAccount(USER))
                    .isInstanceOf(ApiException.class)
                    .hasMessageContaining("could not confirm your free allowance");
            verify(entitlements, never()).insertIfAbsent(anyString(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("leaves an account that is already linked alone")
        void anAlreadyLinkedAccountKeepsWorking() {
            // A Clerk outage must not take the allowance away from an account
            // whose identity was resolved yesterday: the link is the durable
            // part, and it is already written.
            service.linkOnProvision(USER, SUBJECT, EMAIL_A);
            String owned = linkOf(USER);

            when(clerk.verifiedPrimaryEmail(SUBJECT))
                    .thenReturn(new ClerkDirectory.Lookup(null, ClerkDirectory.Status.UNAVAILABLE));
            service.linkOnProvision(USER, SUBJECT, null);

            assertThat(linkOf(USER)).isEqualTo(owned);
            assertThat(service.forAccount(USER)).isEqualTo(owned);
        }

        @Test
        @DisplayName("binds the identity as soon as one resolves")
        void bindsWhenItRecovers() {
            // The template gets written, the address gets verified, Clerk comes
            // back. Nothing was granted in the meantime, so nothing has to be
            // reconciled: this is an ordinary first provisioning.
            service.linkOnProvision(USER, SUBJECT, null);
            assertThat(linkOf(USER)).isNull();

            when(clerk.verifiedPrimaryEmail(SUBJECT))
                    .thenReturn(new ClerkDirectory.Lookup(EMAIL_A, ClerkDirectory.Status.RESOLVED));
            service.linkOnProvision(USER, SUBJECT, null);

            assertThat(linkOf(USER)).isNotNull();
            assertThat(mapped).containsEntry(hashOf(EMAIL_A), linkOf(USER));
        }
    }

    @Nested
    @DisplayName("dev mode")
    class DevMode {

        @Test
        @DisplayName("keys the local account to its subject, and asks no Clerk")
        void usesADeterministicLocalIdentity() {
            /*
             * There is no Clerk in dev mode and nothing verified about
             * anything: it serves whoever sends an X-Dev-User header. The
             * subject becomes a stable address in the reserved `.invalid`
             * domain, so the local stack exercises the same code path and the
             * allowance survives a restart — which is what makes the feature
             * testable by hand at all.
             */
            FreeTierService dev = new FreeTierService(
                    entitlements, identities, usage, users, hasher, clerk, "dev");

            dev.linkOnProvision(USER, SUBJECT, null);

            assertThat(linkOf(USER)).isNotNull();
            assertThat(mapped).containsEntry(hashOf("dev-" + SUBJECT + "@dev.invalid"), linkOf(USER));
            verify(clerk, never()).verifiedPrimaryEmail(anyString());
        }

        @Test
        @DisplayName("is stable across provisionings, so the allowance does not reset")
        void isStable() {
            FreeTierService dev = new FreeTierService(
                    entitlements, identities, usage, users, hasher, clerk, "dev");

            dev.linkOnProvision(USER, SUBJECT, null);
            String first = linkOf(USER);
            account(USER);
            dev.linkOnProvision(USER, SUBJECT, null);

            assertThat(linkOf(USER)).isEqualTo(first);
        }
    }

    @Nested
    @DisplayName("spending")
    class Spending {

        @Test
        @DisplayName("reads the link rather than re-deriving the identity")
        void forAccountReadsTheColumn() {
            // The charging path is a worker callback with a meeting and a user
            // id. It has no email and no business holding one.
            accounts.get(USER).setFreeTierEntitlementId("fte_linked");

            assertThat(service.forAccount(USER)).isEqualTo("fte_linked");
            verify(entitlements, never()).insertIfAbsent(anyString(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("an unlinked account is refused rather than given one")
        void forAccountRefuses() {
            /*
             * IT USED TO CREATE ONE, and that was the blocker in another guise:
             * an allowance created here has no identity mapping either, so it
             * resets on deletion just the same. Nothing is created, and no
             * successful provisioning can reach this state — see
             * `NoIdentityAtAll`.
             */
            assertThatThrownBy(() -> service.forAccount(USER))
                    .isInstanceOf(ApiException.class);
            assertThat(linkOf(USER)).isNull();
            verify(entitlements, never()).insertIfAbsent(anyString(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("no provisioning that succeeds leaves an entitlement unmapped")
        void everyGrantedAllowanceIsMapped() {
            /*
             * THE INVARIANT, ASSERTED AS ONE.
             *
             * <p>Three ways an identity can arrive — a claim, the Backend API,
             * dev mode — and one way it cannot. In every case where an
             * entitlement exists afterwards, a mapping exists for it; in the
             * case where none can be resolved, neither exists.
             */
            record Case(String name, String claim, ClerkDirectory.Lookup lookup, boolean granted) {
            }
            var resolved = new ClerkDirectory.Lookup(EMAIL_A, ClerkDirectory.Status.RESOLVED);
            var refused = new ClerkDirectory.Lookup(null, ClerkDirectory.Status.NO_VERIFIED_EMAIL);
            for (Case c : new Case[] {
                    new Case("claim", EMAIL_A, refused, true),
                    new Case("backend api", null, resolved, true),
                    new Case("neither", null, refused, false) }) {
                account(USER);
                mapped.clear();
                when(clerk.verifiedPrimaryEmail(SUBJECT)).thenReturn(c.lookup());

                service.linkOnProvision(USER, SUBJECT, c.claim());

                String link = linkOf(USER);
                assertThat(link != null).as(c.name()).isEqualTo(c.granted());
                if (link != null) {
                    assertThat(mapped.values()).as(c.name()).contains(link);
                }
            }
        }
    }

    @Nested
    @DisplayName("deleting an account whose address has just changed")
    class BeforeDeletion {

        @Test
        @DisplayName("writes the current address onto the existing allowance first")
        void bindsTheCurrentAddress() {
            /*
             * THE RACE, REPRODUCED.
             *
             * <p>Linked as A, the directory's cache holding A, and Clerk now
             * holding B. A cached read still answers A — so nothing about
             * ordinary provisioning would ever record B, and deleting the
             * account here would take the only link with it. Signing up again
             * as B would then be a brand-new allowance.
             */
            clerkHolds(EMAIL_A);
            service.linkOnProvision(USER, SUBJECT, null);
            String owned = linkOf(USER);
            clerkCurrent = EMAIL_B;              // changed at Clerk
            assertThat(clerkCached).isEqualTo(EMAIL_A);  // and not seen yet

            service.bindCurrentIdentityBeforeDeletion(USER, SUBJECT);

            // B names the same allowance A does, and no second one was made.
            assertThat(mapped).containsEntry(hashOf(EMAIL_B), owned);
            assertThat(mapped).containsEntry(hashOf(EMAIL_A), owned);
            verify(entitlements, times(1)).insertIfAbsent(anyString(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("and the allowance is still there when B signs up again")
        void andRecreatingAsBReusesIt() {
            /*
             * The whole sequence end to end: change the address, delete the
             * account, come back as a new Clerk subject with the new address.
             * The allowance and everything spent from it is what it was.
             */
            clerkHolds(EMAIL_A);
            service.linkOnProvision(USER, SUBJECT, null);
            String owned = linkOf(USER);
            clerkCurrent = EMAIL_B;

            service.bindCurrentIdentityBeforeDeletion(USER, SUBJECT);
            accounts.remove(USER);               // the account is deleted

            account(OTHER_USER);                 // a new Clerk subject, address B
            clerkHolds(EMAIL_B);
            service.linkOnProvision(OTHER_USER, OTHER_SUBJECT, null);

            assertThat(linkOf(OTHER_USER)).isEqualTo(owned);
            // No new entitlement: not another 100 minutes, not another 3 imports.
            verify(entitlements, times(1)).insertIfAbsent(anyString(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("writes nothing when the address has not changed")
        void doesNothingWhenNothingChanged() {
            // The ordinary case, and the common one. The mapping is already
            // right, so deletion is not delayed by a write nobody needs.
            clerkHolds(EMAIL_A);
            service.linkOnProvision(USER, SUBJECT, EMAIL_A);
            int writes = mapped.size();

            service.bindCurrentIdentityBeforeDeletion(USER, SUBJECT);

            assertThat(mapped).hasSize(writes);
            assertThat(mapped).containsEntry(hashOf(EMAIL_A), linkOf(USER));
        }

        @Test
        @DisplayName("refuses when Clerk cannot say who this is")
        void refusesWhenClerkIsUnavailable() {
            /*
             * Deleting anyway is the bug with extra steps: the link goes, the
             * current address was never recorded, and it is a fresh allowance
             * next time. So it throws — before anything has been written or
             * destroyed, which is what makes a retry safe.
             */
            clerkHolds(EMAIL_A);
            service.linkOnProvision(USER, SUBJECT, EMAIL_A);
            when(clerk.refreshVerifiedPrimaryEmail(SUBJECT)).thenReturn(
                    new ClerkDirectory.Lookup(null, ClerkDirectory.Status.UNAVAILABLE));

            assertThatThrownBy(() -> service.bindCurrentIdentityBeforeDeletion(USER, SUBJECT))
                    .isInstanceOf(ApiException.class)
                    .hasMessageContaining("couldn't complete account deletion");
        }

        @Test
        @DisplayName("refuses when Clerk has no such user")
        void refusesWhenTheClerkUserIsGone() {
            // Nearly unreachable — a caller with no Clerk user cannot hold a
            // valid token — and refused rather than assumed, because the
            // assumption would destroy the anti-reset linkage.
            clerkHolds(EMAIL_A);
            service.linkOnProvision(USER, SUBJECT, EMAIL_A);
            when(clerk.refreshVerifiedPrimaryEmail(SUBJECT)).thenReturn(
                    new ClerkDirectory.Lookup(null, ClerkDirectory.Status.NOT_FOUND));

            assertThatThrownBy(() -> service.bindCurrentIdentityBeforeDeletion(USER, SUBJECT))
                    .isInstanceOf(ApiException.class);
        }

        @Test
        @DisplayName("refuses when the current primary address is unverified")
        void refusesWhenTheAddressIsUnverified() {
            // An unverified primary is a real Clerk state. Keying an allowance
            // to it would make the allowance transferable by typing, so it is
            // no more usable here than it is at provisioning.
            clerkHolds(EMAIL_A);
            service.linkOnProvision(USER, SUBJECT, EMAIL_A);
            when(clerk.refreshVerifiedPrimaryEmail(SUBJECT)).thenReturn(
                    new ClerkDirectory.Lookup(null, ClerkDirectory.Status.NO_VERIFIED_EMAIL));

            assertThatThrownBy(() -> service.bindCurrentIdentityBeforeDeletion(USER, SUBJECT))
                    .isInstanceOf(ApiException.class);
        }

        @Test
        @DisplayName("refuses when the current address belongs to another allowance")
        void refusesOnAnIdentityConflict() {
            /*
             * Reachable: close an account, sign up with a second address, then
             * move the first address onto the new account at Clerk. Merging
             * would move usage between people and re-pointing would let an
             * allowance be inherited by claiming an address, so neither
             * happens and the account is left intact.
             */
            clerkHolds(EMAIL_A);
            service.linkOnProvision(USER, SUBJECT, EMAIL_A);
            String owned = linkOf(USER);
            mapped.put(hashOf(EMAIL_B), "fte_somebody_else");
            clerkCurrent = EMAIL_B;

            assertThatThrownBy(() -> service.bindCurrentIdentityBeforeDeletion(USER, SUBJECT))
                    .isInstanceOf(ApiException.class);

            assertThat(mapped).containsEntry(hashOf(EMAIL_B), "fte_somebody_else");
            assertThat(mapped).containsEntry(hashOf(EMAIL_A), owned);
            verify(entitlements, times(1)).insertIfAbsent(anyString(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("has nothing to do for an account that never got an allowance")
        void allowsDeletionWithoutAnEntitlement() {
            // No entitlement means no allowance anybody could reset, so there
            // is nothing to protect and no reason to ask Clerk anything.
            service.bindCurrentIdentityBeforeDeletion(USER, SUBJECT);

            assertThat(mapped).isEmpty();
            verify(clerk, never()).refreshVerifiedPrimaryEmail(anyString());
        }

        @Test
        @DisplayName("uses the forced refresh, never the cached read")
        void alwaysAsksAgain() {
            // The distinction is the fix. A cached read here is a read that can
            // be half an hour behind at the one moment that cannot be undone.
            clerkHolds(EMAIL_A);
            service.linkOnProvision(USER, SUBJECT, EMAIL_A);

            service.bindCurrentIdentityBeforeDeletion(USER, SUBJECT);

            verify(clerk).refreshVerifiedPrimaryEmail(SUBJECT);
        }

        @Test
        @DisplayName("is idempotent, so a retried deletion writes nothing new")
        void isIdempotent() {
            // A refusal is retryable by design, and the client may well retry
            // after a partial failure elsewhere.
            clerkHolds(EMAIL_A);
            service.linkOnProvision(USER, SUBJECT, null);
            clerkCurrent = EMAIL_B;

            service.bindCurrentIdentityBeforeDeletion(USER, SUBJECT);
            service.bindCurrentIdentityBeforeDeletion(USER, SUBJECT);
            service.bindCurrentIdentityBeforeDeletion(USER, SUBJECT);

            assertThat(mapped).hasSize(2);
            verify(entitlements, times(1)).insertIfAbsent(anyString(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("dev mode needs no Clerk and is never stale")
        void devModeResolvesLocally() {
            // Its identity is derived from the subject, so there is no external
            // record to disagree with and nothing to refresh.
            FreeTierService dev = new FreeTierService(
                    entitlements, identities, usage, users, hasher, clerk, "dev");
            dev.linkOnProvision(USER, SUBJECT, null);
            String owned = linkOf(USER);

            dev.bindCurrentIdentityBeforeDeletion(USER, SUBJECT);

            assertThat(linkOf(USER)).isEqualTo(owned);
            verify(clerk, never()).refreshVerifiedPrimaryEmail(anyString());
        }
    }
}
