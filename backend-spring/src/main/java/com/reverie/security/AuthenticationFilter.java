package com.reverie.security;

import com.reverie.common.ApiException;
import com.reverie.service.UserService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Resolves the caller identity for `/api/v1/**`:
 * <ul>
 *   <li><b>dev</b> mode: trusts the {@code X-Dev-User} header (falls back to a
 *       fixed dev user so the stack runs with no Clerk account).</li>
 *   <li><b>clerk</b> mode: validates the Bearer JWT against Clerk's JWKS and
 *       uses {@code sub} as the Clerk user id.</li>
 * </ul>
 * On success it provisions a local user and stores the local user id as the
 * authentication principal. Non-API paths are skipped (see shouldNotFilter).
 */
@Component
public class AuthenticationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(AuthenticationFilter.class);
    private static final String DEV_FALLBACK_USER = "dev-user";

    private final UserService userService;
    private final ClerkTokens tokens;
    private final String authMode;

    /**
     * @param tokens what decides whether a token is real. Shared with
     *     {@link StompAuthInterceptor}, so the socket and the API cannot come
     *     to disagree about it — see {@link ClerkTokens}.
     * @param authMode {@code dev} or {@code clerk}. <b>Defaults to clerk, and
     *     that direction matters.</b> It used to default to dev, which meant an
     *     unset or misspelt {@code REVERIE_AUTH_MODE} put the service into the
     *     mode that trusts an {@code X-Dev-User} header — an authentication
     *     bypass available to anybody who can send one, arrived at by a missing
     *     variable rather than by a decision. Failing closed costs a deployment
     *     that forgot to configure Clerk a wall of 401s, which is the correct
     *     failure and an obvious one.
     */
    public AuthenticationFilter(UserService userService,
                                ClerkTokens tokens,
                                @Value("${reverie.auth-mode:clerk}") String authMode) {
        this.userService = userService;
        this.tokens = tokens;
        this.authMode = authMode;
        if (!"clerk".equalsIgnoreCase(authMode)) {
            // At WARN, on every start, and naming the consequence rather than
            // the setting. Dev mode is a legitimate way to run the stack with
            // no keys; it is not a legitimate way to run it in front of people,
            // and the difference has to be visible in a log somebody skims.
            log.warn("AUTH IS IN '{}' MODE: any caller may become any user by sending "
                    + "an X-Dev-User header. This must never be a deployment that "
                    + "real people can reach.", authMode);
        }
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return !path.startsWith("/api/v1")
                || path.startsWith("/api/v1/billing/webhook");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        try {
            Identity identity = resolveIdentity(request);
            String clerkUserId = identity.subject();
            if (clerkUserId != null && !clerkUserId.isBlank()) {
                // Provisioning looks the user up by clerk_user_id and may insert
                // a row — both before the local user id exists, so neither can
                // satisfy a tenant policy yet. This is the bootstrap case the
                // system context exists for.
                String localUserId = TenantContext.asSystem(
                        () -> userService.provision(clerkUserId, identity.email()));

                // From here on every connection this request borrows is stamped
                // with this user, and row-level security does the rest.
                TenantContext.setUserId(localUserId);

                var auth = new UsernamePasswordAuthenticationToken(
                        localUserId, null, List.of(new SimpleGrantedAuthority("ROLE_USER")));
                // Carried on the authentication rather than stored on the user:
                // it describes this credential, and a row in the database would
                // go stale the moment somebody changed their factors at Clerk
                // and then be wrong on a page whose whole job is being right.
                auth.setDetails(new SignInSecurity(authMode, identity.secondFactor()));
                SecurityContextHolder.getContext().setAuthentication(auth);
            }
        } catch (ApiException refused) {
            /*
             * A DECISION ABOUT THIS IDENTITY, AND IT HAS TO SURVIVE THIS LAYER.
             *
             * <p>Provisioning refuses two subjects on purpose: one that
             * self-only mode does not allow, and one whose lifetime free
             * allowance is already spent and is asking for a new account. Both
             * raise 403 deliberately -- `SelfOnlyAccess` says why in its own
             * words: "They proved who they are perfectly well. Calling the
             * token invalid would send them round a sign-in loop that can never
             * succeed."
             *
             * <p>And that is exactly what happened, because the catch below
             * swallowed it and the authorization layer answered 401. The
             * service's careful choice of status never reached anybody: the
             * browser saw "Authentication required", concluded the session had
             * expired, and sent them back to sign in -- which works, mints a
             * fresh token, and arrives here again. A loop, once per refusal.
             *
             * <p>So it is written out with its own status and code, and the
             * chain stops. Nothing downstream needs to run: there is no
             * principal, and the response is already complete.
             */
            SecurityContextHolder.clearContext();
            log.debug("Provisioning refused this subject: {}", refused.getErrorCode());
            respond(response, refused);
            return;
        } catch (Exception ex) {
            // Leave the context unauthenticated; the authorization layer returns 401.
            log.debug("Authentication resolution failed: {}", ex.getMessage());
            SecurityContextHolder.clearContext();
        }
        chain.doFilter(request, response);
    }

    /**
     * The same JSON body every other error in this API has.
     *
     * <p>Hand-written rather than delegated, and it has to be: this runs in a
     * filter, before Spring MVC exists, so there is no
     * {@code @RestControllerAdvice} in the picture and no message converter to
     * borrow. The shape is copied from {@code SecurityConfig}'s 401 entry
     * point, which writes its body the same way and for the same reason.
     *
     * <p>Only the message is interpolated, and only the two characters that
     * could break the document are escaped. The messages are literals in this
     * codebase rather than anything a caller supplies -- but a refusal is not
     * the place to find out that stopped being true.
     */
    private static void respond(HttpServletResponse response, ApiException refused)
            throws IOException {
        response.setStatus(refused.getStatus().value());
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        String message = refused.getMessage() == null ? "" : refused.getMessage();
        response.getWriter().write("{\"status\":" + refused.getStatus().value()
                + ",\"error\":\"" + refused.getErrorCode() + "\""
                + ",\"message\":\"" + message.replace("\\", "\\\\").replace("\"", "\\\"")
                + "\"}");
    }

    /**
     * Claim names that may carry the address, in preference order. Clerk's
     * default session token has no email at all — it has to be added through a
     * JWT template — and which name it lands under depends on how that template
     * was written, so several spellings are accepted.
     */
    private static final List<String> EMAIL_CLAIMS = List.of(
            "email", "email_address", "primary_email_address", "primaryEmailAddress");

    /**
     * Resolve the caller and, where available, their email in a single decode.
     *
     * <p>The two are returned together because in clerk mode both come from the
     * same JWT: decoding twice would double the verification cost on every
     * request, and decoding once and discarding the email is what previously
     * left every Clerk-authenticated user with a null address — silently
     * disabling recap email in production while it worked fine in dev.
     */
    private record Identity(String subject, String email, Boolean secondFactor) {
    }

    /**
     * Claim names that may say whether a second factor was used.
     *
     * <p>Several spellings for the same reason the email claim has several:
     * Clerk's default session token carries none of them, so whichever one
     * arrives depends on how somebody wrote the JWT template. Absent stays
     * absent — see {@link SignInSecurity} on why that must not become false.
     */
    private static final List<String> SECOND_FACTOR_CLAIMS = List.of(
            "two_factor_enabled", "twoFactorEnabled", "two_factor", "tfa", "mfa");

    /**
     * Who is calling.
     *
     * <p>Note which way round the branch reads: clerk is the fall-through and
     * dev is the special case that has to be asked for by name. See the
     * constructor for why.
     */
    private Identity resolveIdentity(HttpServletRequest request) {
        if (!"dev".equalsIgnoreCase(authMode)) {
            String header = request.getHeader("Authorization");
            if (header == null || !header.startsWith("Bearer ")) {
                return new Identity(null, null, null);
            }
            Jwt jwt = tokens.verify(header.substring(7));
            return new Identity(jwt.getSubject(), emailClaim(jwt), secondFactorClaim(jwt));
        }
        // dev mode
        String devUser = request.getHeader("X-Dev-User");
        String subject = (devUser == null || devUser.isBlank()) ? DEV_FALLBACK_USER : devUser;
        String email = request.getHeader("X-Dev-Email");
        return new Identity(subject, (email == null || email.isBlank()) ? null : email, null);
    }

    /** What the token said about the address being verified, or null. */
    static Boolean verifiedClaim(Jwt jwt) {
        for (String claim : EMAIL_VERIFIED_CLAIMS) {
            Object value = jwt.getClaim(claim);
            if (value instanceof Boolean b) {
                return b;
            }
            // A template that renders it through string interpolation produces
            // "true"/"false" rather than a JSON boolean -- same trap the
            // second-factor claim has, and the same handling.
            if (value instanceof String s) {
                if ("true".equalsIgnoreCase(s.trim())) {
                    return Boolean.TRUE;
                }
                if ("false".equalsIgnoreCase(s.trim())) {
                    return Boolean.FALSE;
                }
            }
        }
        return null;
    }

    /** What the token said about a second factor, or null if it said nothing. */
    static Boolean secondFactorClaim(Jwt jwt) {
        for (String claim : SECOND_FACTOR_CLAIMS) {
            Object value = jwt.getClaim(claim);
            if (value instanceof Boolean b) {
                return b;
            }
            // Templates that render it through a string interpolation produce
            // "true"/"false" rather than a JSON boolean. Anything else is not
            // an assertion and is treated as silence.
            if (value instanceof String s) {
                if ("true".equalsIgnoreCase(s.trim())) {
                    return Boolean.TRUE;
                }
                if ("false".equalsIgnoreCase(s.trim())) {
                    return Boolean.FALSE;
                }
            }
        }
        return null;
    }

    /**
     * Claim names that may say whether the address above has been verified.
     *
     * <p>`email_verified` is the OIDC spelling and the one a Clerk template
     * renders if somebody adds it. Absent means unstated, which is treated as
     * trustworthy: the claim carries the *primary* address, and a primary
     * address is verified in an ordinary Clerk configuration.
     *
     * <p>What is not treated as trustworthy is an explicit false. See
     * {@link #emailClaim}.
     */
    private static final List<String> EMAIL_VERIFIED_CLAIMS = List.of(
            "email_verified", "emailVerified", "primary_email_verified");

    private static String emailClaim(Jwt jwt) {
        /*
         * AN EXPLICITLY UNVERIFIED ADDRESS IS NOT AN IDENTITY.
         *
         * <p>The lifetime free allowance is keyed to this address (see
         * `FreeTierService`), so an unverified one would make the allowance
         * transferable by typing: claim somebody's address, get their remaining
         * minutes. Dropping the claim here sends that case to Clerk's Backend
         * API, which applies the same rule against Clerk's own record.
         *
         * <p>It also stops an unverified address being stored as the account's
         * recap address, which was never intended either.
         */
        if (Boolean.FALSE.equals(verifiedClaim(jwt))) {
            log.debug("The token's email claim says it is unverified; ignoring it.");
            return null;
        }
        for (String claim : EMAIL_CLAIMS) {
            Object value = jwt.getClaim(claim);
            if (value instanceof String s && !s.isBlank()) {
                return s.trim();
            }
        }
        // Not fatal: the user can still set a recap address by hand in Settings.
        // Logged because the usual cause is a missing Clerk JWT template claim,
        // which is invisible until somebody wonders why no email arrived.
        log.debug("No email claim on the Clerk token; add one to the JWT template "
                + "if recap email should work without manual entry.");
        return null;
    }

}
