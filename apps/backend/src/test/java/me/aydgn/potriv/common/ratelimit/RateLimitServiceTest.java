package me.aydgn.potriv.common.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

/**
 * {@link RateLimitService}'s own logic, isolated from PostgreSQL: a mocked
 * {@link RateLimitStore} stands in for the database, so these tests are fast
 * and exercise exactly one thing each — the fail-open/fail-closed switch, and
 * that a genuine rate-limit decision is never confused with the store
 * breaking. {@code RateLimitIntegrationTest} covers the same service wired to
 * real PostgreSQL, for the parts that only mean something there — concurrent
 * writers, actual window boundaries, the wire-level 429.
 */
class RateLimitServiceTest {

    private static final RateLimitProperties.Window PERMISSIVE = new RateLimitProperties.Window(
        Duration.ofSeconds(60), 100,
        Duration.ofDays(1), 1000,
        Duration.ofSeconds(60), 100,
        Duration.ofSeconds(60), 100,
        Duration.ofSeconds(60), 100,
        Duration.ofSeconds(1));

    private static RateLimitProperties properties(boolean failOpen) {
        return new RateLimitProperties(
            true, failOpen, "unit-test-only-hmac-secret", List.of(),
            PERMISSIVE, PERMISSIVE, PERMISSIVE, PERMISSIVE);
    }

    private static RateLimitService serviceWithBrokenStore(boolean failOpen) {
        RateLimitStore store = mock(RateLimitStore.class);
        when(store.incrementWindow(anyString(), any(), any()))
            .thenThrow(new DataAccessResourceFailureException("simulated store outage"));

        RateLimitProperties properties = properties(failOpen);
        return new RateLimitService(store, new RateLimitKeys(properties), properties, Clock.systemUTC());
    }

    @Test
    void failsClosedByDefaultWhenTheStoreBreaks() {
        RateLimitService service = serviceWithBrokenStore(false);

        assertThatThrownBy(() -> service.checkLogin("203.0.113.10"))
            .isInstanceOf(RateLimitExceededException.class);
    }

    @Test
    void failsOpenOnlyWhenExplicitlyConfiguredTo() {
        RateLimitService service = serviceWithBrokenStore(true);

        assertThatCode(() -> service.checkLogin("203.0.113.10")).doesNotThrowAnyException();
    }

    @Test
    void aRealRateLimitDecisionIsNeverReinterpretedByTheOutageSwitch() {
        // Not a store failure: the store answers normally, and the *limit*
        // itself is what rejects the request. This must propagate as-is
        // whichever way failOpen is set — the switch is for the store
        // breaking, not for quotas being exceeded.
        RateLimitStore store = mock(RateLimitStore.class);
        when(store.incrementWindow(anyString(), any(), any())).thenReturn(999);
        when(store.remainingWindow(any(), any())).thenReturn(Duration.ofSeconds(7));

        for (boolean failOpen : List.of(true, false)) {
            RateLimitProperties properties = properties(failOpen);
            RateLimitService service =
                new RateLimitService(store, new RateLimitKeys(properties), properties, Clock.systemUTC());

            assertThatThrownBy(() -> service.checkLogin("203.0.113.10"))
                .isInstanceOf(RateLimitExceededException.class)
                .satisfies(exception ->
                    assertThat(((RateLimitExceededException) exception).retryAfterSeconds())
                        .isEqualTo(7));
        }
    }

    @Test
    void disabledMeansEveryCheckIsANoOpEvenWithNoStoreAvailable() {
        RateLimitStore store = mock(RateLimitStore.class);
        when(store.incrementWindow(anyString(), any(), any()))
            .thenThrow(new AssertionError("must not be called while disabled"));

        RateLimitProperties disabled = new RateLimitProperties(
            false, false, "", List.of(), PERMISSIVE, PERMISSIVE, PERMISSIVE, PERMISSIVE);
        // RateLimitKeys must not need real key material while disabled.
        RateLimitService service =
            new RateLimitService(store, new RateLimitKeys(disabled), disabled, Clock.systemUTC());

        assertThatCode(() -> {
            service.checkLogin("203.0.113.10");
            service.checkInvite(UUID.randomUUID(), UUID.randomUUID(), "a@example.com");
            service.checkRegisterAdmin("203.0.113.10", "a@example.com");
            service.checkPasswordReset("203.0.113.10", "a@example.com");
        }).doesNotThrowAnyException();
    }
}
