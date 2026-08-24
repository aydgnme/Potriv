package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
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
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.identity.repository.UserRepository;

/**
 * Two separate registration attempts for the identical address, confirmed at
 * the same instant, must still produce exactly one account.
 *
 * This is not the same race {@code RegistrationVerificationRepository#claim}
 * closes: that guards two callers racing the *same* token. Here there are two
 * distinct rows, two distinct tokens, and each one's own claim legitimately
 * succeeds — {@code AuthRegistrationService#confirmRegistration}'s {@code
 * existsByEmail} check is a fast path for the ordinary case, but two threads
 * can both observe "not yet taken" before either has committed. The real
 * guarantee is structural: {@code users.email} is a unique column, so the
 * database allows only one of the two account inserts to succeed, and {@code
 * confirmRegistration} turns the loser's constraint violation into the same
 * clean {@code REGISTER_TOKEN_INVALID} every other dead token produces,
 * rather than an uncaught exception.
 */
class RegistrationParallelVerificationIntegrationTest extends AbstractMockMvcIntegrationTest {

    private static final String PASSWORD = "Password123!";

    @Autowired
    private UserRepository userRepository;

    @AfterEach
    void restoreMailServer() {
        recordingMailSender.clear();
    }

    @Test
    @DisplayName("racing two valid tokens for one address creates exactly one account")
    void racingTwoTokensForTheSameAddressCreatesExactlyOneAccount() throws Exception {
        String email = uniqueEmail("racer");

        // Two independent registration attempts for the identical address —
        // nothing at request time dedupes them; see
        // AuthRegistrationService#registerOrganizationAdmin.
        register(email, uniqueName("Org A"));
        register(email, uniqueName("Org B"));

        // One pass claims and mails both rows: each was inserted immediately
        // due, and the batch size comfortably covers two. Not asserted on
        // runOnce()'s exact return value here — see the token-filtering note
        // below for why an exact count over the whole shared table would be
        // fragile; the size-2 assertion on tokens filtered to this test's own
        // address is the real proof.
        registrationVerificationDeliveryWorker.runOnce();

        // Filtered to this test's own address, not counted across the whole
        // sender: these integration tests share one Postgres/mail-sender
        // instance with no per-test rollback, so another test's own queued
        // row could in principle still be "due" at the same moment. Matching
        // on recipient — the same technique inviteTokenFromMailTo already
        // uses — makes this assertion robust to that regardless.
        List<String> tokens = new ArrayList<>();
        recordingMailSender.getSentMessages().forEach(message -> {
            if (message.getTo() == null
                || !java.util.List.of(message.getTo()).contains(email)) {
                return;
            }
            String text = message.getText();
            java.util.regex.Matcher matcher =
                java.util.regex.Pattern.compile("token=([A-Za-z0-9_-]+)").matcher(text);
            if (matcher.find()) {
                tokens.add(matcher.group(1));
            }
        });
        assertThat(tokens)
            .as("both attempts must have been mailed a real, distinct token — "
                + "neither could see the other's yet-unconfirmed row as \"taken\"")
            .hasSize(2);
        assertThat(tokens.get(0)).isNotEqualTo(tokens.get(1));

        int contenders = tokens.size();
        ExecutorService pool = Executors.newFixedThreadPool(contenders);
        CyclicBarrier startTogether = new CyclicBarrier(contenders);
        List<Callable<Integer>> attempts = new ArrayList<>();
        for (String token : tokens) {
            attempts.add(() -> {
                startTogether.await(10, TimeUnit.SECONDS);
                return confirmStatus(token);
            });
        }

        List<Future<Integer>> outcomes;
        try {
            outcomes = pool.invokeAll(attempts, 30, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }

        int succeeded = 0;
        int rejected = 0;
        for (Future<Integer> outcome : outcomes) {
            int status = outcome.get();
            if (status == 201) {
                succeeded++;
            } else if (status == 400) {
                rejected++;
            } else {
                throw new AssertionError("Unexpected confirm status: " + status);
            }
        }

        assertThat(succeeded)
            .as("the users.email unique constraint allows exactly one insert to win")
            .isEqualTo(1);
        assertThat(rejected).isEqualTo(1);
        assertThat(userRepository.findByEmail(email)).isPresent();
    }

    private void register(String email, String organizationName) throws Exception {
        mockMvc.perform(post("/auth/register-admin")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "name", "Admin of " + organizationName,
                    "email", email,
                    "password", PASSWORD,
                    "organizationName", organizationName,
                    "headquarterAddress", "Test Address 1"))))
            .andExpect(status().isAccepted());
    }

    private int confirmStatus(String token) throws Exception {
        MockHttpServletResponse response = mockMvc.perform(post("/auth/register-admin/verify")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("token", token))))
            .andReturn().getResponse();
        return response.getStatus();
    }
}
