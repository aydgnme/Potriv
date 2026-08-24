package me.aydgn.potriv.common.ratelimit;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import me.aydgn.potriv.common.ratelimit.RateLimitProperties.Window;
import me.aydgn.potriv.identity.support.EmailAddresses;

/**
 * The quotas the independent security review asked for, one method per
 * protected endpoint.
 *
 * Every method here either returns normally — the request may proceed — or
 * throws {@link RateLimitExceededException} with the wait the caller should
 * report. Nothing about *why* a request was rejected crosses that boundary:
 * a caller cannot distinguish "this organization is over its daily quota"
 * from "this recipient was just invited a moment ago" from the exception
 * alone, which matters most for {@link #checkPasswordReset}, where telling
 * the two apart would be a second way to learn whether an address has an
 * account, on top of the one {@code PasswordResetService} already closes.
 */
@Service
public class RateLimitService {

    private static final Logger log = LoggerFactory.getLogger(RateLimitService.class);

    private final RateLimitStore store;
    private final RateLimitKeys keys;
    private final RateLimitProperties properties;
    private final Clock clock;

    /**
     * {@code clock} is the same injectable {@link Clock} bean
     * ({@code ClockConfig}, {@code Clock.systemUTC()} in every real profile)
     * several other services in this codebase already take instead of calling
     * {@code Instant.now()} directly — {@code TeamFinderService} is one. Here
     * it exists for the same reason it does there: a test can supply a
     * deterministic {@code Clock} and pin exactly which fixed window a burst
     * of requests falls into, without sleeping for a real window to elapse
     * and without touching how {@link RateLimitStore} talks to PostgreSQL —
     * the atomic {@code INSERT ... ON CONFLICT} statements stay exactly as
     * real. See {@code RateLimitIntegrationTest}.
     */
    public RateLimitService(
        RateLimitStore store, RateLimitKeys keys, RateLimitProperties properties, Clock clock
    ) {
        this.store = store;
        this.keys = keys;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * An employee invite: bounded per organization (both a short burst window
     * and a daily cap), per issuing administrator, and by a resend cooldown on
     * the invited address so the same inbox cannot be re-mailed faster than
     * that cooldown, however many administrators or requests try.
     */
    public void checkInvite(UUID organizationId, UUID actorUserId, String invitedEmail) {
        Window limits = properties.invite();
        Instant now = Instant.now(clock);

        guarded(() -> {
            String normalizedEmail = EmailAddresses.normalize(invitedEmail);
            checkCooldown("invite:recipient", normalizedEmail, limits.recipientCooldown(), now);
            checkWindow("invite:actor", actorUserId.toString(),
                limits.actorWindow(), limits.actorLimit(), now);
            checkWindow("invite:org:short", organizationId.toString(),
                limits.shortWindow(), limits.shortLimit(), now);
            checkWindow("invite:org:daily", organizationId.toString(),
                limits.dailyWindow(), limits.dailyLimit(), now);
        });
    }

    /**
     * Workspace creation ({@code POST /auth/register-admin}): bounded by the
     * requesting IP and by the identity being registered, so a burst of
     * accounts cannot be created either from one source or for one address
     * faster than these windows allow.
     */
    public void checkRegisterAdmin(String clientIp, String email) {
        Window limits = properties.register();
        Instant now = Instant.now(clock);

        guarded(() -> {
            checkWindow("register:ip", clientIp, limits.ipWindow(), limits.ipLimit(), now);
            checkWindow("register:identity", EmailAddresses.normalize(email),
                limits.identityWindow(), limits.identityLimit(), now);
        });
    }

    /**
     * Password reset requests: bounded by IP and by the target address, and
     * enforced identically whether or not that address has an account.
     *
     * {@code PasswordResetService} already answers 202 for both cases so that
     * an unauthenticated caller cannot use the endpoint to test account
     * existence; this method runs before that decision and on the same two
     * keys regardless of it, so the *rate* of 202s and 429s carries no more
     * signal than the 202 itself already does.
     */
    public void checkPasswordReset(String clientIp, String email) {
        Window limits = properties.passwordReset();
        Instant now = Instant.now(clock);

        guarded(() -> {
            checkWindow("password-reset:ip", clientIp, limits.ipWindow(), limits.ipLimit(), now);
            checkWindow("password-reset:identity", EmailAddresses.normalize(email),
                limits.identityWindow(), limits.identityLimit(), now);
        });
    }

    /**
     * Login attempts: bounded by IP only, deliberately never by the target
     * account alone.
     *
     * The account itself already has a lockout —
     * {@code AuthProperties#maxFailedLoginAttempts}, applied per account after
     * repeated wrong passwords. A rate limit keyed on the account, layered on
     * top of that, would let anyone who merely knows an address lock a real
     * user out of even attempting to sign in, by deliberately tripping the
     * limiter with requests that need not even guess the password — turning a
     * defence into a denial-of-service tool against the very people it
     * protects. An IP-scoped limit bounds credential-stuffing from one source
     * without adding that second way to lock out a victim.
     */
    public void checkLogin(String clientIp) {
        Window limits = properties.login();
        Instant now = Instant.now(clock);

        guarded(() -> checkWindow("login:ip", clientIp, limits.ipWindow(), limits.ipLimit(), now));
    }

    // ---- primitives ----

    private void checkWindow(String dimension, String identity, Duration window, int limit, Instant now) {
        if (!properties.enabled() || window.isZero() || limit <= 0) {
            return;
        }
        String bucketKey = keys.hmac(dimension, identity);
        int hits = store.incrementWindow(bucketKey, now, window);
        if (hits > limit) {
            throw new RateLimitExceededException(store.remainingWindow(now, window));
        }
    }

    private void checkCooldown(String dimension, String identity, Duration cooldown, Instant now) {
        if (!properties.enabled() || cooldown.isZero()) {
            return;
        }
        String bucketKey = keys.hmac(dimension, identity);
        if (!store.tryAcquireCooldown(bucketKey, now, cooldown)) {
            throw new RateLimitExceededException(store.remainingCooldown(bucketKey, now, cooldown));
        }
    }

    /**
     * The fail-open/fail-closed switch, in one place, so every check above
     * gets it applied the same way.
     *
     * A {@link RateLimitExceededException} is a decision, not a failure, and
     * passes straight through. What is caught is the store itself breaking —
     * {@link DataAccessException} and the runtime exceptions Spring's JDBC
     * layer throws around it — which {@link RateLimitProperties#failOpen()}
     * turns into "allow the request" if an operator has explicitly chosen
     * availability over enforcement, and into "deny the request," the default,
     * otherwise.
     */
    private void guarded(Runnable check) {
        try {
            check.run();
        } catch (RateLimitExceededException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            log.warn("The rate-limit store failed; failing {}.",
                properties.failOpen() ? "open" : "closed", exception);
            if (!properties.failOpen()) {
                throw new RateLimitExceededException(Duration.ofSeconds(30));
            }
        }
    }
}
