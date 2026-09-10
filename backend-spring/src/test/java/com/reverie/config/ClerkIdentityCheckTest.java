package com.reverie.config;

import com.reverie.service.FreeTierIdentityHasher;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Clerk mode refusing to start without what it enforces the allowance with.
 *
 * <h2>What is on trial</h2>
 *
 * <p>Not the wording, and not the two variables themselves — {@link
 * DeploymentCheckTest} already covers those, and calls the same method. What is
 * on trial here is <em>when</em> the refusal happens.
 *
 * <p>The allowance is resolved inside {@code UserService.provision}, which runs
 * on every authenticated request. So a clerk-mode deployment with no identity
 * key used to start, pass its health check, and then return 500 to every
 * request — a failure that looks like success until somebody signs in. The
 * claim is that it now cannot start at all, in any profile, and that dev mode
 * is untouched.
 */
class ClerkIdentityCheckTest {

    private static final String HMAC = "a-real-looking-identity-key-nobody-should-print";
    private static final String CLERK = "sk_live_a-real-looking-backend-api-key";

    /** Exactly what Spring builds, so `check()` is the real startup path. */
    private static ClerkIdentityCheck check(String mode, String hmac, String clerk) {
        return new ClerkIdentityCheck(mode, hmac, clerk);
    }

    @Nested
    @DisplayName("clerk mode")
    class ClerkMode {

        @Test
        @DisplayName("will not start without the identity key")
        void missingHmacSecretFailsStartup() {
            /*
             * CASE 1. The one that used to be a runtime 500 on every request:
             * `FreeTierIdentityHasher` refuses to hash without a key, and it is
             * asked to on every authenticated request rather than only at
             * sign-up.
             */
            assertThatThrownBy(() -> check("clerk", "", CLERK).check())
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("FREE_TIER_IDENTITY_HMAC_SECRET")
                    .hasMessageContaining("REVERIE_AUTH_MODE is 'clerk'");

            assertThat(ClerkIdentityCheck.missing("clerk", "", CLERK)).hasSize(1);
        }

        @Test
        @DisplayName("will not start without the Backend API key either")
        void missingClerkSecretFailsStartup() {
            /*
             * CASE 2. Reachable and easy to miss, because nothing about signing
             * in needs it: tokens verify against the JWKS. What needs it is the
             * verified email behind the allowance when the session token has no
             * email claim -- Clerk's default -- and the forced refresh that
             * account deletion depends on.
             */
            assertThatThrownBy(() -> check("clerk", HMAC, "").check())
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("CLERK_SECRET_KEY");

            assertThat(ClerkIdentityCheck.missing("clerk", HMAC, "")).hasSize(1);
        }

        @Test
        @DisplayName("says both are missing at once rather than one per restart")
        void bothAreReportedTogether() {
            // A fresh clerk-mode deployment has neither, and finding that out
            // one variable per restart is how a checklist becomes an evening.
            assertThatThrownBy(() -> check("clerk", "", "").check())
                    .hasMessageContaining("FREE_TIER_IDENTITY_HMAC_SECRET")
                    .hasMessageContaining("CLERK_SECRET_KEY")
                    .hasMessageContaining("2 values it needs are missing");

            assertThat(ClerkIdentityCheck.missing("clerk", "", "")).hasSize(2);
        }

        @Test
        @DisplayName("starts when both are configured")
        void configuredPasses() {
            // CASE 3. If this ever fails, the rest of the file is meaningless:
            // a check that cannot pass is a check somebody deletes.
            assertThatCode(() -> check("clerk", HMAC, CLERK).check()).doesNotThrowAnyException();

            assertThat(ClerkIdentityCheck.missing("clerk", HMAC, CLERK)).isEmpty();
        }

        @Test
        @DisplayName("treats whitespace as unset, because a blank variable is unset")
        void blankIsMissing() {
            // `FREE_TIER_IDENTITY_HMAC_SECRET=" "` in a compose file or a Render
            // field is the same configuration as not setting it, and it would
            // otherwise pass here and fail in the hasher.
            assertThat(ClerkIdentityCheck.missing("clerk", "   ", CLERK)).hasSize(1);
            assertThat(ClerkIdentityCheck.missing("clerk", HMAC, "  ")).hasSize(1);
            assertThat(ClerkIdentityCheck.missing("clerk", null, null)).hasSize(2);
        }

        @Test
        @DisplayName("and the mode is matched the way the rest of the app matches it")
        void modeMatching() {
            // AuthenticationFilter and ClerkTokens both compare case-insensitively
            // against a trimmed value, so a deployment written `Clerk` is in clerk
            // mode and must be held to the same requirement.
            assertThat(ClerkIdentityCheck.missing("CLERK", "", "")).hasSize(2);
            assertThat(ClerkIdentityCheck.missing("  clerk  ", "", "")).hasSize(2);
        }
    }

    @Nested
    @DisplayName("dev mode")
    class DevMode {

        @Test
        @DisplayName("needs neither, and still resolves an identity")
        void devModeIsUnchanged() {
            /*
             * CASE 4, and it is asserted as behaviour rather than as an absence.
             * Dev mode is the zero-configuration path: it derives the identity
             * from the dev subject and hashes it with the fixed key published in
             * this repository. Requiring a secret there would break the local
             * stack to protect a deployment that has not happened, and dev mode
             * already trusts an X-Dev-User header -- a published HMAC key is not
             * what makes it unsuitable for the internet.
             */
            assertThat(ClerkIdentityCheck.missing("dev", "", "")).isEmpty();
            assertThatCode(() -> check("dev", "", "").check()).doesNotThrowAnyException();

            // And the hasher really does produce one with nothing configured,
            // which is the half this check is relying on being true.
            assertThat(new FreeTierIdentityHasher("", "dev").hash("someone@example.com"))
                    .isPresent();
        }

        @Test
        @DisplayName("as does an unset or misspelt mode, which is not clerk")
        void anythingElseIsNotClerk() {
            /*
             * Deliberately not a second refusal. An unset or misspelt mode is
             * already the most serious thing wrong with a deployment -- it is an
             * authentication bypass -- and `DeploymentCheck` reports exactly
             * that, once, rather than adding two more lines about the free tier.
             */
            for (String mode : new String[] { "", "  ", "development", "DEV", "clerkk", null }) {
                assertThat(ClerkIdentityCheck.missing(mode, "", ""))
                        .as("mode=%s", mode)
                        .isEmpty();
            }
        }
    }

    @Nested
    @DisplayName("what the refusal says")
    class TheMessage {

        @Test
        @DisplayName("names the configuration and never its value")
        void neverEchoesASecret() {
            /*
             * CASE 5. A startup failure ends up in logs, consoles, screenshots
             * and pasted terminal output, so the message names the variable and
             * the consequence and nothing else. Asserted with a *present* value
             * alongside a missing one, because that is the case where a naive
             * "here is your configuration" message would leak one.
             */
            String hmacMissing = message(check("clerk", "", CLERK));
            assertThat(hmacMissing).contains("FREE_TIER_IDENTITY_HMAC_SECRET");
            assertThat(hmacMissing).doesNotContain(CLERK);

            String clerkMissing = message(check("clerk", HMAC, ""));
            assertThat(clerkMissing).contains("CLERK_SECRET_KEY");
            assertThat(clerkMissing).doesNotContain(HMAC);

            // Nor the published development key, which is a secret's shape even
            // where it is not a secret.
            String devKeyInClerkMode =
                    message(check("clerk", FreeTierIdentityHasher.DEVELOPMENT_SECRET, ""));
            assertThat(devKeyInClerkMode)
                    .doesNotContain(FreeTierIdentityHasher.DEVELOPMENT_SECRET);
        }

        @Test
        @DisplayName("says what to do about it")
        void isActionable() {
            // Two ways out, both named: set them, or run the mode that does not
            // need them. "Configuration error" would be a line somebody skims.
            assertThat(message(check("clerk", "", "")))
                    .contains("Set them and restart")
                    .contains("REVERIE_AUTH_MODE=dev");
        }

        private String message(ClerkIdentityCheck subject) {
            try {
                subject.check();
            } catch (IllegalStateException refused) {
                return refused.getMessage();
            }
            throw new AssertionError("expected this configuration to be refused");
        }
    }

    @Nested
    @DisplayName("the two guards together")
    class WithDeploymentCheck {

        @Test
        @DisplayName("production reports the same two through DeploymentCheck")
        void productionStillListsThem() {
            /*
             * This class is `@Profile("!production")` so the two never both
             * throw, which would cost `DeploymentCheck` its one virtue: every
             * problem in one restart. So production has to still see these, and
             * it does -- through the same method, so there is one wording.
             */
            List<String> gaps = ClerkIdentityCheck.missing("clerk", "", "");

            assertThat(gaps).hasSize(2);
            assertThat(String.join(" ", gaps))
                    .contains("FREE_TIER_IDENTITY_HMAC_SECRET")
                    .contains("CLERK_SECRET_KEY");
        }
    }
}
