package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.MailSendException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.common.security.TokenDigest;
import me.aydgn.potriv.identity.entity.InviteToken;
import me.aydgn.potriv.identity.repository.InviteTokenRepository;

/**
 * The delivery state machine under the failures it exists to survive.
 *
 * {@link InviteDeliveryIntegrationTest} covers the ordinary shape of a failed
 * send: one job, one kind of failure, retried and eventually FAILED. This file
 * covers the part of the independent security audit that ordinary shape does
 * not reach — a *poisoned* job that must not stop the jobs behind it, and the
 * races a worker's own crash can create around the boundary between
 * DELIVERING and SENT.
 *
 * Everything here runs against the real Testcontainers PostgreSQL every other
 * integration test in this module uses; several tests below claim, commit a
 * hash, or reclaim a lease directly through {@link InviteTokenRepository}
 * rather than through {@link InviteDeliveryWorker}, specifically to simulate a
 * worker that died at a precise point mid-attempt — a moment the worker itself
 * cannot be made to stop at from the outside.
 */
class InviteDeliveryResilienceIntegrationTest extends AbstractMockMvcIntegrationTest {

    private static final String PASSWORD = "Password123!";
    private static final String INVITES = "/organizations/current/invites";

    @Autowired
    private InviteTokenRepository inviteTokenRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @AfterEach
    void restoreMailServer() {
        recordingMailSender.clear();
    }

    /**
     * Runs one guarded repository write in its own committed transaction —
     * exactly the shape {@link InviteDeliveryWorker} itself uses for every step
     * of an attempt.
     *
     * The `@Modifying` methods on {@link InviteTokenRepository} require an
     * active transaction (they flush the persistence context as part of the
     * write); the worker always calls them from inside its own
     * {@code TransactionTemplate}, but a test simulating "a second worker" or
     * "the worker a moment later" is calling them directly, with nothing else
     * supplying that transaction. This is that transaction, and using
     * REQUIRES_NEW for it — the same propagation the worker uses — is what
     * makes each simulated step a faithful stand-in for an independent
     * attempt rather than an extension of whatever transaction happened to be
     * open in the test.
     */
    private <T> T inTx(Supplier<T> action) {
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        return template.execute(status -> action.get());
    }

    // ---- a poisoned job must not stop the jobs behind it ----

    @Test
    @DisplayName("an unexpected RuntimeException from one job does not stop the two healthy jobs behind it")
    void poisonJobDoesNotBlockHealthyJobsInTheSameBatch() throws Exception {
        String adminToken = adminToken();
        String poisoned = uniqueEmail("poisoned");
        String healthyOne = uniqueEmail("healthy-one");
        String healthyTwo = uniqueEmail("healthy-two");

        queueInvite(adminToken, poisoned);
        queueInvite(adminToken, healthyOne);
        queueInvite(adminToken, healthyTwo);

        recordingMailSender.failFor(
            poisoned, () -> new IllegalStateException("simulated unexpected failure"));

        int delivered = inviteDeliveryWorker.runOnce();

        assertThat(delivered)
            .as("the two healthy jobs are delivered in the same pass the poisoned one failed in")
            .isEqualTo(2);
        assertThat(mailedTo(healthyOne)).isTrue();
        assertThat(mailedTo(healthyTwo)).isTrue();
        assertThat(mailedTo(poisoned)).isFalse();

        InviteToken afterFailure = latestFor(poisoned);
        assertThat(afterFailure.getDeliveryStatus()).isEqualTo(InviteToken.DeliveryStatus.QUEUED);
        assertThat(afterFailure.getAttemptCount()).isEqualTo(1);
        assertThat(afterFailure.isRedeemable()).isFalse();
    }

    @Test
    @DisplayName("a DataAccessException from one job does not stop a healthy job behind it")
    void dataAccessExceptionDoesNotStopTheQueue() throws Exception {
        assertIsolatedFromOneFailure(
            () -> new DataAccessResourceFailureException("simulated database outage"));
    }

    @Test
    @DisplayName("a QueryTimeoutException from one job does not stop a healthy job behind it")
    void queryTimeoutExceptionDoesNotStopTheQueue() throws Exception {
        assertIsolatedFromOneFailure(() -> new QueryTimeoutException("simulated statement timeout"));
    }

    @Test
    @DisplayName("a MailException from one job does not stop a healthy job behind it")
    void mailExceptionDoesNotStopTheQueue() throws Exception {
        assertIsolatedFromOneFailure(() -> new MailSendException("simulated SMTP failure"));
    }

    private void assertIsolatedFromOneFailure(
        java.util.function.Supplier<RuntimeException> failure
    ) throws Exception {
        String adminToken = adminToken();
        String poisoned = uniqueEmail("poisoned");
        String healthy = uniqueEmail("healthy");

        queueInvite(adminToken, poisoned);
        queueInvite(adminToken, healthy);

        recordingMailSender.failFor(poisoned, failure);

        int delivered = inviteDeliveryWorker.runOnce();

        assertThat(delivered).isEqualTo(1);
        assertThat(mailedTo(healthy)).isTrue();
        assertThat(mailedTo(poisoned)).isFalse();

        InviteToken afterFailure = latestFor(poisoned);
        assertThat(afterFailure.getDeliveryStatus()).isEqualTo(InviteToken.DeliveryStatus.QUEUED);
        assertThat(afterFailure.getAttemptCount()).isEqualTo(1);
        assertThat(afterFailure.isRedeemable()).isFalse();
        // The class name is recorded, nothing about the exception's own message
        // — which, for a data-access exception, can carry a statement's
        // parameters.
        assertThat(afterFailure.getLastError()).isEqualTo(failure.get().getClass().getSimpleName());
    }

    // ---- the worker dies at each point mid-attempt ----

    @Test
    @DisplayName("a worker that dies right after the claim commits leaves a job the lease returns to the queue")
    void workerDyingAfterClaimIsReclaimedWhenTheLeaseExpires() throws Exception {
        String adminToken = adminToken();
        String email = uniqueEmail("employee");
        queueInvite(adminToken, email);
        UUID inviteId = latestFor(email).getId();

        // Simulates a worker that claimed the job and then died before doing
        // anything else with it — no hash, no send, nothing.
        UUID deadAttempt = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        assertThat(inTx(() ->
            inviteTokenRepository.claimDelivery(inviteId, now, now.plusSeconds(1), deadAttempt)))
            .isEqualTo(1);
        assertThat(latestFor(email).getDeliveryStatus())
            .isEqualTo(InviteToken.DeliveryStatus.DELIVERING);

        expireLease(inviteId);

        int delivered = inviteDeliveryWorker.runOnce();

        assertThat(delivered)
            .as("the lease expired, so a real worker pass reclaims and completes the job")
            .isEqualTo(1);
        InviteToken sent = latestFor(email);
        assertThat(sent.getDeliveryStatus()).isEqualTo(InviteToken.DeliveryStatus.SENT);
        assertThat(sent.isRedeemable()).isTrue();
        assertThat(sent.getAttemptCount())
            .as("the dead claim and the reclaim both count as an attempt")
            .isEqualTo(2);

        registerEmployee(inviteTokenFromMailTo(email), email, PASSWORD);
    }

    @Test
    @DisplayName("a hash committed before SMTP is never redeemable, and a dead worker's is replaced on reclaim")
    void hashCommittedBeforeSmtpIsNeverRedeemableAndIsReplacedOnReclaim() throws Exception {
        String adminToken = adminToken();
        String email = uniqueEmail("employee");
        queueInvite(adminToken, email);
        UUID inviteId = latestFor(email).getId();

        // Simulates a worker that claimed, minted and committed a hash, and
        // then died — one line of code before the SMTP call it never made.
        UUID deadAttempt = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        assertThat(inTx(() ->
            inviteTokenRepository.claimDelivery(inviteId, now, now.plusSeconds(1), deadAttempt)))
            .isEqualTo(1);

        String orphanedRawToken = "orphaned-" + UUID.randomUUID();
        String orphanedHash = TokenDigest.sha256Base64Url(orphanedRawToken);
        assertThat(inTx(() -> inviteTokenRepository.commitAttemptToken(
            inviteId, deadAttempt, orphanedHash, now.plusHours(1))))
            .isEqualTo(1);

        InviteToken midFlight = latestFor(email);
        assertThat(midFlight.getDeliveryStatus()).isEqualTo(InviteToken.DeliveryStatus.DELIVERING);
        assertThat(midFlight.getTokenHash()).isEqualTo(orphanedHash);
        assertThat(midFlight.isRedeemable())
            .as("a hash committed before the mail is sent must not be usable")
            .isFalse();
        assertThat(inTx(() -> inviteTokenRepository.claim(orphanedHash, email)))
            .as("the redemption predicate itself must reject a DELIVERING row's hash")
            .isZero();

        expireLease(inviteId);
        int delivered = inviteDeliveryWorker.runOnce();
        assertThat(delivered).isEqualTo(1);

        assertThat(inTx(() -> inviteTokenRepository.claim(orphanedHash, email)))
            .as("the orphaned hash stays dead even after a fresh attempt succeeds")
            .isZero();

        InviteToken sent = latestFor(email);
        assertThat(sent.getDeliveryStatus()).isEqualTo(InviteToken.DeliveryStatus.SENT);
        assertThat(sent.getTokenHash()).isNotEqualTo(orphanedHash);

        registerEmployee(inviteTokenFromMailTo(email), email, PASSWORD);
    }

    @Test
    @DisplayName(
        "mail sent but not yet recorded as SENT is unredeemable, and the retry mails a genuinely new token")
    void smtpSucceedsBeforeSentIsRecorded_oldLinkStaysDeadAndRetryMintsANewOne() throws Exception {
        String adminToken = adminToken();
        String email = uniqueEmail("employee");
        queueInvite(adminToken, email);
        UUID inviteId = latestFor(email).getId();

        /*
          Simulates the single narrowest window this state machine has: the
          SMTP call returned successfully, and the worker died before the
          transaction that would have recorded it. From the database's point of
          view this is indistinguishable from "hash committed, then died before
          SMTP" — which is exactly why the redemption predicate does not try to
          tell them apart. It asks one question — is this row SENT — and
          answers "no" to both.
        */
        UUID deadAttempt = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        assertThat(inTx(() ->
            inviteTokenRepository.claimDelivery(inviteId, now, now.plusSeconds(1), deadAttempt)))
            .isEqualTo(1);
        String mailedButUnrecordedToken = "mailed-but-unrecorded-" + UUID.randomUUID();
        String mailedButUnrecordedHash = TokenDigest.sha256Base64Url(mailedButUnrecordedToken);
        assertThat(inTx(() -> inviteTokenRepository.commitAttemptToken(
            inviteId, deadAttempt, mailedButUnrecordedHash, now.plusHours(1))))
            .isEqualTo(1);
        // The SMTP call itself is not simulated here — this test is about the
        // database guarantee, which holds whether or not mail actually left,
        // and does not depend on a mail server being involved at all.

        assertThat(inTx(() -> inviteTokenRepository.claim(mailedButUnrecordedHash, email)))
            .as("a link the recipient may already have received must still not register an account")
            .isZero();

        expireLease(inviteId);
        assertThat(inviteDeliveryWorker.runOnce()).isEqualTo(1);

        String freshToken = inviteTokenFromMailTo(email);
        assertThat(freshToken).isNotEqualTo(mailedButUnrecordedToken);

        assertThat(inTx(() -> inviteTokenRepository.claim(mailedButUnrecordedHash, email)))
            .as("the old, unrecorded token is still dead after the retry mailed a new one")
            .isZero();

        registerEmployee(freshToken, email, PASSWORD);
    }

    @Test
    @DisplayName("a stale worker cannot mark SENT once its lease has been reclaimed by another")
    void staleWorkerCannotWriteSentAfterLosingItsLease() throws Exception {
        String adminToken = adminToken();
        String email = uniqueEmail("employee");
        queueInvite(adminToken, email);
        UUID inviteId = latestFor(email).getId();

        UUID staleAttempt = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        assertThat(inTx(() ->
            inviteTokenRepository.claimDelivery(inviteId, now, now.plusSeconds(1), staleAttempt)))
            .isEqualTo(1);

        expireLease(inviteId);

        // A second attempt reclaims the same job — the lease has expired, so
        // this is exactly what `findDueDeliveries` would also pick up.
        UUID reclaimingAttempt = UUID.randomUUID();
        OffsetDateTime later = OffsetDateTime.now(ZoneOffset.UTC);
        assertThat(inTx(() -> inviteTokenRepository.claimDelivery(
            inviteId, later, later.plusMinutes(5), reclaimingAttempt)))
            .isEqualTo(1);
        assertThat(latestFor(email).getLeaseOwner()).isEqualTo(reclaimingAttempt);

        // The stale worker, having no idea it lost the race, tries to record
        // its own (never actually sent) success.
        assertThat(inTx(() -> inviteTokenRepository.markDelivered(inviteId, staleAttempt)))
            .as("a lease owner that no longer matches the row must update nothing")
            .isZero();

        InviteToken afterStaleWrite = latestFor(email);
        assertThat(afterStaleWrite.getDeliveryStatus())
            .as("the row is untouched by the stale write; it is still owned by the reclaiming attempt")
            .isEqualTo(InviteToken.DeliveryStatus.DELIVERING);
        assertThat(afterStaleWrite.getLeaseOwner()).isEqualTo(reclaimingAttempt);
    }

    // ---- exclusivity ----

    @Test
    @DisplayName("many concurrent claims for the same job: exactly one wins, at the database level")
    void concurrentClaimsAtTheRepositoryLevelHaveExactlyOneWinner() throws Exception {
        String adminToken = adminToken();
        String email = uniqueEmail("employee");
        queueInvite(adminToken, email);
        UUID inviteId = latestFor(email).getId();

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
                    return inTx(() -> inviteTokenRepository.claimDelivery(
                        inviteId, now, now.plusMinutes(5), attemptId));
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

        InviteToken claimed = latestFor(email);
        assertThat(claimed.getDeliveryStatus()).isEqualTo(InviteToken.DeliveryStatus.DELIVERING);
        assertThat(attemptIds).contains(claimed.getLeaseOwner());
    }

    // ---- the invariant ----

    @Test
    @DisplayName("whatever the sequence of failures, at most one token is ever redeemable")
    void neverMoreThanOneRedeemableToken() throws Exception {
        String adminToken = adminToken();
        String email = uniqueEmail("employee");
        queueInvite(adminToken, email);
        UUID inviteId = latestFor(email).getId();

        List<String> abandonedHashes = new ArrayList<>();
        for (int attempt = 0; attempt < 2; attempt++) {
            UUID deadAttempt = UUID.randomUUID();
            OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
            assertThat(inTx(() -> inviteTokenRepository.claimDelivery(
                inviteId, now, now.plusSeconds(1), deadAttempt)))
                .isEqualTo(1);
            String rawToken = "abandoned-" + attempt + "-" + UUID.randomUUID();
            String hash = TokenDigest.sha256Base64Url(rawToken);
            assertThat(inTx(() ->
                inviteTokenRepository.commitAttemptToken(inviteId, deadAttempt, hash, now.plusHours(1))))
                .isEqualTo(1);
            abandonedHashes.add(hash);
            expireLease(inviteId);
        }

        assertThat(inviteDeliveryWorker.runOnce()).isEqualTo(1);

        String liveToken = inviteTokenFromMailTo(email);
        String liveHash = TokenDigest.sha256Base64Url(liveToken);

        for (String abandoned : abandonedHashes) {
            assertThat(inTx(() -> inviteTokenRepository.claim(abandoned, email)))
                .as("an abandoned attempt's hash must never be redeemable")
                .isZero();
        }
        assertThat(jdbcTemplate.queryForObject(
            "select count(*) from invite_tokens "
                + "where id = ? and token_hash is not null and delivery_status = 'SENT'",
            Integer.class, inviteId))
            .as("at most one row is ever both hashed and SENT for this invitation")
            .isEqualTo(1);

        registerEmployee(liveToken, email, PASSWORD);
        assertThat(inTx(() -> inviteTokenRepository.claim(liveHash, email)))
            .as("consumed by the registration above; a second redemption must fail")
            .isZero();
    }

    // ---- no lock held across the SMTP call ----

    @Test
    @DisplayName("the SMTP call holds no organization or invite row lock while it is in flight")
    void smtpCallHoldsNoRowLockWhileInFlight() throws Exception {
        String adminEmail = uniqueEmail("admin");
        JsonNode admin = registerAdmin(uniqueName("LockProbeOrg"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);

        String blockedRecipient = uniqueEmail("blocked");
        queueInvite(adminToken, blockedRecipient);
        UUID inviteId = latestFor(blockedRecipient).getId();

        CountDownLatch sendStarted = new CountDownLatch(1);
        CountDownLatch releaseSend = new CountDownLatch(1);
        recordingMailSender.blockFor(blockedRecipient, sendStarted, releaseSend);

        ExecutorService pool = Executors.newSingleThreadExecutor();
        AtomicInteger deliveredInBackground = new AtomicInteger(-1);
        try {
            Future<?> backgroundPass = pool.submit(() ->
                deliveredInBackground.set(inviteDeliveryWorker.runOnce()));

            assertThat(sendStarted.await(10, TimeUnit.SECONDS))
                .as("the worker reached the SMTP call")
                .isTrue();

            // While the "SMTP call" is blocked: the same invite row is still
            // writable from a second connection —
            long rowUpdateMs = timed(() -> jdbcTemplate.update(
                "update invite_tokens set last_error = 'probe' where id = ?", inviteId));
            assertThat(rowUpdateMs)
                .as("no row lock is held on the invite while its mail is in flight")
                .isLessThan(2_000);

            // — and a second invitation in the same organization is not
            // blocked behind an organization-row lock either, because the
            // worker's delivery path never takes one.
            String secondRecipient = uniqueEmail("second");
            long secondInviteMs = timed(() -> {
                try {
                    queueInvite(adminToken, secondRecipient);
                } catch (Exception exception) {
                    throw new RuntimeException(exception);
                }
            });
            assertThat(secondInviteMs)
                .as("a second invitation is not blocked behind the first one's in-flight mail")
                .isLessThan(2_000);

            // Revoked immediately: this invite exists only to measure the
            // creation call's timing, not to be delivered. Left QUEUED and due,
            // it would still be sitting there for the next test's `runOnce()`
            // to pick up — this class shares one Testcontainers database across
            // every test method in it, exactly like every other integration
            // test in this module. Revoking alone is not enough — the claim
            // query does not filter on `active`, by design, so the row is
            // still due until a pass actually reclaims and parks it; running
            // the worker settles that within this test rather than leaving it
            // for whichever later test's pass happens to reclaim it.
            revoke(adminToken, latestFor(secondRecipient).getId());
            inviteDeliveryWorker.runOnce();

            releaseSend.countDown();
            backgroundPass.get(30, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }

        assertThat(deliveredInBackground.get()).isEqualTo(1);
        InviteToken sent = latestFor(blockedRecipient);
        assertThat(sent.getDeliveryStatus()).isEqualTo(InviteToken.DeliveryStatus.SENT);
    }

    // ---- helpers ----

    private String adminToken() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        return loginForAccessToken(adminEmail, PASSWORD);
    }

    /** Queues an invitation without running the worker. */
    private void queueInvite(String adminToken, String email) throws Exception {
        mockMvc.perform(post(INVITES)
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email))))
            .andExpect(status().isAccepted());
    }

    /**
     * Withdraws an invitation, so it stops being due.
     *
     * Cleanup for tests whose invite exists only to be measured, not
     * delivered: `AbstractIntegrationTest` starts one Testcontainers database
     * per JVM and every test method in this class shares it, exactly like
     * every other integration test in this module. A QUEUED invitation left
     * unresolved does not go away on its own — a claim only stops finding it
     * once it is either SENT, FAILED, or, as here, withdrawn and released.
     */
    private void revoke(String adminToken, UUID inviteId) throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .delete(INVITES + "/" + inviteId)
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
            .andExpect(status().isNoContent());
    }

    private InviteToken latestFor(String email) {
        return inviteTokenRepository.findAll().stream()
            .filter(invite -> invite.getInvitedEmail().equals(email))
            .max(java.util.Comparator.comparing(InviteToken::getCreatedAt))
            .orElseThrow();
    }

    /** Brings a claimed lease into the past, as if its owner had died. */
    private void expireLease(UUID inviteId) {
        jdbcTemplate.update("update invite_tokens set next_attempt_at = ? where id = ?",
            OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(1), inviteId);
    }

    private boolean mailedTo(String email) {
        return recordingMailSender.getSentMessages().stream()
            .anyMatch(message -> message.getTo() != null
                && List.of(message.getTo()).contains(email));
    }

    private static long timed(Runnable action) {
        long startedAt = System.nanoTime();
        action.run();
        return (System.nanoTime() - startedAt) / 1_000_000;
    }
}
