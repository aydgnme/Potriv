package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;

/**
 * What an anonymous caller can learn about whether an email address already
 * has a workspace.
 *
 * {@code /auth/register-admin} used to create the organization and the admin
 * account inside the request, and answer 201 for a new address or 400 for a
 * taken one — an unauthenticated account oracle, one guess at a time, free
 * and authoritative. This is the response-level half of closing it: status,
 * headers, and body must not differ by one bit between an address that
 * already has an account and one that has never been seen. The DB-level half
 * — that a second request for a taken address never actually creates a
 * second account — is {@code AdminRegistrationIntegrationTest
 * #duplicateEmailGetsTheIdenticalAcceptedResponseAndNoSecondAccount} and
 * {@code RegistrationVerificationDeliveryIntegrationTest
 * #suppressesDeliveryForAnAlreadyRegisteredAddress}.
 *
 * No wall-clock timing assertion appears here on purpose. The parity claim
 * this flow makes is structural — see {@code AuthRegistrationService
 * #registerOrganizationAdmin}'s own javadoc: there is no branch on email
 * existence in the request path at all, so there is nothing for a timing
 * measurement to prove that reading the method cannot already show, and a
 * wall-clock assertion would only add flakiness under CI load without adding
 * confidence.
 */
class RegistrationEnumerationParityIntegrationTest extends AbstractMockMvcIntegrationTest {

    private static final String PASSWORD = "Password123!";

    @AfterEach
    void drainQueueAndRestoreMailServer() {
        // This class posts directly to /auth/register-admin without going
        // through registrationVerificationDeliveryWorker, on purpose — the
        // assertions are about the response, not delivery. Draining here
        // keeps the row it queued from being picked up by another test's own
        // runOnce() call: these tests share one Postgres instance with no
        // per-test rollback, exactly like InviteDeliveryIntegrationTest.
        registrationVerificationDeliveryWorker.runOnce();
        recordingMailSender.clear();
    }

    @Test
    @DisplayName("a taken address and a fresh one get byte-identical 202 responses")
    void responsesAreIdenticalForATakenAndAFreshAddress() throws Exception {
        String taken = uniqueEmail("taken");
        registerAdmin(uniqueName("Existing Org"), taken, PASSWORD);
        // registerAdmin already cleared recordingMailSender.

        String fresh = uniqueEmail("fresh");

        MockHttpServletResponse takenResponse = register(taken, uniqueName("Org A"));
        MockHttpServletResponse freshResponse = register(fresh, uniqueName("Org B"));

        assertThat(takenResponse.getStatus()).isEqualTo(freshResponse.getStatus());
        assertThat(takenResponse.getContentAsString())
            .isEqualTo(freshResponse.getContentAsString());
        assertThat(takenResponse.getContentType()).isEqualTo(freshResponse.getContentType());

        // Nothing in the body names the difference.
        assertThat(takenResponse.getContentAsString().toLowerCase(java.util.Locale.ROOT))
            .doesNotContain("already", "exists", "taken", "duplicate");
    }

    @Test
    @DisplayName("the response body carries only the fixed message, nothing a caller could branch on")
    void theResponseBodyCarriesOnlyTheFixedMessage() throws Exception {
        String email = uniqueEmail("fresh");

        MockHttpServletResponse response = register(email, uniqueName("Org"));

        com.fasterxml.jackson.databind.JsonNode body =
            objectMapper.readTree(response.getContentAsString());
        assertThat(body.fieldNames()).toIterable().containsExactly("message");
        assertThat(body.get("message").asText())
            .isEqualTo("If this email address can be used to create a workspace, "
                + "a confirmation link has been sent to it.");
    }

    private MockHttpServletResponse register(String email, String organizationName)
        throws Exception {
        return mockMvc.perform(post("/auth/register-admin")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "name", "Admin of " + organizationName,
                    "email", email,
                    "password", PASSWORD,
                    "organizationName", organizationName,
                    "headquarterAddress", "Test Address 1"))))
            .andExpect(status().isAccepted())
            .andReturn().getResponse();
    }
}
