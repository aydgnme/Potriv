package me.aydgn.potriv.common.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;

class RateLimitKeysTest {

    private static final RateLimitProperties.Window UNUSED = new RateLimitProperties.Window(
        Duration.ZERO, 0, Duration.ZERO, 0, Duration.ZERO, 0, Duration.ZERO, 0, Duration.ZERO, 0,
        Duration.ZERO);

    private RateLimitKeys keysWithSecret(String secret) {
        RateLimitProperties properties = new RateLimitProperties(
            true, false, secret, List.of(), UNUSED, UNUSED, UNUSED, UNUSED);
        return new RateLimitKeys(properties);
    }

    @Test
    void neverLeaksTheRawValueIntoTheKey() {
        RateLimitKeys keys = keysWithSecret("secret-one");
        String key = keys.hmac("invite:recipient", "victim@example.com");

        assertThat(key).doesNotContain("victim");
        assertThat(key).doesNotContain("example.com");
    }

    @Test
    void isDeterministicForTheSamePrefixAndValue() {
        RateLimitKeys keys = keysWithSecret("secret-one");

        assertThat(keys.hmac("login:ip", "203.0.113.10"))
            .isEqualTo(keys.hmac("login:ip", "203.0.113.10"));
    }

    @Test
    void differentPrefixesProduceUnrelatedKeysForTheSameValue() {
        // The same address, keyed for two different quotas, must not collide —
        // a login-rate row must never be readable as evidence about a
        // password-reset row for the same value.
        RateLimitKeys keys = keysWithSecret("secret-one");

        assertThat(keys.hmac("login:ip", "same-value"))
            .isNotEqualTo(keys.hmac("password-reset:ip", "same-value"));
    }

    @Test
    void differentSecretsProduceDifferentKeysForTheSameInput() {
        String withSecretOne = keysWithSecret("secret-one").hmac("login:ip", "203.0.113.10");
        String withSecretTwo = keysWithSecret("secret-two").hmac("login:ip", "203.0.113.10");

        assertThat(withSecretOne).isNotEqualTo(withSecretTwo);
    }
}
