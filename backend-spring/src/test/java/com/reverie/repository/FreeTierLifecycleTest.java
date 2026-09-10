package com.reverie.repository;

import com.reverie.ReverieApplication;
import com.reverie.common.ApiException;
import com.reverie.entity.FreeTierEntitlement;
import com.reverie.security.TenantContext;
import com.reverie.service.FreeTierIdentityHasher;
import com.reverie.service.FreeTierService;
import com.reverie.service.UsageLimitService;
import com.reverie.service.UserService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The account is deleted; the allowance is not.
 *
 * <h2>What can only be proved here</h2>
 *
 * <p>{@code FreeTierServiceTest} asserts which entitlement an account is
 * attached to, with mocks, and that is the decision. It cannot assert the two
 * things this class exists for, because neither is in Java:
 *
 * <ul>
 *   <li><b>The cascade.</b> The bug was {@code usage_limits.user_id ...
 *       ON DELETE CASCADE}: deleting the account took the counters with it. The
 *       claim that the new table survives {@code DELETE FROM users} is a claim
 *       about Postgres, and a mock has no foreign keys.</li>
 *   <li><b>The races.</b> Two imports confirmed together against a balance of
 *       one must end with one refused. A mock cannot refuse the second
 *       {@code UPDATE}; the {@code WHERE} clause can.</li>
 *   <li><b>The policies.</b> Whether a request connection can charge its own
 *       allowance, and whether it can delete its own row out of the identity
 *       ledger. See {@link #thePoliciesHold}, which is the one method here that
 *       does not connect as the owner — because the owner in this container is
 *       a superuser, and a superuser is exempt from row-level security.</li>
 * </ul>
 *
 * <p><strong>Needs a PostgreSQL, and skips without one.</strong> Same switch as
 * the other integration tests in this package.
 */
@SpringBootTest(
        classes = ReverieApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE)
@EnabledIfEnvironmentVariable(named = "REVERIE_IT_DB_URL", matches = ".+",
        disabledReason = "needs a PostgreSQL: the claims are about cascades and UPDATE ... WHERE")
class FreeTierLifecycleTest {

    @DynamicPropertySource
    static void realDatabaseAndNoBroker(DynamicPropertyRegistry registry) {
        String url = System.getenv("REVERIE_IT_DB_URL");
        String owner = env("REVERIE_IT_DB_OWNER_USER", "REVERIE_IT_DB_USER");
        String password = env("REVERIE_IT_DB_OWNER_PASSWORD", "REVERIE_IT_DB_PASSWORD");

        /*
         * And the Backend API key, which clerk mode also refuses to start
         * without -- see ClerkIdentityCheck. The url points at a dead local
         * port: every identity here is resolved from the email claim passed to
         * `provision`, so a call that does go out is a bug and should fail
         * immediately rather than reach the internet.
         */
        registry.add("reverie.clerk.secret-key", () -> "sk_test_integration_only");
        registry.add("reverie.clerk.api-url", () -> "http://127.0.0.1:1/v1");

        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> owner);
        registry.add("spring.datasource.password", () -> password);
        registry.add("spring.flyway.url", () -> url);
        registry.add("spring.flyway.user", () -> owner);
        registry.add("spring.flyway.password", () -> password);
        registry.add("reverie.datasource.system.username", () -> owner);
        registry.add("reverie.datasource.system.password", () -> password);

        // A fixed key, so a hash computed in one test method matches one
        // computed in another. This is the whole operational requirement in
        // miniature: change it between runs and every identity looks new.
        registry.add("reverie.free-tier.identity-secret", () -> "integration-test-secret");

        registry.add("spring.kafka.bootstrap-servers", () -> "localhost:1");
        registry.add("spring.kafka.security.protocol", () -> "PLAINTEXT");
        registry.add("spring.kafka.properties.default.api.timeout.ms", () -> "1000");
        registry.add("spring.kafka.properties.request.timeout.ms", () -> "1000");
        registry.add("spring.kafka.admin.fail-fast", () -> "false");
        registry.add("spring.kafka.admin.auto-create", () -> "false");
        registry.add("reverie.outbox.poll-ms", () -> "3600000");
    }

    private static String env(String preferred, String fallback) {
        String value = System.getenv(preferred);
        if (value == null || value.isBlank()) {
            value = System.getenv(fallback);
        }
        return value == null ? "" : value;
    }

    @Autowired private UserService userService;
    @Autowired private UsageLimitService usageService;
    @Autowired private FreeTierService freeTier;
    @Autowired private FreeTierIdentityHasher hasher;
    @Autowired private FreeTierEntitlementRepository entitlements;
    @Autowired private FreeTierIdentityRepository identities;
    @Autowired private TransactionTemplate transactions;

    private final String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    private final String email = "lifetime_" + suffix + "@example.com";
    private final List<String> subjects = new ArrayList<>();

    /**
     * Clean up the accounts, and the allowance too.
     *
     * <p>The entitlement has to be deleted explicitly, by hand, which is the
     * point of the whole change stated as a chore: {@code DELETE FROM users}
     * does not reach it.
     */
    @AfterEach
    void removeWhatWasCreated() throws Exception {
        try (Connection c = connect()) {
            for (String subject : subjects) {
                try (PreparedStatement ps = c.prepareStatement(
                        "DELETE FROM users WHERE clerk_user_id = ?")) {
                    ps.setString(1, subject);
                    ps.executeUpdate();
                }
            }
            String hash = hasher.hash(email).orElseThrow();
            String entitlementId = null;
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT entitlement_id FROM free_tier_identities WHERE identity_hash = ?")) {
                ps.setString(1, hash);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        entitlementId = rs.getString(1);
                    }
                }
            }
            try (PreparedStatement ps = c.prepareStatement(
                    "DELETE FROM free_tier_identities WHERE identity_hash = ?")) {
                ps.setString(1, hash);
                ps.executeUpdate();
            }
            if (entitlementId != null) {
                try (PreparedStatement ps = c.prepareStatement(
                        "DELETE FROM free_tier_entitlements WHERE id = ?")) {
                    ps.setString(1, entitlementId);
                    ps.executeUpdate();
                }
            }
        }
    }

    private Connection connect() throws Exception {
        return DriverManager.getConnection(
                System.getenv("REVERIE_IT_DB_URL"),
                env("REVERIE_IT_DB_OWNER_USER", "REVERIE_IT_DB_USER"),
                env("REVERIE_IT_DB_OWNER_PASSWORD", "REVERIE_IT_DB_PASSWORD"));
    }

    /** Sign in as a fresh Clerk subject with the same verified address. */
    private String signIn() throws Exception {
        String subject = "user_it_" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        subjects.add(subject);
        return TenantContext.asSystem(() -> userService.provision(subject, email));
    }

    /** Close the account the way the product does: the users row goes. */
    private void closeAccount(String userId) throws Exception {
        try (Connection c = connect();
             PreparedStatement ps = c.prepareStatement("DELETE FROM users WHERE id = ?")) {
            ps.setString(1, userId);
            ps.executeUpdate();
        }
    }

    private int minutesUsed(String userId) throws Exception {
        return TenantContext.asSystem(() -> usageService.getUsage(userId).minutesUsed());
    }

    private int importsUsed(String userId) throws Exception {
        return TenantContext.asSystem(() -> usageService.getUsage(userId).importsUsed());
    }

    @Test
    @DisplayName("deleting the account leaves the allowance, and signing up again finds it")
    void theAllowanceOutlivesTheAccount() throws Exception {
        /*
         * THE BUG, END TO END.
         *
         * Scenarios A through E of the report, in one method, because they are
         * one story and splitting it would mean creating and deleting the same
         * account five times.
         */
        String first = signIn();
        assertThat(minutesUsed(first)).isZero();
        assertThat(importsUsed(first)).isZero();

        // Spend 40 minutes and one import: 60 and 2 remaining.
        TenantContext.asSystem(() -> {
            usageService.chargeMeetingOrThrow(first, false, 600);
            usageService.addAiMinutes(first, 40);
            return null;
        });
        assertThat(minutesUsed(first)).isEqualTo(40);
        assertThat(importsUsed(first)).isEqualTo(1);

        closeAccount(first);

        // The account is gone.
        try (Connection c = connect();
             PreparedStatement ps = c.prepareStatement("SELECT 1 FROM users WHERE id = ?")) {
            ps.setString(1, first);
            try (ResultSet rs = ps.executeQuery()) {
                assertThat(rs.next()).isFalse();
            }
        }

        // The allowance is not. New Clerk subject, same verified address.
        String second = signIn();
        assertThat(second).isNotEqualTo(first);
        assertThat(minutesUsed(second)).isEqualTo(40);
        assertThat(importsUsed(second)).isEqualTo(1);

        // And the new account is otherwise clean: nothing about the old one
        // came back with the counters.
        try (Connection c = connect();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT count(*) FROM meetings WHERE user_id = ?")) {
            ps.setString(1, second);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                assertThat(rs.getInt(1)).isZero();
            }
        }
    }

    @Test
    @DisplayName("an exhausted identity gets no second account at all")
    void exhaustedGetsNoSecondAccount() throws Exception {
        /*
         * THIS TEST USED TO PROVE THE SAME THING A WEAKER WAY.
         *
         * <p>It signed up again with the spent address and read the counters
         * back, asserting they were still 100 and 3 -- which was true, and was
         * the whole anti-reset guarantee. What it also described was a poor
         * experience: the account was created, its balance came back at zero
         * remaining, and every attempt to record or import was refused one at a
         * time with no explanation of why a brand-new account had nothing.
         *
         * <p>Provisioning now refuses the sign-up itself, so re-provisioning is
         * no longer available as a way to read the counters. The claim is
         * therefore stated directly, and it is the stronger of the two: not
         * "the allowance does not come back" but "there is no account for it to
         * come back to". See `FreeTierService.refuseIfExhaustedIdentity`.
         */
        String first = signIn();
        /*
         * Imports first, minutes second, and not by preference: a meeting is
         * refused when the minute balance is gone, whichever way it arrived, so
         * spending all 100 minutes up front makes the three imports impossible
         * to spend at all. Exhausting both means exhausting them in this order.
         */
        TenantContext.asSystem(() -> {
            for (int i = 0; i < UsageLimitService.IMPORT_ALLOWANCE; i++) {
                usageService.chargeMeetingOrThrow(first, false, 60);
            }
            usageService.addAiMinutes(first, UsageLimitService.MINUTES_ALLOWANCE);
            return null;
        });
        String entitlement = TenantContext.asSystem(() -> freeTier.forAccount(first));

        closeAccount(first);

        // A new Clerk subject with the same verified address, which is what
        // deleting an account and signing up again looks like from here.
        String refusedSubject = "user_it_"
                + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        subjects.add(refusedSubject);
        assertThatThrownBy(() ->
                TenantContext.asSystem(() -> userService.provision(refusedSubject, email)))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("already used all 100 free transcription minutes");

        // And nothing was left behind by the attempt: no users row for that
        // subject, and the entitlement's counters are exactly as they were.
        try (Connection c = connect();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT count(*) FROM users WHERE clerk_user_id = ?")) {
            ps.setString(1, refusedSubject);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                assertThat(rs.getInt(1)).as("a refused subject leaves no row").isZero();
            }
        }
        FreeTierEntitlement after = entitlements.findById(entitlement).orElseThrow();
        assertThat(after.getRecordingMinutesUsed())
                .isGreaterThanOrEqualTo(UsageLimitService.MINUTES_ALLOWANCE);
        assertThat(after.getImportsUsed()).isEqualTo(UsageLimitService.IMPORT_ALLOWANCE);
    }

    @Test
    @DisplayName("but an identity with minutes left is welcomed back on the remainder")
    void partlySpentIsStillAllowedBack() throws Exception {
        /*
         * The other half of the rule, and the half that keeps it from being a
         * punishment: somebody who tried Reverie for a few minutes, deleted the
         * account and came back gets an account and the rest of the allowance.
         * Asserted here rather than only in the unit tests because "the sign-up
         * is allowed" and "the counters come with it" are two claims and this
         * is where the second one is real.
         */
        String first = signIn();
        TenantContext.asSystem(() -> {
            usageService.addAiMinutes(first, 10);
            return null;
        });

        closeAccount(first);
        String second = signIn();

        assertThat(second).isNotEqualTo(first);
        assertThat(minutesUsed(second)).isEqualTo(10);
    }

    @Test
    @DisplayName("a different verified identity gets its own allowance")
    void anotherIdentityIsUnaffected() throws Exception {
        String mine = signIn();
        TenantContext.asSystem(() -> {
            usageService.addAiMinutes(mine, 30);
            return null;
        });

        String otherSubject = "user_it_" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        subjects.add(otherSubject);
        String other = TenantContext.asSystem(
                () -> userService.provision(otherSubject, "other_" + suffix + "@example.com"));
        try {
            assertThat(minutesUsed(other)).isZero();
            assertThat(importsUsed(other)).isZero();
        } finally {
            cleanUpIdentity("other_" + suffix + "@example.com");
        }
    }

    @Test
    @DisplayName("two simultaneous imports cannot both spend the last one")
    void theLastImportIsClaimedOnce() throws Exception {
        /*
         * SCENARIO from §17, run for real. Eight threads released together
         * against a balance of one. The refusals are what proves the WHERE
         * clause is doing the deciding: a read-then-write would let every one
         * of them through and leave `imports_used` at 3 instead of 3 with
         * seven refusals.
         */
        String user = signIn();
        String entitlement = TenantContext.asSystem(() -> freeTier.forAccount(user));
        // Two of three spent, so exactly one is left.
        TenantContext.asSystem(() -> {
            usageService.chargeMeetingOrThrow(user, false, 60);
            usageService.chargeMeetingOrThrow(user, false, 60);
            return null;
        });

        int threads = 8;
        CyclicBarrier gate = new CyclicBarrier(threads);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        List<Callable<Boolean>> attempts = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            attempts.add(() -> {
                gate.await(10, TimeUnit.SECONDS);
                try {
                    TenantContext.asSystem(() -> {
                        usageService.chargeMeetingOrThrow(user, false, 60);
                        return null;
                    });
                    return true;
                } catch (RuntimeException refused) {
                    return false;
                }
            });
        }

        int accepted = 0;
        try {
            for (Future<Boolean> f : pool.invokeAll(attempts)) {
                if (f.get()) {
                    accepted++;
                }
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(accepted).isEqualTo(1);
        assertThat(entitlements.findById(entitlement).orElseThrow().getImportsUsed())
                .isEqualTo(UsageLimitService.IMPORT_ALLOWANCE);
    }

    @Test
    @DisplayName("simultaneous minute charges all land, so none is lost")
    void concurrentMinutesAreNotLost() throws Exception {
        /*
         * The mirror image of the import race, and the one that costs the
         * *product* rather than the user: eight completion callbacks read the
         * same total, added their own minutes, and seven of the eight writes
         * were overwritten — so a user running meetings in parallel was charged
         * for one of them. `addMinutes` is one statement, so every charge
         * lands.
         */
        String user = signIn();
        String entitlement = TenantContext.asSystem(() -> freeTier.forAccount(user));

        int threads = 8;
        CyclicBarrier gate = new CyclicBarrier(threads);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        List<Callable<Void>> charges = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            int attempt = i + 1;
            charges.add(() -> {
                gate.await(10, TimeUnit.SECONDS);
                TenantContext.asSystem(() -> {
                    usageService.addAiMinutes(user, 5);
                    return null;
                });
                return null;
            });
        }
        try {
            for (Future<Void> f : pool.invokeAll(charges)) {
                f.get();
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(entitlements.findById(entitlement).orElseThrow().getRecordingMinutesUsed())
                .isEqualTo(threads * 5);
    }

    @Test
    @DisplayName("concurrent first sign-ins of one identity produce one allowance")
    void firstProvisioningIsAtomic() throws Exception {
        /*
         * A browser opening the app fires several requests at once, all
         * provisioning the same brand-new identity. Two entitlements here would
         * be two allowances, and the loser's link would decide which one the
         * account spends against.
         */
        int threads = 8;
        CyclicBarrier gate = new CyclicBarrier(threads);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        String subject = "user_it_" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        subjects.add(subject);

        List<Callable<String>> logins = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            logins.add(() -> {
                gate.await(10, TimeUnit.SECONDS);
                return TenantContext.asSystem(() -> userService.provision(subject, email));
            });
        }
        try {
            for (Future<String> f : pool.invokeAll(logins)) {
                f.get();
            }
        } finally {
            pool.shutdownNow();
        }

        String hash = hasher.hash(email).orElseThrow();
        try (Connection c = connect();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT count(*) FROM free_tier_identities WHERE identity_hash = ?")) {
            ps.setString(1, hash);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                assertThat(rs.getInt(1)).isEqualTo(1);
            }
        }
    }

    @Test
    @DisplayName("a changed verified email is another name for the same allowance")
    void anEmailChangeDoesNotMintAnother() throws Exception {
        String user = signIn();
        TenantContext.asSystem(() -> {
            usageService.addAiMinutes(user, 25);
            return null;
        });
        String changed = "changed_" + suffix + "@example.com";

        // Sign in again with the same Clerk subject and a new primary address,
        // which is what a provider-side email change looks like from here.
        String same = TenantContext.asSystem(
                () -> userService.provision(subjects.get(subjects.size() - 1), changed));

        try {
            assertThat(same).isEqualTo(user);
            assertThat(minutesUsed(user)).isEqualTo(25);

            // Both addresses now name the same allowance.
            String before = hasher.hash(email).orElseThrow();
            String after = hasher.hash(changed).orElseThrow();
            try (Connection c = connect();
                 PreparedStatement ps = c.prepareStatement(
                         "SELECT count(DISTINCT entitlement_id) FROM free_tier_identities "
                                 + "WHERE identity_hash IN (?, ?)")) {
                ps.setString(1, before);
                ps.setString(2, after);
                try (ResultSet rs = ps.executeQuery()) {
                    rs.next();
                    assertThat(rs.getInt(1)).isEqualTo(1);
                }
            }
        } finally {
            cleanUpIdentity(changed);
        }
    }

    @Test
    @DisplayName("an address changed just before deletion is aliased, and survives it")
    void theAddressChangeRaceIsClosed() throws Exception {
        /*
         * THE CACHE RACE, AGAINST A REAL DATABASE.
         *
         * <p>`ClerkDirectory` caches the verified address for half an hour, so
         * an address that changes at Clerk is not seen by an ordinary
         * provisioning read for up to that long. Deletion is the one operation
         * where being behind cannot be corrected afterwards: it removes the
         * account's link, which is the only thing holding the allowance to a
         * person until an alias says so.
         *
         * <p>So the deletion path asks Clerk again, uncached, and writes the
         * alias first. Here that is driven directly — the unit test drives the
         * staleness itself; what this adds is that the alias row really lands,
         * really outlives `DELETE FROM users`, and is really found by the next
         * sign-up.
         */
        String first = signIn();
        TenantContext.asSystem(() -> {
            usageService.chargeMeetingOrThrow(first, false, 600);
            usageService.addAiMinutes(first, 40);
            return null;
        });
        String entitlement = TenantContext.asSystem(() -> freeTier.forAccount(first));
        String changed = "moved_" + suffix + "@example.com";

        try {
            // What the deletion path does, in the order it does it: bind the
            // current address, then erase. Driven with the changed address
            // because there is no Clerk instance to change it at.
            bindAlias(entitlement, changed);
            closeAccount(first);

            // The mapping outlived the account, and so did the counters.
            String hash = hasher.hash(changed).orElseThrow();
            try (Connection c = connect();
                 PreparedStatement ps = c.prepareStatement(
                         "SELECT entitlement_id FROM free_tier_identities WHERE identity_hash = ?")) {
                ps.setString(1, hash);
                try (ResultSet rs = ps.executeQuery()) {
                    assertThat(rs.next()).isTrue();
                    assertThat(rs.getString(1)).isEqualTo(entitlement);
                }
            }

            // Signing up again as the new address, under a new Clerk subject.
            String secondSubject = "user_it_"
                    + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
            subjects.add(secondSubject);
            String second = TenantContext.asSystem(
                    () -> userService.provision(secondSubject, changed));

            assertThat(TenantContext.asSystem(() -> freeTier.forAccount(second)))
                    .isEqualTo(entitlement);
            assertThat(minutesUsed(second)).isEqualTo(40);
            assertThat(importsUsed(second)).isEqualTo(1);
        } finally {
            cleanUpIdentity(changed);
        }
    }

    @Test
    @DisplayName("row-level security: own allowance readable, the ledger untouchable")
    void thePoliciesHold() throws Exception {
        /*
         * WHY THIS TEST EXISTS SEPARATELY FROM THE OTHERS.
         *
         * <p>Every other method here connects as the database owner, which in
         * this container is a superuser -- and a superuser is exempt from
         * row-level security, FORCE included. So none of them touches a policy,
         * and a V69 that got its policies wrong would pass all of them and then
         * fail in production, in one of two opposite ways:
         *
         * <ul>
         *   <li>too strict, and `claimImport` updates nothing from a request
         *       connection -- the free tier would simply stop being charged;</li>
         *   <li>too loose, and a tenant can DELETE its own row out of
         *       `free_tier_identities` before deleting its account, which is
         *       precisely the reset this whole change exists to stop.</li>
         * </ul>
         *
         * <p>So this one creates an unprivileged role, connects as it, and asks
         * Postgres directly. It is the only place either claim is proved.
         */
        String mine = signIn();
        String entitlement = TenantContext.asSystem(() -> freeTier.forAccount(mine));

        String otherAddress = "neighbour_" + suffix + "@example.com";
        String otherSubject = "user_it_"
                + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        subjects.add(otherSubject);
        String other = TenantContext.asSystem(
                () -> userService.provision(otherSubject, otherAddress));
        String otherEntitlement = TenantContext.asSystem(() -> freeTier.forAccount(other));
        assertThat(otherEntitlement).isNotEqualTo(entitlement);

        String role = "it_tenant_" + suffix;
        try {
            try (Connection owner = connect(); Statement st = owner.createStatement()) {
                st.execute("CREATE ROLE " + role
                        + " LOGIN PASSWORD 'itpass' NOSUPERUSER NOBYPASSRLS");
                st.execute("GRANT USAGE ON SCHEMA public TO " + role);
                st.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "
                        + role);
            }

            try (Connection tenant = DriverManager.getConnection(
                    System.getenv("REVERIE_IT_DB_URL"), role, "itpass")) {
                // Exactly what TenantAwareDataSource does on every checkout.
                try (PreparedStatement ps = tenant.prepareStatement(
                        "SELECT set_config('app.user_id', ?, false)")) {
                    ps.setString(1, mine);
                    ps.executeQuery().close();
                }

                // Its own allowance is readable: the Usage panel is this query.
                assertThat(visibleEntitlements(tenant, entitlement))
                        .as("own entitlement is readable by the account linked to it")
                        .isEqualTo(1);

                // The neighbour's is not, though it is one row away in the same
                // table and the id is right here in this test.
                assertThat(visibleEntitlements(tenant, otherEntitlement))
                        .as("another account's entitlement is invisible")
                        .isZero();

                // Writable too, because claiming an import is an UPDATE issued
                // by the request that confirms the meeting.
                try (PreparedStatement ps = tenant.prepareStatement(
                        "UPDATE free_tier_entitlements SET imports_used = imports_used "
                                + "WHERE id = ?")) {
                    ps.setString(1, entitlement);
                    assertThat(ps.executeUpdate())
                            .as("the account can charge its own allowance")
                            .isEqualTo(1);
                }

                // And the neighbour's counters cannot be moved, in either
                // direction: no rows match, so nothing is charged or refunded.
                try (PreparedStatement ps = tenant.prepareStatement(
                        "UPDATE free_tier_entitlements SET imports_used = 0 WHERE id = ?")) {
                    ps.setString(1, otherEntitlement);
                    assertThat(ps.executeUpdate())
                            .as("another account's allowance cannot be written")
                            .isZero();
                }

                // THE LEDGER. No policy at all, so a tenant connection sees
                // none of it -- not the neighbour's mapping, and not its own.
                try (Statement st = tenant.createStatement();
                     ResultSet rs = st.executeQuery("SELECT count(*) FROM free_tier_identities")) {
                    rs.next();
                    assertThat(rs.getInt(1))
                            .as("the identity ledger is invisible to tenant connections")
                            .isZero();
                }

                // THE ONE THAT MATTERS. Deleting your own mapping and then your
                // own account would be the reset, done through SQL instead of
                // the sign-up form. It matches nothing, so it deletes nothing.
                try (Statement st = tenant.createStatement()) {
                    assertThat(st.executeUpdate("DELETE FROM free_tier_identities"))
                            .as("no tenant can delete its own identity mapping")
                            .isZero();
                }

                // Nor can one be forged onto somebody else's allowance.
                try (PreparedStatement ps = tenant.prepareStatement(
                        "INSERT INTO free_tier_identities (identity_hash, hash_version, "
                                + "entitlement_id) VALUES (?, 1, ?)")) {
                    ps.setString(1, "forged_" + suffix);
                    ps.setString(2, otherEntitlement);
                    assertThatThrownBy(ps::executeUpdate)
                            .as("no tenant can write into the identity ledger")
                            .hasMessageContaining("row-level security");
                }
            }

            // Still there afterwards, which is the point of the DELETE above.
            try (Connection owner = connect();
                 PreparedStatement ps = owner.prepareStatement(
                         "SELECT count(*) FROM free_tier_identities WHERE entitlement_id = ?")) {
                ps.setString(1, entitlement);
                try (ResultSet rs = ps.executeQuery()) {
                    rs.next();
                    assertThat(rs.getInt(1)).isEqualTo(1);
                }
            }

            // And the other direction of the foreign key: an allowance cannot be
            // deleted out from under a live account. ON DELETE RESTRICT, tested
            // rather than trusted, because it is what stops the reset being one
            // DELETE away for anything holding the system connection.
            try (Connection owner = connect();
                 PreparedStatement ps = owner.prepareStatement(
                         "DELETE FROM free_tier_entitlements WHERE id = ?")) {
                ps.setString(1, entitlement);
                assertThatThrownBy(ps::executeUpdate)
                        .as("a referenced entitlement cannot be deleted")
                        .hasMessageContaining("violates foreign key constraint");
            }
        } finally {
            try (Connection owner = connect(); Statement st = owner.createStatement()) {
                st.execute("DROP OWNED BY " + role);
                st.execute("DROP ROLE IF EXISTS " + role);
            }
            closeAccount(other);
            cleanUpIdentity(otherAddress);
        }
    }

    /** How many rows with this id the given connection can see. */
    private static int visibleEntitlements(Connection c, String id) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT count(*) FROM free_tier_entitlements WHERE id = ?")) {
            ps.setString(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getInt(1);
            }
        }
    }

    /**
     * Write one alias onto an existing entitlement, as the deletion path does.
     *
     * <p>Through a transaction template rather than a bare repository call: a
     * modifying query needs a transaction, and the production path gets one
     * from {@code @Transactional(REQUIRES_NEW)}. Wrapped in system context for
     * the same reason that annotation exists — the identity ledger has no
     * row-level security policy, and the route is chosen when the transaction
     * checks out its connection.
     */
    private void bindAlias(String entitlementId, String address) {
        String hash = hasher.hash(address).orElseThrow();
        TenantContext.runAsSystem(() -> transactions.executeWithoutResult(status ->
                identities.insertIfAbsent(hash, FreeTierIdentityHasher.HASH_VERSION,
                        entitlementId)));
    }

    /** Remove one identity mapping made by a test, leaving the entitlement. */
    private void cleanUpIdentity(String address) throws Exception {
        String hash = hasher.hash(address).orElseThrow();
        try (Connection c = connect();
             PreparedStatement ps = c.prepareStatement(
                     "DELETE FROM free_tier_identities WHERE identity_hash = ?")) {
            ps.setString(1, hash);
            ps.executeUpdate();
        }
    }
}
