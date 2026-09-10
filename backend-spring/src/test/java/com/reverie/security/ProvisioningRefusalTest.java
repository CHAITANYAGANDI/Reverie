package com.reverie.security;

import com.reverie.common.ApiException;
import com.reverie.service.UserService;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * A refusal from provisioning reaches the client as a refusal.
 *
 * <h2>The bug this pins down</h2>
 *
 * <p>{@code UserService.provision} declines two subjects deliberately: one that
 * self-only mode does not allow, and one whose lifetime free allowance is spent
 * and is asking for a new account. Both raise <b>403</b>, and
 * {@link SelfOnlyAccess} says why in its own test — "They proved who they are
 * perfectly well. Calling the token invalid would send them round a sign-in
 * loop that can never succeed."
 *
 * <p>Which is precisely what happened, one layer up. The filter caught
 * everything, cleared the context and let the request through unauthenticated,
 * so the authorization layer answered <b>401 Authentication required</b>. The
 * service's careful choice of status never reached anybody: the browser read it
 * as an expired session, sent the person back to sign in, and sign-in
 * worked — minting a fresh token that arrived here and was refused again.
 *
 * <p>So these are about the two things that make the difference: the status and
 * code that get written, and the fact that the chain stops.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ProvisioningRefusalTest {

    private static final String SUBJECT = "somebody";

    @Mock private UserService users;

    private AuthenticationFilter devModeFilter() {
        // Dev mode, because the subject then comes off a header and this test
        // needs no JWKS, no token and no Clerk. What is under test is what the
        // filter does with a refusal, and that is the same either way.
        return new AuthenticationFilter(users, new ClerkTokens("dev", ""), "dev");
    }

    private static MockHttpServletRequest request() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/usage");
        request.setRequestURI("/api/v1/usage");
        request.addHeader("X-Dev-User", SUBJECT);
        return request;
    }

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
        TenantContext.clear();
    }

    @Nested
    @DisplayName("a spent identity asking for a new account")
    class Exhausted {

        private static final String MESSAGE =
                "This email address has already used all 100 free transcription minutes.";

        @Test
        @DisplayName("is answered 403 with its own code, not 401")
        void answers403() throws Exception {
            doThrow(ApiException.freeTierExhausted(MESSAGE))
                    .when(users).provision(anyString(), any());
            MockHttpServletResponse response = new MockHttpServletResponse();

            devModeFilter().doFilter(request(), response, mock(FilterChain.class));

            assertThat(response.getStatus()).isEqualTo(403);
            assertThat(response.getContentType()).contains("application/json");
            assertThat(response.getContentAsString())
                    .contains("\"error\":\"FREE_TIER_EXHAUSTED\"")
                    .contains("\"status\":403")
                    .contains(MESSAGE);
        }

        @Test
        @DisplayName("and the chain stops, so nothing downstream runs")
        void stopsTheChain() throws Exception {
            /*
             * The response is already complete and there is no principal, so
             * there is nothing for the rest of the chain to do -- and letting it
             * run is what produced the 401 that overwrote this answer.
             */
            doThrow(ApiException.freeTierExhausted(MESSAGE))
                    .when(users).provision(anyString(), any());
            FilterChain chain = mock(FilterChain.class);

            devModeFilter().doFilter(request(), new MockHttpServletResponse(), chain);

            verifyNoInteractions(chain);
            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        }

        @Test
        @DisplayName("and a quote in the message cannot break the body")
        void escapesTheMessage() throws Exception {
            // The messages are literals in this codebase rather than anything a
            // caller supplies. A refusal is not the place to discover that has
            // stopped being true.
            doThrow(ApiException.freeTierExhausted("a \"quoted\" back\\slash"))
                    .when(users).provision(anyString(), any());
            MockHttpServletResponse response = new MockHttpServletResponse();

            devModeFilter().doFilter(request(), response, mock(FilterChain.class));

            assertThat(response.getContentAsString())
                    .contains("a \\\"quoted\\\" back\\\\slash");
        }
    }

    @Nested
    @DisplayName("self-only mode's refusal, which had the same problem")
    class SelfOnly {

        @Test
        @DisplayName("is surfaced as 403 as it always meant to be")
        void surfacesForbidden() throws Exception {
            // Fixed by the same mechanism rather than by a case of its own:
            // "This deployment is private" was being delivered as "please
            // authenticate", to somebody who just had.
            doThrow(ApiException.forbidden("This deployment is private."))
                    .when(users).provision(anyString(), any());
            MockHttpServletResponse response = new MockHttpServletResponse();

            devModeFilter().doFilter(request(), response, mock(FilterChain.class));

            assertThat(response.getStatus()).isEqualTo(403);
            assertThat(response.getContentAsString())
                    .contains("\"error\":\"FORBIDDEN\"")
                    .contains("This deployment is private.");
        }
    }

    @Nested
    @DisplayName("everything that is not a refusal")
    class StillUnauthenticated {

        @Test
        @DisplayName("falls through unauthenticated, so the 401 path is unchanged")
        void unexpectedFailuresAreStill401() throws Exception {
            /*
             * A broken token, a JWKS that will not load, a database that is
             * down: none of those is a decision about this identity, and none
             * of them should be dressed up as one. They stay exactly as they
             * were -- no principal, chain continues, authorization answers 401.
             */
            doThrow(new IllegalStateException("the database is on fire"))
                    .when(users).provision(anyString(), any());
            MockHttpServletResponse response = new MockHttpServletResponse();
            FilterChain chain = mock(FilterChain.class);

            devModeFilter().doFilter(request(), response, chain);

            verify(chain).doFilter(any(), any());
            assertThat(response.getStatus()).isEqualTo(200);
            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        }

        @Test
        @DisplayName("and an accepted subject is authenticated as before")
        void theHappyPathIsUntouched() throws Exception {
            // The guard against writing a filter that refuses everybody.
            when(users.provision(anyString(), any())).thenReturn("usr_1");
            FilterChain chain = mock(FilterChain.class);

            devModeFilter().doFilter(request(), new MockHttpServletResponse(), chain);

            verify(chain).doFilter(any(), any());
            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
            assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal())
                    .isEqualTo("usr_1");
        }
    }
}
