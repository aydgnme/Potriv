package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.identity.entity.InviteToken;
import me.aydgn.potriv.identity.repository.InviteTokenRepository;

/**
 * What happens to an invitation when the mail server is unreachable.
 *
 * It used to be: nothing visible. Creating the invitation, minting the token
 * and sending the mail all happened inside the request, and the send was
 * wrapped in a `catch (MailException)` that logged a warning. So the API
 * answered 201, the administrator was told "invitation sent", and the recipient
 * got nothing — while a live token sat in the database that only the mail
 * nobody received could have carried. Nothing retried, and nothing recorded
 * that a delivery had failed.
 *
 * The SMTP call also ran while the request held a pessimistic lock on the
 * organization row, so one slow mail server blocked every other invitation for
 * that organization for the length of its timeout.
 *
 * The request now records the intention and returns 202. A worker mints a token
 * per attempt, sends, and either marks the invitation delivered or discards
 * that attempt's token and schedules another.
 */
class InviteDeliveryIntegrationTest extends AbstractMockMvcIntegrationTest {

    private static final String PASSWORD = "Password123!";
    private static final String INVITES = "/organizations/current/invites";

    @Autowired
    private InviteTokenRepository inviteTokenRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @AfterEach
    void restoreMailServer() {
        recordingMailSender.setFailing(false);
    }

    // ---- the honest answer ----

    @Test
    @DisplayName("the request answers queued, not sent")
    void invitingAnswers202WithDeliveryState() throws Exception {
        String adminToken = adminToken();

        JsonNode queued = objectMapper.readTree(mockMvc.perform(post(INVITES)
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("email", uniqueEmail("employee")))))
            .andExpect(status().isAccepted())
            .andReturn().getResponse().getContentAsString());

        assertThat(queued.get("delivery").asText()).isEqualTo("QUEUED");
        assertThat(queued.get("status").asText()).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("nothing redeemable exists until the mail has actually gone")
    void noTokenExistsBeforeDelivery() throws Exception {
        String adminToken = adminToken();
        String email = uniqueEmail("employee");

        mockMvc.perform(post(INVITES)
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email))))
            .andExpect(status().isAccepted());

        InviteToken queued = latestFor(email);
        assertThat(queued.getDeliveryStatus()).isEqualTo(InviteToken.DeliveryStatus.QUEUED);
        assertThat(queued.isRedeemable()).isFalse();
        assertThat(jdbcTemplate.queryForObject(
            "select count(*) from invite_tokens where id = ? and token_hash is null",
            Integer.class, queued.getId())).isEqualTo(1);

        inviteDeliveryWorker.runOnce();

        InviteToken sent = latestFor(email);
        assertThat(sent.getDeliveryStatus()).isEqualTo(InviteToken.DeliveryStatus.SENT);
        assertThat(sent.isRedeemable()).isTrue();
    }

    // ---- the mail server is down ----

    @Test
    @DisplayName("a failed send leaves nothing redeemable and schedules a retry")
    void aFailedAttemptDiscardsItsTokenAndRetries() throws Exception {
        String adminToken = adminToken();
        String email = uniqueEmail("employee");
        inviteEmployeeQueued(adminToken, email);

        recordingMailSender.setFailing(true);
        int delivered = inviteDeliveryWorker.runOnce();

        assertThat(delivered).isZero();

        InviteToken afterFailure = latestFor(email);
        assertThat(afterFailure.getDeliveryStatus()).isEqualTo(InviteToken.DeliveryStatus.QUEUED);
        assertThat(afterFailure.getAttemptCount()).isEqualTo(1);
        assertThat(afterFailure.getNextAttemptAt()).isAfter(OffsetDateTime.now(ZoneOffset.UTC));

        // The decisive one: the attempt minted a token, and it is gone again.
        assertThat(afterFailure.isRedeemable()).isFalse();
        assertThat(jdbcTemplate.queryForObject(
            "select count(*) from invite_tokens where id = ? and token_hash is null",
            Integer.class, afterFailure.getId())).isEqualTo(1);

        // Nobody was told the invitation was sent.
        assertThat(afterFailure.getLastError()).isNotNull();
    }

    @Test
    @DisplayName("a retry mints a new token rather than re-sending the failed one")
    void retryUsesAFreshToken() throws Exception {
        String adminToken = adminToken();
        String email = uniqueEmail("employee");
        inviteEmployeeQueued(adminToken, email);

        recordingMailSender.setFailing(true);
        inviteDeliveryWorker.runOnce();
        recordingMailSender.setFailing(false);

        // The backoff has not elapsed, so nothing is due yet: this is what stops
        // a broken mail server being hammered.
        assertThat(inviteDeliveryWorker.runOnce()).isZero();

        makeDue(latestFor(email).getId());
        assertThat(inviteDeliveryWorker.runOnce()).isEqualTo(1);

        InviteToken sent = latestFor(email);
        assertThat(sent.getDeliveryStatus()).isEqualTo(InviteToken.DeliveryStatus.SENT);
        assertThat(sent.getAttemptCount()).isEqualTo(2);

        // And the token that arrived is the one the mail carries.
        String mailed = inviteTokenFromMailTo(email);
        registerEmployee(mailed, email, PASSWORD);
    }

    @Test
    @DisplayName("attempts stop, and the invitation says so, rather than pending forever")
    void deliveryEventuallyFailsVisibly() throws Exception {
        String adminToken = adminToken();
        String email = uniqueEmail("employee");
        inviteEmployeeQueued(adminToken, email);

        recordingMailSender.setFailing(true);
        UUID inviteId = latestFor(email).getId();

        for (int attempt = 0; attempt < 6; attempt++) {
            makeDue(inviteId);
            inviteDeliveryWorker.runOnce();
        }

        InviteToken dead = latestFor(email);
        assertThat(dead.getDeliveryStatus()).isEqualTo(InviteToken.DeliveryStatus.FAILED);
        assertThat(dead.isPending()).isFalse();
        assertThat(dead.isRedeemable()).isFalse();
        assertThat(dead.getLastError()).isNotNull();

        // Nothing further is attempted.
        makeDue(inviteId);
        assertThat(inviteDeliveryWorker.runOnce()).isZero();
    }

    @Test
    @DisplayName("the recorded failure names the cause and nothing else")
    void theFailureRecordCarriesNoCredentialAndNoAddress() throws Exception {
        String adminToken = adminToken();
        String email = uniqueEmail("employee");
        inviteEmployeeQueued(adminToken, email);

        recordingMailSender.setFailing(true);
        inviteDeliveryWorker.runOnce();

        String error = latestFor(email).getLastError();
        assertThat(error).isNotNull();
        assertThat(error).doesNotContain(email);
        assertThat(error).doesNotContain("token=");
        assertThat(error).doesNotMatch(".*[A-Za-z0-9_-]{43}.*");
    }

    // ---- several workers ----

    @Test
    @DisplayName("only one worker can claim a delivery, however many are running")
    void concurrentWorkersDeliverOnce() throws Exception {
        String adminToken = adminToken();
        String email = uniqueEmail("employee");
        inviteEmployeeQueued(adminToken, email);

        int workers = 6;
        CyclicBarrier startTogether = new CyclicBarrier(workers);
        ExecutorService pool = Executors.newFixedThreadPool(workers);

        List<Callable<Integer>> passes = new java.util.ArrayList<>();
        for (int i = 0; i < workers; i++) {
            passes.add(() -> {
                startTogether.await(10, TimeUnit.SECONDS);
                return inviteDeliveryWorker.runOnce();
            });
        }

        int delivered = 0;
        try {
            for (Future<Integer> outcome : pool.invokeAll(passes, 60, TimeUnit.SECONDS)) {
                delivered += outcome.get();
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(delivered)
            .as("the claim is a conditional UPDATE; exactly one worker may win it")
            .isEqualTo(1);
        assertThat(mailsTo(email)).isEqualTo(1);
        assertThat(latestFor(email).getAttemptCount()).isEqualTo(1);
    }

    // ---- the lock ----

    @Test
    @DisplayName("a broken mail server does not block other invitations")
    void theOrganizationLockIsNotHeldAcrossTheMailServer() throws Exception {
        /*
          The request no longer sends mail, so the lock it takes cannot be held
          for the duration of an SMTP timeout. This asserts the property that
          follows: with the mail server failing, inviting still returns
          promptly, and a second invitation is not blocked behind the first.
        */
        String adminToken = adminToken();
        recordingMailSender.setFailing(true);

        long startedAt = System.nanoTime();
        inviteEmployeeQueued(adminToken, uniqueEmail("first"));
        inviteEmployeeQueued(adminToken, uniqueEmail("second"));
        long elapsedMs = (System.nanoTime() - startedAt) / 1_000_000;

        assertThat(elapsedMs)
            .as("neither request touched the mail server at all")
            .isLessThan(5_000);
    }

    // ---- helpers ----

    private String adminToken() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        return loginForAccessToken(adminEmail, PASSWORD);
    }

    /** Queues an invitation without running the worker. */
    private void inviteEmployeeQueued(String adminToken, String email) throws Exception {
        mockMvc.perform(post(INVITES)
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email))))
            .andExpect(status().isAccepted());
    }

    private InviteToken latestFor(String email) {
        return inviteTokenRepository.findAll().stream()
            .filter(invite -> invite.getInvitedEmail().equals(email))
            .max(java.util.Comparator.comparing(InviteToken::getCreatedAt))
            .orElseThrow();
    }

    /** Brings a backed-off job forward, instead of sleeping through the backoff. */
    private void makeDue(UUID inviteId) {
        jdbcTemplate.update("update invite_tokens set next_attempt_at = ? where id = ?",
            OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(1), inviteId);
    }

    private long mailsTo(String email) {
        return recordingMailSender.getSentMessages().stream()
            .filter(message -> message.getTo() != null
                && List.of(message.getTo()).contains(email))
            .count();
    }
}
