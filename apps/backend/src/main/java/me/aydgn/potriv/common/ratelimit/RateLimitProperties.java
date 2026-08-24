package me.aydgn.potriv.common.ratelimit;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Every quota this application enforces, and nothing hard-coded.
 *
 * The independent security review that asked for this named specific limits
 * — per organization, per actor, per recipient, per IP — and none of them has
 * one obviously correct value: it depends on how large a real customer's
 * onboarding burst looks, and that is exactly the kind of number an operator
 * needs to be able to change without a redeploy. Defaults here are
 * deliberately generous rather than tight, because a limiter that is too
 * strict fails the way a bug does — legitimate users see fantasy contention —
 * while one that is briefly too loose fails the way abuse does, which
 * monitoring can catch and configuration can then tighten.
 */
@ConfigurationProperties(prefix = "app.rate-limit")
public record RateLimitProperties(
    /** The kill switch. Off disables every check below; nothing else does. */
    boolean enabled,

    /**
     * What happens when the store itself fails — a query throws instead of
     * answering allowed or denied.
     *
     * {@code false} (fail-closed, the default) treats a broken limiter as "deny
     * this request": the safe choice for a security gate, because the
     * alternative is a store outage silently turning every quota off at once,
     * on every instance, for as long as the outage lasts — which is a
     * significantly worse failure than a burst of 503s on the endpoints this
     * protects. {@code true} (fail-open) is available for an operator who has
     * decided availability matters more than the quota for their deployment,
     * and must be an explicit, reasoned choice, not a default.
     */
    boolean failOpen,

    /**
     * The key that turns an address into an opaque bucket identifier.
     *
     * Never the raw address: it must not appear in {@code rate_limit_windows}
     * or {@code rate_limit_cooldowns}, in a log line built from a bucket key,
     * or in any error this component raises. HMAC rather than a plain hash
     * because a plain hash of a bounded address space (email addresses,
     * mostly) is invertible by dictionary — the secret is what makes the
     * mapping one-way in practice, not merely in name.
     *
     * Required whenever {@link #enabled} is true; there is no default,
     * because a default committed to source control is not a secret.
     */
    String hmacSecret,

    /**
     * Reverse proxies whose {@code X-Forwarded-For} this application trusts.
     *
     * Empty by default, which means: trust nothing, use the connecting peer's
     * own address. A forwarded header is a value the *client* can set on a
     * direct connection, so honouring it without knowing the request actually
     * passed through one of these proxies would let anyone claim any IP and
     * walk straight through every IP-scoped quota below. CIDR notation
     * ({@code 10.0.0.0/8}) or a bare address; see {@link ClientIpResolver}.
     */
    List<String> trustedProxies,

    Window invite,
    Window register,
    Window passwordReset,
    Window login
) {

    public RateLimitProperties {
        if (invite == null) invite = Window.EMPTY;
        if (register == null) register = Window.EMPTY;
        if (passwordReset == null) passwordReset = Window.EMPTY;
        if (login == null) login = Window.EMPTY;

        if (enabled && (hmacSecret == null || hmacSecret.isBlank())) {
            throw new IllegalStateException(
                "app.rate-limit.hmac-secret must be set whenever app.rate-limit.enabled "
                    + "is true: it is what keeps a recipient's or an applicant's address "
                    + "out of the rate-limit store."
            );
        }
    }

    /**
     * One endpoint's full set of quotas.
     *
     * Not every endpoint uses every field — {@code login} has no daily or
     * recipient dimension, {@code invite} has no plain identity dimension —
     * unused fields are simply left at {@link Window#EMPTY}'s zero durations,
     * which {@link RateLimitService} treats as "this dimension is not
     * checked," not as "the limit is zero."
     */
    public record Window(
        Duration shortWindow, int shortLimit,
        Duration dailyWindow, int dailyLimit,
        Duration actorWindow, int actorLimit,
        Duration identityWindow, int identityLimit,
        Duration ipWindow, int ipLimit,
        Duration recipientCooldown
    ) {
        static final Window EMPTY = new Window(
            Duration.ZERO, 0, Duration.ZERO, 0, Duration.ZERO, 0,
            Duration.ZERO, 0, Duration.ZERO, 0, Duration.ZERO);
    }
}
