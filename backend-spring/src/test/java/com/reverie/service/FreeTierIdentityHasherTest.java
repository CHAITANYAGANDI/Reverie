package com.reverie.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The durable identity of a person, for one number they only get once.
 *
 * <p>Everything here is a rule that renders perfectly when wrong. A
 * normalisation that misses a capital hands somebody a second free allowance; a
 * normalisation that is too clever merges two strangers and spends one person's
 * minutes on the other; a key that changes hands the whole estate another 100
 * minutes without a single error in the logs.
 */
class FreeTierIdentityHasherTest {

    private static final String SECRET = "test-secret-not-the-published-one";

    private static FreeTierIdentityHasher clerk(String secret) {
        return new FreeTierIdentityHasher(secret, "clerk");
    }

    private static FreeTierIdentityHasher dev() {
        return new FreeTierIdentityHasher("", "dev");
    }

    @Nested
    @DisplayName("normalisation")
    class Normalisation {

        @Test
        @DisplayName("case and surrounding whitespace resolve to one identity")
        void caseAndWhitespaceAgree() {
            /*
             * The three spellings from the bug report. If any of them produced
             * a different hash, deleting an account and signing up again with a
             * capital letter would be a fresh allowance — the same bypass with
             * one extra keystroke.
             */
            FreeTierIdentityHasher hasher = clerk(SECRET);

            String canonical = hasher.hash("user@example.com").orElseThrow();

            assertThat(hasher.hash("User@Example.com")).contains(canonical);
            assertThat(hasher.hash("  user@example.com  ")).contains(canonical);
            assertThat(hasher.hash(" USER@EXAMPLE.COM ")).contains(canonical);
        }

        @Test
        @DisplayName("a different address is a different identity")
        void differentAddressesDiffer() {
            FreeTierIdentityHasher hasher = clerk(SECRET);

            assertThat(hasher.hash("a@example.com"))
                    .isNotEqualTo(hasher.hash("b@example.com"));
        }

        @Test
        @DisplayName("provider-specific aliases are left alone, deliberately")
        void aliasesAreNotCanonicalised() {
            /*
             * NOT merged, and this is a decision rather than an omission.
             *
             * <p>Stripping Gmail's dots or a `+tag` would merge addresses that
             * Reverie's own provider treats as separate accounts — so one
             * person's allowance could be spent by whoever owns the
             * dotless spelling. Under-merging costs a duplicate free tier for
             * somebody who deliberately used an alias. Over-merging locks a
             * stranger out of a product they paid nothing for but did nothing
             * wrong in. Only one of those is recoverable.
             */
            FreeTierIdentityHasher hasher = clerk(SECRET);

            assertThat(hasher.hash("a.b@gmail.com")).isNotEqualTo(hasher.hash("ab@gmail.com"));
            assertThat(hasher.hash("a+one@gmail.com")).isNotEqualTo(hasher.hash("a@gmail.com"));
        }

        @Test
        @DisplayName("nothing usable is no identity at all")
        void nothingUsableIsEmpty() {
            // Not an exception and not a made-up hash: an absent email claim is
            // an ordinary state of a Clerk token, and the caller decides.
            FreeTierIdentityHasher hasher = clerk(SECRET);

            assertThat(hasher.hash(null)).isEmpty();
            assertThat(hasher.hash("")).isEmpty();
            assertThat(hasher.hash("   ")).isEmpty();
            assertThat(hasher.hash("not-an-address")).isEmpty();
            assertThat(hasher.hash("@example.com")).isEmpty();
            assertThat(hasher.hash("user@")).isEmpty();
        }

        @Test
        @DisplayName("the pure form is the whole rule")
        void normalizeIsTrimAndLower() {
            assertThat(FreeTierIdentityHasher.normalize(" User@Example.COM "))
                    .isEqualTo("user@example.com");
            assertThat(FreeTierIdentityHasher.normalize("nope")).isNull();
        }
    }

    @Nested
    @DisplayName("the key")
    class Key {

        @Test
        @DisplayName("a missing key in provider mode refuses to hash")
        void missingKeyRefuses() {
            /*
             * THE FAILURE MODE THIS EXISTS TO MAKE LOUD.
             *
             * <p>Hashing under a random or absent key would produce identities
             * that nothing can ever match again, so every returning user looks
             * new and is handed another allowance — and nothing errors, so
             * nobody finds out. Refusing is the only safe answer, and
             * `DeploymentCheck` moves the refusal to boot time where it belongs.
             */
            FreeTierIdentityHasher hasher = clerk("");

            assertThatThrownBy(() -> hasher.hash("user@example.com"))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("FREE_TIER_IDENTITY_HMAC_SECRET");
        }

        @Test
        @DisplayName("blank is missing, whatever it looks like")
        void whitespaceKeyIsMissing() {
            assertThatThrownBy(() -> clerk("   ").hash("user@example.com"))
                    .isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("a laptop gets the fixed development key, not a random one")
        void devModeIsStable() {
            /*
             * Fixed rather than generated, because a random key per start would
             * hand the local account a fresh allowance on every restart and
             * make the feature untestable by hand. Safe for the same reason dev
             * mode is safe: dev mode already trusts an X-Dev-User header.
             */
            String first = dev().hash("user@example.com").orElseThrow();
            String second = dev().hash("user@example.com").orElseThrow();

            assertThat(first).isEqualTo(second);
        }

        @Test
        @DisplayName("a different key is a different identity, which is the risk")
        void changingTheKeyChangesEverything() {
            // Asserted so the operational requirement is impossible to miss
            // while reading the tests: this is why the value must be backed up
            // with the database.
            Optional<String> underOne = clerk(SECRET).hash("user@example.com");
            Optional<String> underAnother = clerk("a-different-secret").hash("user@example.com");

            assertThat(underOne).isNotEqualTo(underAnother);
        }

        @Test
        @DisplayName("the hash is a hex digest and holds none of the address")
        void hashLooksLikeAHash() {
            String hash = clerk(SECRET).hash("user@example.com").orElseThrow();

            // HMAC-SHA-256, hex: 64 characters, and nothing recoverable in it.
            assertThat(hash).hasSize(64).matches("[0-9a-f]+");
            assertThat(hash).doesNotContain("user").doesNotContain("example");
        }

        @Test
        @DisplayName("the version is stored so a rotation can be additive")
        void versionIsPinned() {
            assertThat(FreeTierIdentityHasher.HASH_VERSION).isEqualTo((short) 1);
        }
    }
}
