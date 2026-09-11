package com.reverie.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * What Reverie accepts as proof of who somebody is.
 *
 * <p>The rule these tests exist for: <b>a valid signature is not an identity.</b>
 * Signature verification answers "was this minted by the key behind the
 * configured JWKS URL", and that is a different question from "was this minted
 * by our Clerk instance". A deployment pointed at the wrong JWKS URL, or a
 * token from another Clerk instance whose keys are fetchable, passes a
 * signature check and fails an issuer check — so the issuer check is the one
 * that decides whose users these are.
 *
 * <p>No Clerk service and no JWKS endpoint. The validator is the part that
 * holds the policy, and it can be handed tokens directly; standing up a key
 * server to test it would mean testing Nimbus rather than Reverie.
 */
class ClerkTokenValidationTest {

    private static final String ISSUER = "https://example-instance.clerk.accounts.dev";

    /** A token that is structurally fine, so only the claims under test decide. */
    private static Jwt token(String issuer, Instant expiry) {
        return Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .claim("iss", issuer)
                .claim("sub", "user_123")
                .issuedAt(expiry.minus(1, ChronoUnit.HOURS))
                .expiresAt(expiry)
                .build();
    }

    @Nested
    @DisplayName("the issuer decides")
    class TheIssuer {

        @Test
        @DisplayName("our own Clerk instance is accepted")
        void correctIssuerPasses() {
            OAuth2TokenValidatorResult result = ClerkTokens.validatorFor(ISSUER)
                    .validate(token(ISSUER, Instant.now().plus(1, ChronoUnit.HOURS)));

            assertThat(result.hasErrors()).isFalse();
        }

        @Test
        @DisplayName("another Clerk instance is refused")
        void wrongIssuerFails() {
            // The attack this closes. Everything about this token is well-formed;
            // it simply belongs to somebody else's tenant.
            OAuth2TokenValidatorResult result = ClerkTokens.validatorFor(ISSUER)
                    .validate(token("https://attacker.clerk.accounts.dev",
                            Instant.now().plus(1, ChronoUnit.HOURS)));

            assertThat(result.hasErrors()).isTrue();
        }

        @Test
        @DisplayName("a token with no issuer at all is refused")
        void missingIssuerFails() {
            Jwt noIssuer = Jwt.withTokenValue("token")
                    .header("alg", "RS256")
                    .claim("sub", "user_123")
                    .issuedAt(Instant.now().minus(1, ChronoUnit.MINUTES))
                    .expiresAt(Instant.now().plus(1, ChronoUnit.HOURS))
                    .build();

            assertThat(ClerkTokens.validatorFor(ISSUER).validate(noIssuer).hasErrors()).isTrue();
        }
    }

    @Nested
    @DisplayName("the expiry check is not lost to the issuer check")
    class TheClock {

        @Test
        @DisplayName("an expired token is refused even with the right issuer")
        void expiredFails() {
            // Replacing a decoder's validator is how a timestamp check gets
            // dropped by accident, and a token that never expires is a worse
            // bug than the one the issuer check fixes.
            OAuth2TokenValidatorResult result = ClerkTokens.validatorFor(ISSUER)
                    .validate(token(ISSUER, Instant.now().minus(1, ChronoUnit.HOURS)));

            assertThat(result.hasErrors()).isTrue();
        }
    }

    @Nested
    @DisplayName("clerk mode will not run half-configured")
    class Configuration {

        @Test
        @DisplayName("no JWKS URL is refused rather than skipped")
        void requiresJwks() {
            ClerkTokens tokens = new ClerkTokens("clerk", "", ISSUER);

            assertThatThrownBy(() -> tokens.verify("anything"))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("CLERK_JWKS_URL");
        }

        @Test
        @DisplayName("no issuer is refused rather than verified without one")
        void requiresIssuer() {
            // Fails closed. The alternative -- verify the signature and skip the
            // issuer when none is configured -- is the bug this class had: the
            // value was required at startup and then never consulted, so the
            // check silently did not exist.
            ClerkTokens tokens = new ClerkTokens("clerk", "https://example/.well-known/jwks.json", "");

            assertThatThrownBy(() -> tokens.verify("anything"))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("CLERK_ISSUER");
        }

        @Test
        @DisplayName("dev mode stays a separate decision and builds no decoder")
        void devModeIsSeparate() {
            // Dev mode trusts a header and never reaches a decoder, so missing
            // Clerk configuration must not be what stops it -- otherwise running
            // the stack without a Clerk account stops working.
            ClerkTokens tokens = new ClerkTokens("dev", "", "");

            assertThat(tokens.devMode()).isTrue();
            assertThat(new ClerkTokens("clerk", "", "").devMode()).isFalse();
            assertThat(new ClerkTokens("", "", "").devMode()).isFalse();
            assertThat(new ClerkTokens("development", "", "").devMode()).isFalse();
        }
    }
}
