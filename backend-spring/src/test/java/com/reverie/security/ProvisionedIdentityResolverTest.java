package com.reverie.security;

import com.reverie.common.ApiException;
import com.reverie.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * What the resolver is allowed to remember, and what it must never skip.
 *
 * <p>The cost this class exists to remove is a transaction, not a query, so the
 * property under test throughout is "{@code provision} was not called" rather
 * than "the answer was right". An early return inside the transactional method
 * would satisfy the second and none of the first.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ProvisionedIdentityResolverTest {

    private static final String SUBJECT = "user_2clerk";
    private static final String OTHER = "user_2other";
    private static final String EMAIL = "someone@example.test";
    private static final String LOCAL = "usr_local";

    @Mock private UserService users;

    private ProvisionedIdentityResolver resolver;

    /** Open to everybody, which is the default deployment shape. */
    private static SelfOnlyAccess open() {
        return new SelfOnlyAccess(false, "");
    }

    @BeforeEach
    void setUp() {
        resolver = new ProvisionedIdentityResolver(users, open());
        when(users.provision(anyString(), any())).thenReturn(LOCAL);
    }

    @Nested
    @DisplayName("the hot path")
    class HotPath {

        @Test
        @DisplayName("a subject nobody has seen goes through the full provisioning path")
        void coldSubjectProvisions() {
            assertThat(resolver.resolve(SUBJECT, EMAIL)).isEqualTo(LOCAL);

            verify(users).provision(SUBJECT, EMAIL);
        }

        @Test
        @DisplayName("THE POINT: a second identical request does not enter provisioning at all")
        void secondRequestDoesNotProvision() {
            /*
             * The core property of the whole change, and the reason the cache
             * could not live inside `provision`: this asserts the transactional
             * method is never entered, which is what keeps the system-pool
             * checkout, its `set_config` and its commit off the request.
             */
            resolver.resolve(SUBJECT, EMAIL);
            resolver.resolve(SUBJECT, EMAIL);
            resolver.resolve(SUBJECT, EMAIL);

            verify(users, times(1)).provision(SUBJECT, EMAIL);
        }

        @Test
        @DisplayName("and answers with the same local id it provisioned")
        void cachedAnswerMatches() {
            String first = resolver.resolve(SUBJECT, EMAIL);
            String second = resolver.resolve(SUBJECT, EMAIL);

            assertThat(second).isEqualTo(first).isEqualTo(LOCAL);
        }

        @Test
        @DisplayName("two subjects never share an entry")
        void distinctSubjectsAreDistinct() {
            when(users.provision(SUBJECT, EMAIL)).thenReturn("usr_one");
            when(users.provision(OTHER, EMAIL)).thenReturn("usr_two");

            assertThat(resolver.resolve(SUBJECT, EMAIL)).isEqualTo("usr_one");
            assertThat(resolver.resolve(OTHER, EMAIL)).isEqualTo("usr_two");
            // And again, from cache, still not crossed.
            assertThat(resolver.resolve(SUBJECT, EMAIL)).isEqualTo("usr_one");
            assertThat(resolver.resolve(OTHER, EMAIL)).isEqualTo("usr_two");
        }

        @Test
        @DisplayName("a blank subject resolves to nothing and provisions nothing")
        void blankSubjectIsNobody() {
            assertThat(resolver.resolve("  ", EMAIL)).isNull();
            assertThat(resolver.resolve(null, EMAIL)).isNull();

            verify(users, never()).provision(anyString(), any());
        }
    }

    @Nested
    @DisplayName("the email claim")
    class EmailClaim {

        @Test
        @DisplayName("a changed address is a miss immediately, without waiting for the TTL")
        void changedEmailMissesAtOnce() {
            /*
             * The behaviour this cache was not allowed to cost us. When the
             * token carries an address, a change is visible on the very next
             * request today, and provisioning is what writes it to the row and
             * aliases it onto the existing entitlement.
             */
            resolver.resolve(SUBJECT, EMAIL);
            resolver.resolve(SUBJECT, "moved@example.test");

            verify(users).provision(SUBJECT, EMAIL);
            verify(users).provision(SUBJECT, "moved@example.test");
        }

        @Test
        @DisplayName("a token with no address cannot contradict what was cached")
        void absentClaimKeepsTheEntry() {
            /*
             * Silence is not a change. A default Clerk template carries no
             * email claim at all, and treating that as a miss would put every
             * such deployment back on a provisioning round trip per request --
             * the exact cost being removed. ClerkDirectory's own TTL governs
             * refresh in that case, and it is the same half hour.
             */
            resolver.resolve(SUBJECT, EMAIL);
            resolver.resolve(SUBJECT, null);
            resolver.resolve(SUBJECT, null);

            verify(users, times(1)).provision(anyString(), any());
        }

        @Test
        @DisplayName("learning an address for the first time is a change")
        void firstSightOfAnAddressMisses() {
            resolver.resolve(SUBJECT, null);
            resolver.resolve(SUBJECT, EMAIL);

            verify(users).provision(SUBJECT, null);
            verify(users).provision(SUBJECT, EMAIL);
        }

        @Test
        @DisplayName("a difference of case is a difference, because provision() compares exactly")
        void caseChangeMisses() {
            /*
             * `provision` decides whether to write the column with
             * `!email.equals(user.getEmail())`, which is case-sensitive.
             * Normalising here would hide a write the application would
             * otherwise perform.
             */
            resolver.resolve(SUBJECT, "Someone@example.test");
            resolver.resolve(SUBJECT, "someone@example.test");

            verify(users, times(2)).provision(anyString(), any());
        }
    }

    @Nested
    @DisplayName("expiry and loss")
    class Expiry {

        @Test
        @DisplayName("an expired entry provisions again")
        void ttlExpiryReprovisions() throws Exception {
            ProvisionedIdentityResolver brief =
                    new ProvisionedIdentityResolver(users, open(), Duration.ofMillis(30));

            brief.resolve(SUBJECT, EMAIL);
            Thread.sleep(60);
            brief.resolve(SUBJECT, EMAIL);

            verify(users, times(2)).provision(SUBJECT, EMAIL);
        }

        @Test
        @DisplayName("an empty cache behaves exactly as the database-only path did")
        void restartIsHarmless() {
            resolver.resolve(SUBJECT, EMAIL);
            resolver.clear();   // what a restart leaves behind

            assertThat(resolver.resolve(SUBJECT, EMAIL)).isEqualTo(LOCAL);
            verify(users, times(2)).provision(SUBJECT, EMAIL);
        }

        @Test
        @DisplayName("forgetting a subject sends the next request back to provisioning")
        void forgetEvicts() {
            resolver.resolve(SUBJECT, EMAIL);
            assertThat(resolver.remembers(SUBJECT)).isTrue();

            resolver.forget(SUBJECT);

            assertThat(resolver.remembers(SUBJECT)).isFalse();
            resolver.resolve(SUBJECT, EMAIL);
            verify(users, times(2)).provision(SUBJECT, EMAIL);
        }
    }

    @Nested
    @DisplayName("what must never be cached")
    class NeverCached {

        @Test
        @DisplayName("a provisioning refusal is not remembered as an answer")
        void refusalIsNotCached() {
            when(users.provision(SUBJECT, EMAIL))
                    .thenThrow(ApiException.forbidden("spent its lifetime allowance"));

            assertThatThrownBy(() -> resolver.resolve(SUBJECT, EMAIL))
                    .isInstanceOf(ApiException.class);

            assertThat(resolver.remembers(SUBJECT)).isFalse();
        }

        @Test
        @DisplayName("and the refusal keeps its own status rather than becoming a 401")
        void refusalPropagatesUnwrapped() {
            ApiException refused = ApiException.forbidden("this deployment is private");
            when(users.provision(SUBJECT, EMAIL)).thenThrow(refused);

            assertThatThrownBy(() -> resolver.resolve(SUBJECT, EMAIL)).isSameAs(refused);
        }

        @Test
        @DisplayName("a database failure is not remembered, so the next request retries")
        void failureIsNotCached() {
            when(users.provision(SUBJECT, EMAIL))
                    .thenThrow(new IllegalStateException("connection reset"))
                    .thenReturn(LOCAL);

            assertThatThrownBy(() -> resolver.resolve(SUBJECT, EMAIL))
                    .isInstanceOf(IllegalStateException.class);
            assertThat(resolver.remembers(SUBJECT)).isFalse();

            assertThat(resolver.resolve(SUBJECT, EMAIL)).isEqualTo(LOCAL);
            verify(users, times(2)).provision(SUBJECT, EMAIL);
        }

        @Test
        @DisplayName("a provisioning result of nothing is not remembered either")
        void blankResultIsNotCached() {
            when(users.provision(SUBJECT, EMAIL)).thenReturn("  ");

            resolver.resolve(SUBJECT, EMAIL);

            assertThat(resolver.remembers(SUBJECT)).isFalse();
        }
    }

    @Nested
    @DisplayName("self-only access")
    class SelfOnly {

        @Test
        @DisplayName("a refused subject never reaches provisioning and is never cached")
        void refusedSubjectTouchesNothing() {
            ProvisionedIdentityResolver gated = new ProvisionedIdentityResolver(
                    users, new SelfOnlyAccess(true, "the_owner"));

            assertThatThrownBy(() -> gated.resolve(SUBJECT, EMAIL))
                    .isInstanceOf(ApiException.class);

            verifyNoInteractions(users);
            assertThat(gated.remembers(SUBJECT)).isFalse();
        }

        @Test
        @DisplayName("THE GATE RUNS ON A CACHE HIT TOO, not only on the miss that filled it")
        void enforcedOnEveryRequestIncludingHits() {
            /*
             * A cache hit says which row belongs to a subject. It does not say
             * the subject is still allowed in, and a cache that answered
             * without asking would keep a revoked identity working until a
             * timer expired.
             */
            SelfOnlyAccess gate = mock(SelfOnlyAccess.class);
            ProvisionedIdentityResolver watched = new ProvisionedIdentityResolver(users, gate);

            watched.resolve(SUBJECT, EMAIL);   // miss
            watched.resolve(SUBJECT, EMAIL);   // hit
            watched.resolve(SUBJECT, EMAIL);   // hit

            verify(gate, times(3)).requireOrThrow(SUBJECT);
            verify(users, times(1)).provision(SUBJECT, EMAIL);
        }

        @Test
        @DisplayName("and the gate is asked before the cache, so a refusal cannot be short-circuited")
        void gateRunsBeforeTheCache() {
            SelfOnlyAccess gate = mock(SelfOnlyAccess.class);
            ProvisionedIdentityResolver watched = new ProvisionedIdentityResolver(users, gate);
            watched.resolve(SUBJECT, EMAIL);

            org.mockito.Mockito.doThrow(ApiException.forbidden("revoked"))
                    .when(gate).requireOrThrow(SUBJECT);

            assertThatThrownBy(() -> watched.resolve(SUBJECT, EMAIL))
                    .isInstanceOf(ApiException.class);
        }
    }

    @Nested
    @DisplayName("concurrency")
    class Concurrency {

        @Test
        @DisplayName("concurrent first requests all get one id, and the database stays the authority")
        void concurrentColdRequestsAreRaceSafe() throws Exception {
            /*
             * No per-key locking on purpose. Several cold requests may all
             * provision; `insertIfAbsent` already decides that race in
             * Postgres and every caller reads the same winner, so the worst
             * case is a few redundant lookups on the first request of a new
             * subject -- not a wrong answer, and not a lock to get wrong.
             */
            int threads = 16;
            ExecutorService pool = Executors.newFixedThreadPool(threads);
            CountDownLatch start = new CountDownLatch(1);
            Set<String> seen = ConcurrentHashMap.newKeySet();
            List<java.util.concurrent.Future<?>> runs = new java.util.ArrayList<>();

            try {
                for (int i = 0; i < threads; i++) {
                    runs.add(pool.submit(() -> {
                        start.await();
                        seen.add(resolver.resolve(SUBJECT, EMAIL));
                        return null;
                    }));
                }
                start.countDown();
                for (var run : runs) {
                    run.get(10, TimeUnit.SECONDS);
                }
            } finally {
                pool.shutdownNow();
            }

            assertThat(seen).containsExactly(LOCAL);
            assertThat(resolver.remembers(SUBJECT)).isTrue();
        }
    }
}
