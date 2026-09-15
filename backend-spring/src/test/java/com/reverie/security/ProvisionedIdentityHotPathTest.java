package com.reverie.security;

import com.reverie.repository.MeetingRepository;
import com.reverie.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import java.security.Principal;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Both doors, one resolver, and the transaction that no longer opens.
 *
 * <p>{@link ProvisionedIdentityResolverTest} asserts the resolver's own rules.
 * This asserts the thing that actually ships: that the HTTP filter and the
 * STOMP interceptor both go through it, and that a returning caller through
 * either one does not reach {@code UserService.provision} — which is what keeps
 * the system-pool round trips off a request.
 *
 * <p>Dev mode throughout, because the subject then comes off a header and the
 * test needs no JWKS, no token and no Clerk. What is under test is the
 * plumbing, and that is identical in both modes.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ProvisionedIdentityHotPathTest {

    private static final String SUBJECT = "usr_regular";
    private static final String EMAIL = "regular@example.test";
    private static final String LOCAL = "usr_local";

    @Mock private UserService users;
    @Mock private MeetingRepository meetings;

    private ProvisionedIdentityResolver resolver;
    private AuthenticationFilter filter;
    private StompAuthInterceptor interceptor;

    private final MessageChannel channel = mock(MessageChannel.class);

    @BeforeEach
    void setUp() {
        ClerkTokens dev = new ClerkTokens("dev", "", "");
        // One resolver, handed to both doors -- exactly as Spring wires it.
        resolver = new ProvisionedIdentityResolver(users, new SelfOnlyAccess(false, ""));
        filter = new AuthenticationFilter(resolver, dev, "dev");
        interceptor = new StompAuthInterceptor(dev, resolver, meetings);
        when(users.provision(anyString(), any())).thenReturn(LOCAL);
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("a returning HTTP request never enters the provisioning transaction")
    void httpSecondRequestSkipsProvisioning() throws Exception {
        get();
        get();
        get();

        verify(users, times(1)).provision(SUBJECT, EMAIL);
    }

    @Test
    @DisplayName("and still authenticates as the same local user every time")
    void httpCachedRequestsStillAuthenticate() throws Exception {
        get();
        SecurityContextHolder.clearContext();
        get();

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
        assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal())
                .isEqualTo(LOCAL);
    }

    @Test
    @DisplayName("a returning STOMP connection never enters it either")
    void stompSecondConnectSkipsProvisioning() {
        assertThat(connect()).isNotNull();
        assertThat(connect()).isNotNull();

        verify(users, times(1)).provision(SUBJECT, EMAIL);
    }

    @Test
    @DisplayName("THE SHARED RESOLVER: a socket reuses what a request already established")
    void theTwoDoorsShareOneAnswer() throws Exception {
        /*
         * The reason this is one bean rather than one per caller. Two copies of
         * an identity decision drift, and the copy that drifts is not found
         * until it is the one being relied on -- the same argument ClerkTokens
         * makes about verification.
         */
        get();
        Principal connected = connect();

        assertThat(connected).isNotNull();
        assertThat(connected.getName()).isEqualTo(LOCAL);
        verify(users, times(1)).provision(SUBJECT, EMAIL);
    }

    @Test
    @DisplayName("a different subject is provisioned on its own, not served from another's entry")
    void adifferentSubjectIsNotServedFromCache() throws Exception {
        when(users.provision("usr_other", EMAIL)).thenReturn("usr_other_local");

        get();
        MockHttpServletRequest other = request("usr_other");
        filter.doFilter(other, new MockHttpServletResponse(), mock(jakarta.servlet.FilterChain.class));

        verify(users).provision(SUBJECT, EMAIL);
        verify(users).provision("usr_other", EMAIL);
        assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal())
                .isEqualTo("usr_other_local");
    }

    /* -------------------------------- helpers ------------------------------- */

    private void get() throws Exception {
        filter.doFilter(request(SUBJECT), new MockHttpServletResponse(),
                mock(jakarta.servlet.FilterChain.class));
    }

    private static MockHttpServletRequest request(String subject) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/meetings");
        request.setRequestURI("/api/v1/meetings");
        request.addHeader("X-Dev-User", subject);
        request.addHeader("X-Dev-Email", EMAIL);
        return request;
    }

    private Principal connect() {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        Map.of("X-Dev-User", SUBJECT, "X-Dev-Email", EMAIL).forEach(accessor::setNativeHeader);
        accessor.setLeaveMutable(true);
        Message<?> sent = interceptor.preSend(
                MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders()), channel);
        return StompHeaderAccessor.wrap(sent).getUser();
    }
}
