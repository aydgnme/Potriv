package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.identity.entity.RegistrationVerification;
import me.aydgn.potriv.identity.repository.RegistrationVerificationRepository;
import me.aydgn.potriv.identity.repository.UserRepository;

/**
 * What happens to a workspace registration between the request and a
 * confirmed account — the delivery half, shaped like
 * {@link InviteDeliveryIntegrationTest} and for the same reasons: minting a
 * token and sending mail inside the request would tie the response to
 * however long SMTP takes and leave a live credential for mail nobody
 * received if the send that followed then failed.
 */
class RegistrationVerificationDeliveryIntegrationTest extends AbstractMockMvcIntegrationTest {

    private static final String PASSWORD = "Password123!";

    @Autowired
    private RegistrationVerificationRepository registrationVerificationRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @AfterEach
    void restoreMailServer() {
        recordingMailSender.setFailing(false);
        recordingMailSender.clear();
    }

    /**
     * Runs one guarded repository write in its own committed transaction —
     * exactly the shape {@code RegistrationVerificationDeliveryWorker} itself
     * uses for every step of an attempt. See {@code
     * InviteDeliveryResilienceIntegrationTest#inTx}: the {@code @Modifying}
     * methods on {@link RegistrationVerificationRepository} require an active
     * transaction, and a test simulating "a second worker" is calling them
     * directly, with nothing else supplying one.
     */
    private <T> T inTx(Supplier<T> action) {
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        return template.execute(status -> action.get());
    }

    // ---- concurrency: the claim itself ----

    /**
     * The same property {@code InviteDeliveryResilienceIntegrationTest
     * #concurrentClaimsAtTheRepositoryLevelHaveExactlyOneWinner} proves for
     * invites, for the identical reason: {@code claimDelivery} is the
     * conditional UPDATE every worker attempt depends on to be the only one
     * that can win a given row, and PostgreSQL — not any one thread — is what
     * decides. A {@link CountDownLatch} releases every contender at the same
     * instant rather than sleeping through any window, so this is
     * deterministic: contenders that never overlapped in practice would not
     * prove anything either way.
     */
    @Test
    @DisplayName("of many concurrent delivery-claim attempts on one row, exactly one wins")
    void concurrentClaimsAtTheRepositoryLevelHaveExactlyOneWinner() throws Exception {
        String email = uniqueEmail("founder");
        requestRegistration(email, uniqueName("Org"));
        UUID verificationId = latestFor(email).getId();

        int contenders = 12;
        ExecutorService pool = Executors.newFixedThreadPool(contenders);
        CountDownLatch startTogether = new CountDownLatch(1);
        List<UUID> attemptIds = new ArrayList<>();
        for (int i = 0; i < contenders; i++) {
            attemptIds.add(UUID.randomUUID());
        }

        List<Future<Integer>> claims = new ArrayList<>();
        try {
            for (UUID attemptId : attemptIds) {
                claims.add(pool.submit(() -> {
                    startTogether.await();
                    OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
                    return inTx(() -> registrationVerificationRepository.claimDelivery(
                        verificationId, now, now.plusMinutes(5), attemptId));
                }));
            }
            startTogether.countDown();

            int wins = 0;
            for (Future<Integer> claim : claims) {
                wins += claim.get(30, TimeUnit.SECONDS);
            }
            assertThat(wins).as("exactly one conditional UPDATE may succeed").isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }

        RegistrationVerification claimed = latestFor(email);
        assertThat(claimed.getDeliveryStatus())
            .isEqualTo(RegistrationVerification.DeliveryStatus.DELIVERING);
        assertThat(attemptIds).contains(claimed.getLeaseOwner());
    }

    // ---- the honest answer ----

    @Test
    @DisplayName("the request answers accepted, not created")
    void requestingAnswers202() throws Exception {
        String email = uniqueEmail("founder");
        requestRegistration(email, uniqueName("Org"));
        // No exception thrown by requestRegistration is the assertion: it
        // already expects 202 internally, and the body is checked in
        // RegistrationEnumerationParityIntegrationTest. Drains the row this
        // test created so it cannot be picked up by another test's own
        // runOnce() call — these tests share one Postgres instance with no
        // per-test rollback, exactly like InviteDeliveryIntegrationTest.
        registrationVerificationDeliveryWorker.runOnce();
    }

    @Test
    @DisplayName("nothing redeemable exists until the mail has actually gone")
    void noTokenExistsBeforeDelivery() throws Exception {
        String email = uniqueEmail("founder");
        requestRegistration(email, uniqueName("Org"));

        RegistrationVerification queued = latestFor(email);
        assertThat(queued.getDeliveryStatus())
            .isEqualTo(RegistrationVerification.DeliveryStatus.QUEUED);
        assertThat(queued.isRedeemable()).isFalse();
        assertThat(jdbcTemplate.queryForObject(
            "select count(*) from registration_verifications where id = ? and token_hash is null",
            Integer.class, queued.getId())).isEqualTo(1);

        registrationVerificationDeliveryWorker.runOnce();

        RegistrationVerification sent = latestFor(email);
        assertThat(sent.getDeliveryStatus()).isEqualTo(RegistrationVerification.DeliveryStatus.SENT);
        assertThat(sent.isRedeemable()).isTrue();
    }

    @Test
    @DisplayName("the password is a bcrypt hash from the moment the row exists, never plaintext")
    void passwordIsHashedBeforeItIsEverPersisted() throws Exception {
        String email = uniqueEmail("founder");
        String rawPassword = "Sup3r-Secret-Password!";
        requestRegistration(email, uniqueName("Org"), rawPassword);

        RegistrationVerification queued = latestFor(email);
        assertThat(queued.getPasswordHash()).startsWith("$2");
        assertThat(queued.getPasswordHash()).isNotEqualTo(rawPassword);
        assertThat(queued.getPasswordHash()).doesNotContain(rawPassword);

        // Drains the row; see requestingAnswers202's note on shared-table
        // isolation between these tests.
        registrationVerificationDeliveryWorker.runOnce();
    }

    // ---- confirming creates the account ----

    @Test
    @DisplayName("confirming mints the organization and the admin account, not before")
    void confirmingCreatesTheAccount() throws Exception {
        String email = uniqueEmail("founder");
        String orgName = uniqueName("Org");
        requestRegistration(email, orgName);
        registrationVerificationDeliveryWorker.runOnce();

        assertThat(userRepository.findByEmail(email)).isEmpty();

        String token = inviteTokenFromMailTo(email);
        JsonNode confirmed = confirm(token);

        assertThat(confirmed.has("organizationId")).isTrue();
        assertThat(confirmed.has("userId")).isTrue();
        assertThat(userRepository.findByEmail(email)).isPresent();
    }

    // ---- token-state parity: every dead token looks the same ----

    @Test
    @DisplayName("an unknown token is rejected with the generic code")
    void unknownTokenIsRejected() throws Exception {
        assertConfirmIsRejected("not-a-real-token-" + UUID.randomUUID());
    }

    @Test
    @DisplayName("an expired token is rejected with the identical generic code")
    void expiredTokenIsRejected() throws Exception {
        String email = uniqueEmail("founder");
        requestRegistration(email, uniqueName("Org"));
        registrationVerificationDeliveryWorker.runOnce();
        String token = inviteTokenFromMailTo(email);

        jdbcTemplate.update(
            "update registration_verifications set expires_at = ? where id = ?",
            OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(1), latestFor(email).getId());

        assertConfirmIsRejected(token);
    }

    @Test
    @DisplayName("an already-used token is rejected with the identical generic code")
    void alreadyUsedTokenIsRejected() throws Exception {
        String email = uniqueEmail("founder");
        requestRegistration(email, uniqueName("Org"));
        registrationVerificationDeliveryWorker.runOnce();
        String token = inviteTokenFromMailTo(email);

        confirm(token);

        assertConfirmIsRejected(token);
    }

    private void assertConfirmIsRejected(String token) throws Exception {
        String body = mockMvc.perform(post("/auth/register-admin/verify")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("token", token))))
            .andExpect(status().isBadRequest())
            .andReturn().getResponse().getContentAsString();

        JsonNode error = objectMapper.readTree(body);
        assertThat(error.get("code").asText()).isEqualTo("REGISTER_TOKEN_INVALID");
        assertThat(body.toLowerCase(java.util.Locale.ROOT))
            .doesNotContain("already", "exists", "expired", "used");
    }

    // ---- the address was taken by the time the worker looked ----

    @Test
    @DisplayName("the worker suppresses delivery when the address is already registered")
    void suppressesDeliveryForAnAlreadyRegisteredAddress() throws Exception {
        String email = uniqueEmail("founder");
        // A real account for this address, via the ordinary end-to-end helper.
        registerAdmin(uniqueName("Existing Org"), email, PASSWORD);

        // A second registration attempt for the identical address.
        requestRegistration(email, uniqueName("Impersonating Org"));
        registrationVerificationDeliveryWorker.runOnce();

        // Checked against this test's own address, not the sender's whole
        // history or runOnce()'s aggregate count over the whole shared
        // table: these integration tests share one Postgres/mail-sender
        // instance with no per-test rollback, so another test's own row
        // could in principle still be due at the same moment.
        assertThat(mailsTo(email)).isZero();

        RegistrationVerification suppressed = latestFor(email);
        assertThat(suppressed.getDeliveryStatus())
            .isEqualTo(RegistrationVerification.DeliveryStatus.SUPPRESSED);
        assertThat(suppressed.isRedeemable()).isFalse();

        // Nothing further is attempted for it.
        assertThat(suppressed.getNextAttemptAt()).isNull();
    }

    // ---- the mail server is down ----

    @Test
    @DisplayName("a failed send leaves nothing redeemable and schedules a retry")
    void aFailedAttemptDiscardsItsTokenAndRetries() throws Exception {
        String email = uniqueEmail("founder");
        requestRegistration(email, uniqueName("Org"));

        recordingMailSender.setFailing(true);
        int delivered = registrationVerificationDeliveryWorker.runOnce();

        assertThat(delivered).isZero();

        RegistrationVerification afterFailure = latestFor(email);
        assertThat(afterFailure.getDeliveryStatus())
            .isEqualTo(RegistrationVerification.DeliveryStatus.QUEUED);
        assertThat(afterFailure.getAttemptCount()).isEqualTo(1);
        assertThat(afterFailure.getNextAttemptAt()).isAfter(OffsetDateTime.now(ZoneOffset.UTC));
        assertThat(afterFailure.isRedeemable()).isFalse();
        assertThat(jdbcTemplate.queryForObject(
            "select count(*) from registration_verifications where id = ? and token_hash is null",
            Integer.class, afterFailure.getId())).isEqualTo(1);
        assertThat(afterFailure.getLastError()).isNotNull();
    }

    @Test
    @DisplayName("a retry mints a new token rather than re-sending the failed one")
    void retryUsesAFreshToken() throws Exception {
        String email = uniqueEmail("founder");
        requestRegistration(email, uniqueName("Org"));

        recordingMailSender.setFailing(true);
        registrationVerificationDeliveryWorker.runOnce();
        recordingMailSender.setFailing(false);

        assertThat(registrationVerificationDeliveryWorker.runOnce()).isZero();

        makeDue(latestFor(email).getId());
        assertThat(registrationVerificationDeliveryWorker.runOnce()).isEqualTo(1);

        RegistrationVerification sent = latestFor(email);
        assertThat(sent.getDeliveryStatus()).isEqualTo(RegistrationVerification.DeliveryStatus.SENT);
        assertThat(sent.getAttemptCount()).isEqualTo(2);

        String mailed = inviteTokenFromMailTo(email);
        confirm(mailed);
    }

    @Test
    @DisplayName("attempts stop, and the row says so, rather than pending forever")
    void deliveryEventuallyFailsVisibly() throws Exception {
        String email = uniqueEmail("founder");
        requestRegistration(email, uniqueName("Org"));

        recordingMailSender.setFailing(true);
        UUID id = latestFor(email).getId();

        for (int attempt = 0; attempt < 6; attempt++) {
            makeDue(id);
            registrationVerificationDeliveryWorker.runOnce();
        }

        RegistrationVerification dead = latestFor(email);
        assertThat(dead.getDeliveryStatus()).isEqualTo(RegistrationVerification.DeliveryStatus.FAILED);
        assertThat(dead.isRedeemable()).isFalse();
        assertThat(dead.getLastError()).isNotNull();

        makeDue(id);
        assertThat(registrationVerificationDeliveryWorker.runOnce()).isZero();
    }

    @Test
    @DisplayName("the recorded failure names the cause and nothing else")
    void theFailureRecordCarriesNoCredentialAndNoAddress() throws Exception {
        String email = uniqueEmail("founder");
        requestRegistration(email, uniqueName("Org"));

        recordingMailSender.setFailing(true);
        registrationVerificationDeliveryWorker.runOnce();

        String error = latestFor(email).getLastError();
        assertThat(error).isNotNull();
        assertThat(error).doesNotContain(email);
        assertThat(error).doesNotContain("token=");
        assertThat(error).doesNotMatch(".*[A-Za-z0-9_-]{43}.*");
    }

    // ---- helpers ----

    private void requestRegistration(String email, String organizationName) throws Exception {
        requestRegistration(email, organizationName, PASSWORD);
    }

    private void requestRegistration(String email, String organizationName, String password)
        throws Exception {
        mockMvc.perform(post("/auth/register-admin")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "name", "Admin of " + organizationName,
                    "email", email,
                    "password", password,
                    "organizationName", organizationName,
                    "headquarterAddress", "Test Address 1"))))
            .andExpect(status().isAccepted());
    }

    private JsonNode confirm(String token) throws Exception {
        String response = mockMvc.perform(post("/auth/register-admin/verify")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("token", token))))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }

    private RegistrationVerification latestFor(String email) {
        return registrationVerificationRepository.findAll().stream()
            .filter(row -> row.getEmail().equals(email))
            .max(Comparator.comparing(RegistrationVerification::getCreatedAt))
            .orElseThrow();
    }

    /** Brings a backed-off job forward, instead of sleeping through the backoff. */
    private void makeDue(UUID id) {
        jdbcTemplate.update(
            "update registration_verifications set next_attempt_at = ? where id = ?",
            OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(1), id);
    }

    private long mailsTo(String email) {
        return recordingMailSender.getSentMessages().stream()
            .filter(message -> message.getTo() != null
                && java.util.List.of(message.getTo()).contains(email))
            .count();
    }
}
