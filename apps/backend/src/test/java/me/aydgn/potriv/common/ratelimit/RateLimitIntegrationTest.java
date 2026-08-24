package me.aydgn.potriv.common.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;

/**
 * BLOCKER-002: every quota named in the independent security review, proven
 * against real PostgreSQL and the real HTTP contract.
 *
 * Rate limiting is off in {@code application-test.yml} by default — the
 * hundreds of other integration tests in this module call login, invite and
 * registration endpoints in loops, and would trip a real limit on the first
 * few iterations. This class alone turns it back on via
 * {@link TestPropertySource}, which builds it its own, isolated Spring
 * context.
 *
 * <h2>Determinism: a controlled {@link Clock}, not a sleep</h2>
 *
 * {@link RateLimitService} takes an injected {@link Clock} — the same pattern
 * {@code TeamFinderService} and others in this codebase already use instead
 * of calling {@code Instant.now()} directly. {@link RateLimitClockTestConfig}
 * below replaces the production {@code Clock.systemUTC()} bean with
 * {@link MutableClock}, which this class pins to one fixed, window-aligned
 * instant before every test. Every request in a test's burst is then
 * evaluated against the *exact same* instant — not "close enough in wall-clock
 * time" — so which fixed window each request falls into is a property of the
 * test's own code, not of how fast the JVM happened to execute that
 * particular run. There is no {@code Thread.sleep}, no polling, and no window
 * a slow CI runner could cause a burst to straddle.
 *
 * What stays completely real: every quota decision is still a genuine
 * PostgreSQL statement through {@link RateLimitStore} — an
 * {@code INSERT ... ON CONFLICT ... RETURNING} that runs, and is atomic,
 * exactly as it does in production. Only the answer to "what time is it" is
 * substituted; how the database enforces atomicity under that time is not
 * touched at all, which is what the concurrency tests below depend on.
 *
 * IP-scoped tests each use a distinct synthetic remote address, the same way
 * every other test in this module uses {@code uniqueEmail()} for isolation —
 * this is what keeps two test methods from sharing a bucket, not the clock.
 */
@TestPropertySource(properties = "app.rate-limit.enabled=true")
class RateLimitIntegrationTest extends AbstractMockMvcIntegrationTest {

    private static final String PASSWORD = "Password123!";
    private static final String INVITES = "/organizations/current/invites";

    /**
     * Midnight UTC, 2024-01-01 — epoch second 1704067200, divisible by both
     * 10 and 30, the two window sizes {@code application-test.yml} configures
     * for this profile. Pinning here means every window this suite checks
     * starts with the full window still ahead of it: {@code elapsedInWindow}
     * in {@code RateLimitStore#remainingWindow} is always exactly zero, so a
     * blocked request's reported {@code Retry-After} is always exactly the
     * configured window length — an assertable, exact number, not a range.
     */
    private static final Instant WINDOW_ALIGNED_INSTANT = Instant.parse("2024-01-01T00:00:00Z");

    @TestConfiguration
    static class RateLimitClockTestConfig {
        @Bean
        @Primary
        MutableClock rateLimitTestClock() {
            return MutableClock.startingAt(WINDOW_ALIGNED_INSTANT);
        }
    }

    @Autowired
    private RateLimitService rateLimitService;

    @Autowired
    private MutableClock testClock;

    @BeforeEach
    void pinClockToAFreshWindow() {
        // Every test starts from the same known instant. Different tests
        // never collide over it because their rate-limit keys — fresh
        // UUIDs, uniqueEmail()s, distinct synthetic IPs — differ, not
        // because of timing.
        testClock.set(WINDOW_ALIGNED_INSTANT);
    }

    private static RequestPostProcessor fromIp(String ip) {
        return request -> {
            request.setRemoteAddr(ip);
            return request;
        };
    }

    /*
      register-admin and login are themselves IP-rate-limited, and MockMvc's
      default remote address is a fixed "127.0.0.1" for every request that
      does not set one explicitly — which every other integration test in
      this module relies on, since rate limiting is off for them. Here it is
      on, so every test method's *setup* (creating and signing in as an
      administrator) needs its own IP, distinct from both the shared default
      and from whatever IP a given test is deliberately probing — otherwise
      the third test method to run would find register-admin's quota already
      spent by the first two.
    */
    private static final AtomicInteger SETUP_IP_COUNTER = new AtomicInteger(0);

    private static String freshSetupIp() {
        int n = SETUP_IP_COUNTER.incrementAndGet();
        return "10.255." + (n / 250 % 250) + "." + (n % 250 + 1);
    }

    /** Registers an administrator and signs them in, both on a fresh synthetic IP. */
    private String setupAdminAndLogin(String orgNamePrefix, String email) throws Exception {
        setupAdmin(orgNamePrefix, email);
        String loginBody = mockMvc.perform(post("/auth/login")
                .with(fromIp(freshSetupIp()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("email", email, "password", PASSWORD))))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(loginBody).get("accessToken").asText();
    }

    /**
     * Registers and confirms an administrator on a fresh synthetic IP; does
     * not sign in.
     *
     * Registration is request-then-confirm now (see {@code
     * AuthRegistrationService}), so this drives the same three steps {@code
     * AbstractMockMvcIntegrationTest#registerAdmin} does rather than calling
     * it directly: that helper's own rate-limit exposure is on the shared
     * default IP, which would collide with the very quotas this test class
     * exists to probe.
     */
    private void setupAdmin(String orgNamePrefix, String email) throws Exception {
        registerAdminRaw(uniqueName(orgNamePrefix), email, freshSetupIp())
            .andExpect(status().isAccepted());

        registrationVerificationDeliveryWorker.runOnce();
        String token = inviteTokenFromMailTo(email);

        mockMvc.perform(post("/auth/register-admin/verify")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("token", token))))
            .andExpect(status().isCreated());

        recordingMailSender.clear();
    }

    // ---- invite: burst on one org/actor ----

    @Test
    void burstInvitesFromOneAdministratorHitTheLimitWithARetryAfter() throws Exception {
        String adminEmail = uniqueEmail("burstadmin");
        String adminToken = setupAdminAndLogin("BurstOrg", adminEmail);

        // application-test.yml: invite.actor-limit = 2 in a 10s window. The
        // clock is pinned (see @BeforeEach), so all three requests below are
        // evaluated at the identical instant — deterministically one window.
        for (int i = 0; i < 2; i++) {
            inviteRaw(adminToken, uniqueEmail("burst-ok-" + i))
                .andExpect(status().isAccepted());
        }

        inviteRaw(adminToken, uniqueEmail("burst-blocked"))
            .andExpect(status().isTooManyRequests())
            .andExpect(header().string(HttpHeaders.RETRY_AFTER, "10"))
            .andExpect(jsonPath("$.code").value("RATE_LIMITED"));
    }

    @Test
    void retryAfterIsExactlyTheConfiguredWindowLength() throws Exception {
        String adminEmail = uniqueEmail("retryafteradmin");
        String adminToken = setupAdminAndLogin("RetryAfterOrg", adminEmail);

        for (int i = 0; i < 2; i++) {
            inviteRaw(adminToken, uniqueEmail("retryafter-ok-" + i))
                .andExpect(status().isAccepted());
        }

        String retryAfter = inviteRaw(adminToken, uniqueEmail("retryafter-blocked"))
            .andExpect(status().isTooManyRequests())
            .andReturn().getResponse().getHeader(HttpHeaders.RETRY_AFTER);

        // Exact, not a range: the clock is pinned exactly on a window
        // boundary (see WINDOW_ALIGNED_INSTANT), so RateLimitStore reports
        // the full 10s window remaining — deterministically, every run.
        assertThat(retryAfter).isEqualTo("10");
    }

    @Test
    void resendingToTheSameRecipientTooSoonIsCooldownBlocked() throws Exception {
        String adminEmail = uniqueEmail("cooldownadmin");
        String adminToken = setupAdminAndLogin("CooldownOrg", adminEmail);
        String recipient = uniqueEmail("cooldown-target");

        inviteRaw(adminToken, recipient).andExpect(status().isAccepted());

        // Immediately again, at the identical pinned instant: the cooldown
        // (10s) cannot have elapsed. Checked before the actor window, so this
        // fails for its own reason — not because the actor's 2-invite budget
        // was already spent.
        inviteRaw(adminToken, recipient)
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.code").value("RATE_LIMITED"));
    }

    @Test
    void anotherOrganizationsQuotaIsUnaffectedByTheFirstsBurst() throws Exception {
        String firstAdminEmail = uniqueEmail("tenantaadmin");
        String firstAdminToken = setupAdminAndLogin("TenantA", firstAdminEmail);

        for (int i = 0; i < 2; i++) {
            inviteRaw(firstAdminToken, uniqueEmail("tenanta-ok-" + i))
                .andExpect(status().isAccepted());
        }
        inviteRaw(firstAdminToken, uniqueEmail("tenanta-blocked"))
            .andExpect(status().isTooManyRequests());

        // A second, unrelated organization's administrator is not affected —
        // proving isolation is by organization/actor identity, not global —
        // at the identical pinned instant as the first organization's burst.
        String secondAdminEmail = uniqueEmail("tenantbadmin");
        String secondAdminToken = setupAdminAndLogin("TenantB", secondAdminEmail);

        inviteRaw(secondAdminToken, uniqueEmail("tenantb-ok"))
            .andExpect(status().isAccepted());
    }

    // ---- login: IP-scoped, never account-scoped ----

    @Test
    void loginAttemptsFromOneIpHitTheLimit() throws Exception {
        String email = uniqueEmail("loginlimit");
        setupAdmin("LoginLimitOrg", email);
        String ip = "198.51.100.21";

        // application-test.yml: login.ip-limit = 3 in a 10s window. Wrong
        // password every time: the rate limit is checked before credentials
        // are, so this trips on request count alone.
        for (int i = 0; i < 3; i++) {
            mockMvc.perform(post("/auth/login")
                    .with(fromIp(ip))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(
                        Map.of("email", email, "password", "WrongPassword1!"))))
                .andExpect(status().isBadRequest());
        }

        mockMvc.perform(post("/auth/login")
                .with(fromIp(ip))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("email", email, "password", "WrongPassword1!"))))
            .andExpect(status().isTooManyRequests())
            .andExpect(header().string(HttpHeaders.RETRY_AFTER, "10"));
    }

    @Test
    void loginFromADifferentIpIsUnaffectedByAnotherIpsLimit() throws Exception {
        String email = uniqueEmail("loginisolated");
        setupAdmin("LoginIsolatedOrg", email);

        String exhaustedIp = "198.51.100.30";
        for (int i = 0; i < 3; i++) {
            mockMvc.perform(post("/auth/login")
                    .with(fromIp(exhaustedIp))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(
                        Map.of("email", email, "password", "WrongPassword1!"))))
                .andExpect(status().isBadRequest());
        }
        mockMvc.perform(post("/auth/login")
                .with(fromIp(exhaustedIp))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("email", email, "password", "WrongPassword1!"))))
            .andExpect(status().isTooManyRequests());

        // The real password, from a different IP, still works: exhausting one
        // source's quota must not be a way to lock a victim's account out of
        // logins from anywhere else — see RateLimitService#checkLogin.
        mockMvc.perform(post("/auth/login")
                .with(fromIp("198.51.100.31"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("email", email, "password", PASSWORD))))
            .andExpect(status().isOk());
    }

    // ---- password reset: enumeration-safe ----

    @Test
    void registeredAndUnknownRecipientsGetIdenticalRateLimitTreatment() throws Exception {
        String registeredEmail = uniqueEmail("hasaccount");
        setupAdmin("HasAccountOrg", registeredEmail);
        String unknownEmail = uniqueEmail("noaccount");
        String ip = "198.51.100.40";

        // application-test.yml: password-reset.identity-limit = 2 in 30s,
        // ip-limit = 2 in 10s. Two IPs, so only the identity dimension is
        // exercised here — see the IP-scoped test below for that dimension.
        for (int attempt = 0; attempt < 2; attempt++) {
            passwordResetRaw(registeredEmail, ip + "-a" + attempt)
                .andExpect(status().isAccepted());
            passwordResetRaw(unknownEmail, ip + "-b" + attempt)
                .andExpect(status().isAccepted());
        }

        // The third request for each identity is rejected — same status, same
        // code, same body shape, whether or not the address has an account.
        String registeredBody = passwordResetRaw(registeredEmail, ip + "-a2")
            .andExpect(status().isTooManyRequests())
            .andReturn().getResponse().getContentAsString();
        String unknownBody = passwordResetRaw(unknownEmail, ip + "-b2")
            .andExpect(status().isTooManyRequests())
            .andReturn().getResponse().getContentAsString();

        JsonNode registeredJson = objectMapper.readTree(registeredBody);
        JsonNode unknownJson = objectMapper.readTree(unknownBody);
        assertThat(registeredJson.get("status").asInt()).isEqualTo(unknownJson.get("status").asInt());
        assertThat(registeredJson.get("code").asText()).isEqualTo(unknownJson.get("code").asText());
        assertThat(registeredJson.get("message").asText()).isEqualTo(unknownJson.get("message").asText());
    }

    @Test
    void passwordResetIpLimitAppliesIdenticallyToKnownAndUnknownAddresses() throws Exception {
        String registeredEmail = uniqueEmail("ipknown");
        setupAdmin("IpKnownOrg", registeredEmail);
        String ip = "198.51.100.50";

        // application-test.yml: password-reset.ip-limit = 2 in 10s.
        passwordResetRaw(registeredEmail, ip).andExpect(status().isAccepted());
        passwordResetRaw(uniqueEmail("ipunknown-1"), ip).andExpect(status().isAccepted());

        // A third request from the same IP, for a brand new unknown address,
        // is still blocked — the IP quota does not care whether any of the
        // addresses behind it exist.
        passwordResetRaw(uniqueEmail("ipunknown-2"), ip)
            .andExpect(status().isTooManyRequests());
    }

    // ---- register-admin: IP and identity ----

    @Test
    void workspaceCreationBurstsFromOneIpHitTheLimit() throws Exception {
        String ip = "198.51.100.60";

        for (int i = 0; i < 2; i++) {
            registerAdminRaw(uniqueName("WorkspaceOrg"), uniqueEmail("workspace-ok-" + i), ip)
                .andExpect(status().isAccepted());
        }

        registerAdminRaw(uniqueName("WorkspaceOrg"), uniqueEmail("workspace-blocked"), ip)
            .andExpect(status().isTooManyRequests())
            .andExpect(header().string(HttpHeaders.RETRY_AFTER, "10"));
    }

    // ---- concurrency: the shared, atomic part of the design ----

    /**
     * Simulates several application instances claiming quota for the same
     * organization at once.
     *
     * There is no second JVM here, and there does not need to be one: the
     * property under test is that PostgreSQL — not any one process, and not
     * the pinned clock — decides who is within quota, so N threads racing the
     * same {@link RateLimitService} bean, all reading the identical pinned
     * instant, prove exactly the same atomicity that N separate instances
     * sharing the same database would. Pinning the clock removes timing as a
     * variable entirely, which makes this test *more* rigorous than one
     * racing real wall-clock time would be — every contender competes for
     * literally the same window, guaranteed, not just probably. {@code
     * InviteDeliveryResilienceIntegrationTest}'s
     * {@code concurrentClaimsAtTheRepositoryLevelHaveExactlyOneWinner} makes
     * the identical argument for the delivery worker's claim query.
     */
    @Test
    void concurrentInviteAttemptsForOneOrganizationCannotExceedItsQuota() throws Exception {
        UUID organizationId = UUID.randomUUID();
        int contenders = 20;

        ExecutorService pool = Executors.newFixedThreadPool(contenders);
        CyclicBarrier startTogether = new CyclicBarrier(contenders);
        List<Callable<Boolean>> attempts = new ArrayList<>();
        for (int i = 0; i < contenders; i++) {
            UUID actorId = UUID.randomUUID();
            String recipient = "concurrent-" + i + "-" + UUID.randomUUID() + "@example.com";
            attempts.add(() -> {
                startTogether.await(10, TimeUnit.SECONDS);
                try {
                    rateLimitService.checkInvite(organizationId, actorId, recipient);
                    return true;
                } catch (RateLimitExceededException exception) {
                    return false;
                }
            });
        }

        int allowed = 0;
        List<Future<Boolean>> outcomes;
        try {
            outcomes = pool.invokeAll(attempts, 30, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
        for (Future<Boolean> outcome : outcomes) {
            if (outcome.get()) allowed++;
        }

        // application-test.yml: invite.short-limit = 3 in a 10s window — every
        // attempt here uses a distinct actor, so the org-short dimension is
        // the only one that can be limiting.
        assertThat(allowed)
            .as("PostgreSQL, not any one thread, decides how many of a burst succeed")
            .isEqualTo(3);
    }

    /** The same property stated as a plain "requests cannot exceed quota" bound. */
    @Test
    void parallelRequestsNeverExceedTheConfiguredLimit() throws Exception {
        String clientIp = "198.51.100.70";
        int contenders = 15;

        ExecutorService pool = Executors.newFixedThreadPool(contenders);
        CyclicBarrier startTogether = new CyclicBarrier(contenders);
        AtomicInteger allowed = new AtomicInteger(0);
        List<Future<?>> futures = new ArrayList<>();
        try {
            for (int i = 0; i < contenders; i++) {
                futures.add(pool.submit(() -> {
                    try {
                        startTogether.await(10, TimeUnit.SECONDS);
                        rateLimitService.checkLogin(clientIp);
                        allowed.incrementAndGet();
                    } catch (RateLimitExceededException expected) {
                        // Not counted.
                    } catch (Exception unexpected) {
                        throw new RuntimeException(unexpected);
                    }
                }));
            }
            for (Future<?> future : futures) {
                future.get(30, TimeUnit.SECONDS);
            }
        } finally {
            pool.shutdownNow();
        }

        // application-test.yml: login.ip-limit = 3.
        assertThat(allowed.get()).isEqualTo(3);
    }

    // ---- helpers ----

    private org.springframework.test.web.servlet.ResultActions inviteRaw(
        String adminToken, String email
    ) throws Exception {
        return mockMvc.perform(post(INVITES)
            .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("email", email))));
    }

    private org.springframework.test.web.servlet.ResultActions passwordResetRaw(
        String email, String ip
    ) throws Exception {
        return mockMvc.perform(post("/auth/password-reset/request")
            .with(fromIp(ip))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("email", email))));
    }

    private org.springframework.test.web.servlet.ResultActions registerAdminRaw(
        String organizationName, String email, String ip
    ) throws Exception {
        MockHttpServletRequestBuilder request = post("/auth/register-admin")
            .with(fromIp(ip))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of(
                "name", "Admin of " + email,
                "email", email,
                "password", PASSWORD,
                "organizationName", organizationName,
                "headquarterAddress", "Test Address 1"
            )));
        return mockMvc.perform(request);
    }
}
