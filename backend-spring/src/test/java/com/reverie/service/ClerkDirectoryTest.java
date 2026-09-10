package com.reverie.service;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Reading a Clerk user record, defensively.
 *
 * <p>This is third-party JSON on its way to becoming the key of a lifetime
 * entitlement, so every shape that is not exactly what was expected has to end
 * at "no identity" rather than at a guess. A wrong guess here is either a
 * stranger inheriting somebody's remaining minutes or an allowance nothing can
 * recognise tomorrow.
 *
 * <p>The parsing is asserted directly rather than through a stub server: what
 * is worth pinning down is which field decides, and that needs no socket. The
 * transport — timeouts, 404, 5xx, a body that will not deserialise — is
 * asserted through {@link FreeTierServiceTest}, which drives the whole
 * resolution with a stubbed directory.
 *
 * <p>{@link Caching} is the exception, and only because the claim there cannot
 * be made without one: "a forced refresh replaces what was cached" is a
 * statement about the <em>second</em> answer to the same question, so
 * something has to be able to give two. A JDK {@code HttpServer} on a loopback
 * port is the smallest thing that can.
 */
class ClerkDirectoryTest {

    private static Map<String, Object> address(String id, String email, String status) {
        return Map.of(
                "id", id,
                "email_address", email,
                "verification", status == null ? Map.of() : Map.of("status", status));
    }

    @Nested
    @DisplayName("the primary verified address")
    class Primary {

        @Test
        @DisplayName("is the one the record names as primary, not the first in the list")
        void picksThePrimary() {
            /*
             * Taking the first address would let anybody with two addresses
             * choose which identity their allowance is keyed to — add an
             * address, delete the account, sign up again as the other one.
             */
            String found = ClerkDirectory.primaryVerifiedAddress(Map.of(
                    "primary_email_address_id", "idn_2",
                    "email_addresses", List.of(
                            address("idn_1", "other@example.com", "verified"),
                            address("idn_2", "primary@example.com", "verified"))));

            assertThat(found).isEqualTo("primary@example.com");
        }

        @Test
        @DisplayName("must be verified according to Clerk, or there is no identity")
        void refusesAnUnverifiedPrimary() {
            /*
             * An unverified primary is a real Clerk state, and keying a
             * lifetime allowance to an address nobody has proved they own would
             * make the allowance transferable by typing.
             */
            assertThat(ClerkDirectory.primaryVerifiedAddress(Map.of(
                    "primary_email_address_id", "idn_1",
                    "email_addresses", List.of(address("idn_1", "unproven@example.com", "unverified")))))
                    .isNull();

            // And a verified *other* address does not stand in for it.
            assertThat(ClerkDirectory.primaryVerifiedAddress(Map.of(
                    "primary_email_address_id", "idn_1",
                    "email_addresses", List.of(
                            address("idn_1", "unproven@example.com", "unverified"),
                            address("idn_2", "proven@example.com", "verified")))))
                    .isNull();
        }

        @Test
        @DisplayName("survives every malformed shape by refusing")
        void refusesMalformedRecords() {
            // Each of these is a thing a third-party API can return that is not
            // an address: none of them may become one.
            assertThat(ClerkDirectory.primaryVerifiedAddress(null)).isNull();
            assertThat(ClerkDirectory.primaryVerifiedAddress(Map.of())).isNull();
            assertThat(ClerkDirectory.primaryVerifiedAddress(Map.of(
                    "primary_email_address_id", "", "email_addresses", List.of()))).isNull();
            // Primary id names nothing in the list.
            assertThat(ClerkDirectory.primaryVerifiedAddress(Map.of(
                    "primary_email_address_id", "idn_9",
                    "email_addresses", List.of(address("idn_1", "a@example.com", "verified")))))
                    .isNull();
            // The list is not a list.
            assertThat(ClerkDirectory.primaryVerifiedAddress(Map.of(
                    "primary_email_address_id", "idn_1",
                    "email_addresses", "not-a-list"))).isNull();
            // The entries are not objects.
            assertThat(ClerkDirectory.primaryVerifiedAddress(Map.of(
                    "primary_email_address_id", "idn_1",
                    "email_addresses", List.of("idn_1")))).isNull();
            // No verification block at all.
            assertThat(ClerkDirectory.primaryVerifiedAddress(Map.of(
                    "primary_email_address_id", "idn_1",
                    "email_addresses", List.of(Map.of("id", "idn_1", "email_address", "a@e.com")))))
                    .isNull();
            // An empty address string.
            assertThat(ClerkDirectory.primaryVerifiedAddress(Map.of(
                    "primary_email_address_id", "idn_1",
                    "email_addresses", List.of(address("idn_1", "", "verified"))))).isNull();
        }
    }

    @Nested
    @DisplayName("without a secret key")
    class Disabled {

        @Test
        @DisplayName("says so rather than pretending the user has no address")
        void reportsDisabled() {
            /*
             * The distinction matters to an operator and not to the caller:
             * both mean no entitlement, and only one of them is somebody
             * forgetting to set a variable.
             */
            ClerkDirectory directory = new ClerkDirectory("", "https://api.clerk.test/v1");

            assertThat(directory.enabled()).isFalse();
            ClerkDirectory.Lookup lookup = directory.verifiedPrimaryEmail("user_1");
            assertThat(lookup.resolved()).isFalse();
            assertThat(lookup.status()).isEqualTo(ClerkDirectory.Status.DISABLED);
            assertThat(lookup.email()).isNull();
        }

        @Test
        @DisplayName("asks nothing about a blank subject")
        void refusesABlankSubject() {
            ClerkDirectory directory = new ClerkDirectory("sk_test_x", "https://api.clerk.test/v1");

            assertThat(directory.verifiedPrimaryEmail(null).status())
                    .isEqualTo(ClerkDirectory.Status.NOT_FOUND);
            assertThat(directory.verifiedPrimaryEmail("  ").status())
                    .isEqualTo(ClerkDirectory.Status.NOT_FOUND);
        }
    }

    @Nested
    @DisplayName("the forced refresh")
    class ForcedRefresh {

        @Test
        @DisplayName("evicts whatever was cached, even when it cannot replace it")
        void evictsOnFailure() {
            /*
             * The deletion path asks this question precisely because a cached
             * answer may be stale, so a failed refresh must not leave the stale
             * value behind for the next reader to trust. There is no server
             * here, so the fetch fails -- which is the case that matters: the
             * entry has to be gone either way.
             */
            ClerkDirectory directory =
                    new ClerkDirectory("sk_test_x", "https://clerk.invalid/v1");

            ClerkDirectory.Lookup first = directory.refreshVerifiedPrimaryEmail("user_1");
            ClerkDirectory.Lookup second = directory.refreshVerifiedPrimaryEmail("user_1");

            // Not cached as "unavailable" either: both calls really went out.
            assertThat(first.status()).isEqualTo(ClerkDirectory.Status.UNAVAILABLE);
            assertThat(second.status()).isEqualTo(ClerkDirectory.Status.UNAVAILABLE);
        }

        @Test
        @DisplayName("asks nothing it cannot ask")
        void refusesWithoutAKeyOrASubject() {
            // Same guards as the cached read, and the same statuses, so the
            // caller has one thing to check rather than two.
            ClerkDirectory none = new ClerkDirectory("", "https://api.clerk.test/v1");
            assertThat(none.refreshVerifiedPrimaryEmail("user_1").status())
                    .isEqualTo(ClerkDirectory.Status.DISABLED);

            ClerkDirectory keyed = new ClerkDirectory("sk_test_x", "https://api.clerk.test/v1");
            assertThat(keyed.refreshVerifiedPrimaryEmail(null).status())
                    .isEqualTo(ClerkDirectory.Status.NOT_FOUND);
            assertThat(keyed.refreshVerifiedPrimaryEmail("   ").status())
                    .isEqualTo(ClerkDirectory.Status.NOT_FOUND);
        }
    }

    @Nested
    @DisplayName("the thirty-minute cache")
    class Caching {

        /*
         * WHY THERE IS A SERVER IN HERE.
         *
         * <p>The cache is what made deletion unsafe: a normal lookup can be
         * half an hour behind, and deletion removes the account's link to its
         * allowance, so being behind at that moment hands out another 100
         * minutes to whoever signs up with the new address. The fix is a forced
         * refresh, and its correctness is entirely about the value left behind
         * afterwards -- a refresh that returned the right answer and cached the
         * wrong one would pass every other test in this file.
         *
         * <p>So: one subject, two different answers from Clerk, and a request
         * counter to say which reads really went out.
         */
        private HttpServer server;
        private final AtomicReference<String> address = new AtomicReference<>("a@example.com");
        private final AtomicInteger requests = new AtomicInteger();

        private ClerkDirectory directory;

        @BeforeEach
        void startClerk() throws IOException {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/v1/users/", exchange -> {
                requests.incrementAndGet();
                byte[] body = ("{\"primary_email_address_id\":\"idn_1\","
                        + "\"email_addresses\":[{\"id\":\"idn_1\",\"email_address\":\""
                        + address.get()
                        + "\",\"verification\":{\"status\":\"verified\"}}]}")
                        .getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
                exchange.close();
            });
            server.start();
            directory = new ClerkDirectory(
                    "sk_test_x", "http://127.0.0.1:" + server.getAddress().getPort() + "/v1");
        }

        @AfterEach
        void stopClerk() {
            server.stop(0);
        }

        @Test
        @DisplayName("answers a repeat question without asking Clerk again")
        void cachesTheAnswer() {
            // The reason the cache exists: this runs on every authenticated
            // request, and Clerk rate-limits.
            assertThat(directory.verifiedPrimaryEmail("user_1").email()).isEqualTo("a@example.com");
            assertThat(directory.verifiedPrimaryEmail("user_1").email()).isEqualTo("a@example.com");

            assertThat(requests.get()).isEqualTo(1);
        }

        @Test
        @DisplayName("and goes on answering it after the address has changed")
        void staysStaleUntilAsked() {
            /*
             * THE RACE, STATED AS A PROPERTY OF THIS CLASS.
             *
             * <p>Not a defect to be fixed here -- being a little behind costs
             * nothing on an ordinary request, and the alias is written on the
             * next miss. It is a defect at exactly one moment, which is why the
             * deletion path does not use this method.
             */
            directory.verifiedPrimaryEmail("user_1");
            address.set("b@example.com");

            assertThat(directory.verifiedPrimaryEmail("user_1").email())
                    .as("a cached read is still answering with the old address")
                    .isEqualTo("a@example.com");
            assertThat(requests.get()).isEqualTo(1);
        }

        @Test
        @DisplayName("a forced refresh replaces what was cached, not just what it returns")
        void refreshReplacesTheCachedValue() {
            /*
             * THE POINT OF THE WHOLE MECHANISM.
             *
             * <p>A refresh that returned B and left A cached would pass a test
             * that only looked at the return value, and would then hand the
             * stale answer to the very next reader -- including, in a retried
             * deletion, this one.
             */
            directory.verifiedPrimaryEmail("user_1");
            address.set("b@example.com");

            assertThat(directory.refreshVerifiedPrimaryEmail("user_1").email())
                    .isEqualTo("b@example.com");
            assertThat(requests.get()).as("the refresh really went out").isEqualTo(2);

            assertThat(directory.verifiedPrimaryEmail("user_1").email())
                    .as("and the cache now holds the new address")
                    .isEqualTo("b@example.com");
            assertThat(requests.get()).as("served from the replaced entry").isEqualTo(2);
        }

        @Test
        @DisplayName("forgetting a subject makes the next read ask again")
        void forgettingDropsTheEntry() {
            /*
             * The hook a `user.updated` webhook would use, and the reason it is
             * public. There is no such webhook in this application today -- see
             * `FreeTierService` -- and the forced refresh above is deliberately
             * the correctness mechanism rather than an event, because a
             * delivery that is delayed or retried cannot be the thing standing
             * between a deletion and a second allowance.
             */
            directory.verifiedPrimaryEmail("user_1");
            address.set("b@example.com");

            directory.forget("user_1");
            // Twice, because a webhook delivered twice is the normal case and
            // the second one must not be an error or a second fetch.
            directory.forget("user_1");
            assertThat(requests.get()).isEqualTo(1);

            assertThat(directory.verifiedPrimaryEmail("user_1").email())
                    .isEqualTo("b@example.com");
            assertThat(requests.get()).isEqualTo(2);
        }

        @Test
        @DisplayName("one subject's entry is not another's")
        void cachesPerSubject() {
            // Cheap to get wrong with a single-slot cache, and expensive: it
            // would key one person's allowance to somebody else's address.
            directory.verifiedPrimaryEmail("user_1");
            address.set("b@example.com");

            assertThat(directory.verifiedPrimaryEmail("user_2").email()).isEqualTo("b@example.com");
            assertThat(directory.verifiedPrimaryEmail("user_1").email()).isEqualTo("a@example.com");
            assertThat(requests.get()).isEqualTo(2);
        }
    }

    @Nested
    @DisplayName("when Clerk cannot be reached")
    class Unreachable {

        @Test
        @DisplayName("fails safely rather than resolving to nothing-in-particular")
        void failsSafely() {
            /*
             * A real socket, to an address that refuses: `.invalid` is reserved
             * and cannot resolve, so this is the connection-refused path
             * without a stub server. The claim is that it comes back as
             * UNAVAILABLE rather than throwing out of provisioning or —
             * worse — being mistaken for "this user has no address", which
             * would be a silent no-allowance state for a live Clerk instance.
             */
            ClerkDirectory directory =
                    new ClerkDirectory("sk_test_x", "https://clerk.invalid/v1");

            ClerkDirectory.Lookup lookup = directory.verifiedPrimaryEmail("user_1");

            assertThat(lookup.resolved()).isFalse();
            assertThat(lookup.status()).isEqualTo(ClerkDirectory.Status.UNAVAILABLE);
        }
    }
}
