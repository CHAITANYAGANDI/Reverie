package com.reverie.config;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Refuses to start in Clerk mode without the two values the lifetime free
 * allowance is enforced with.
 *
 * <h2>The failure this replaces</h2>
 *
 * <p>{@code UserService.provision} resolves the free-tier identity, and it runs
 * on <em>every authenticated request</em> rather than only at sign-up. In clerk
 * mode with no HMAC key, {@link com.reverie.service.FreeTierIdentityHasher}
 * refuses to hash — correctly, because a generated or changed key makes every
 * returning person look new and hands the whole estate another allowance,
 * silently. But the refusal used to arrive here:
 *
 * <pre>
 *   the application starts
 *   the health check passes
 *   the first authenticated request reaches provision()
 *   500, on every request, for a reason nothing announced
 * </pre>
 *
 * <p>Which is the same shape of problem {@link DeploymentCheck} exists to
 * prevent: a configuration that fails in a way that looks like success. So it
 * is refused at startup, named, before the first request.
 *
 * <h2>Why this is not simply part of DeploymentCheck</h2>
 *
 * <p>Because the two guards answer different questions.
 * {@code DeploymentCheck} asks <em>is this the internet?</em> — it is gated on
 * the {@code production} profile, and its subject is development-shaped values
 * that are correct on a laptop. This one asks <em>is Clerk deciding who people
 * are?</em>, which is a property of the mode and is just as true on a laptop:
 * a clerk-mode stack with no identity key cannot enforce the allowance
 * anywhere.
 *
 * <p>{@code @Profile("!production")} so the two never both fire. In production
 * {@code DeploymentCheck} owns the report, and its whole virtue is collecting
 * every problem into one restart rather than one per redeploy — a second
 * component throwing first would take that away. Everywhere else, this is the
 * one that runs.
 *
 * <p>The messages live here, in {@link #missing}, and {@code DeploymentCheck}
 * calls it. One wording, two callers: the sentence somebody reads at 2am should
 * not depend on which guard caught it.
 *
 * <h2>What it costs, stated plainly</h2>
 *
 * <p>{@code REVERIE_AUTH_MODE} defaults to {@code clerk} — deliberately, since
 * the alternative trusts a header — so a local stack that has not set both
 * variables now refuses to boot instead of failing on its first request. Dev
 * mode is unaffected and remains the zero-configuration path: it derives a
 * stable identity from the dev subject and uses the fixed development key,
 * which is safe for the same reason dev mode is.
 *
 * <p>No defaults are added for clerk mode and nothing is generated at startup.
 * Either would be the silent bug this refuses to allow.
 */
@Component
@Profile("!production")
public class ClerkIdentityCheck {

    private final String authMode;
    private final String freeTierSecret;
    private final String clerkSecretKey;

    public ClerkIdentityCheck(
            @Value("${reverie.auth-mode:clerk}") String authMode,
            @Value("${reverie.free-tier.identity-secret:}") String freeTierSecret,
            @Value("${reverie.clerk.secret-key:}") String clerkSecretKey) {
        this.authMode = authMode;
        // Both are held only to answer "is it set". Neither is logged, and
        // neither appears in a message -- see missing().
        this.freeTierSecret = freeTierSecret;
        this.clerkSecretKey = clerkSecretKey;
    }

    @PostConstruct
    void check() {
        List<String> gaps = missing(authMode, freeTierSecret, clerkSecretKey);
        if (gaps.isEmpty()) {
            return;
        }
        throw new IllegalStateException(
                "REVERIE_AUTH_MODE is 'clerk', so the lifetime free allowance is enforced "
                        + "against a verified Clerk identity -- and " + gaps.size()
                        + (gaps.size() == 1 ? " value it needs is" : " values it needs are")
                        + " missing. Set them and restart, or run REVERIE_AUTH_MODE=dev, "
                        + "which needs neither:"
                        + System.lineSeparator()
                        + "  - " + String.join(System.lineSeparator() + "  - ", gaps));
    }

    /**
     * What clerk mode is missing, or nothing at all.
     *
     * <p>Package-private, static and pure, for the reason the rest of this
     * package's checks are: a check that can only be exercised by starting an
     * application context is a check nobody adds a case to.
     *
     * <p>Neither value is ever included in the returned text. What is
     * actionable is which variable is missing, not what it currently holds —
     * and a refusal at startup ends up in logs, consoles and screenshots,
     * which is not where secrets go.
     *
     * @param authMode       {@code reverie.auth-mode}; anything but clerk means
     *                       no requirement at all, because dev mode resolves an
     *                       identity from the dev subject and never asks Clerk
     * @param hmacSecret     {@code reverie.free-tier.identity-secret}
     * @param clerkSecretKey {@code reverie.clerk.secret-key}
     */
    static List<String> missing(String authMode, String hmacSecret, String clerkSecretKey) {
        if (!"clerk".equalsIgnoreCase(trim(authMode))) {
            /*
             * Dev mode by design, and not an oversight worth warning about.
             * `FreeTierIdentityHasher` uses a fixed published key there and
             * `FreeTierService` derives the identity from the dev subject, so
             * there is no external record to key against and nothing to
             * configure. Dev mode already trusts an X-Dev-User header; a
             * published HMAC key is not what makes it unsuitable for a
             * deployment.
             *
             * A dev-mode *production* deployment is refused by DeploymentCheck,
             * which reports the mode itself -- one clear problem rather than
             * three confusing ones.
             */
            return List.of();
        }

        List<String> gaps = new ArrayList<>();
        if (trim(hmacSecret).isEmpty()) {
            gaps.add("FREE_TIER_IDENTITY_HMAC_SECRET is not set. The lifetime free allowance is "
                    + "keyed to it, so clerk mode cannot tell a returning identity from a new "
                    + "one -- and setting it to a new value later resets every existing "
                    + "account's allowance. Set it once, keep it, and back it up with the "
                    + "database.");
        }
        if (trim(clerkSecretKey).isEmpty()) {
            /*
             * Not about signing in -- tokens verify against the JWKS without it
             * -- but about the allowance having a durable identity. Without the
             * key the only source of a verified email is an optional JWT claim,
             * and Clerk's default template does not send one. Two things then
             * break: provisioning grants no allowance at all, and the forced
             * refresh that account deletion depends on has nothing to ask.
             */
            gaps.add("CLERK_SECRET_KEY is not set. The lifetime free allowance needs a "
                    + "verified email from Clerk's Backend API when the session token has no "
                    + "email claim; without it, accounts get no free allowance at all -- and "
                    + "the anti-reset guarantee would depend on a JWT template.");
        }
        return gaps;
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }
}
