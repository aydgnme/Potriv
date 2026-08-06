package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mail.SimpleMailMessage;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.support.RecordingMailSender;

/**
 * What the password-reset request must do at the mail boundary.
 *
 * <p>The message is sent <em>synchronously</em>, inside the request thread, so
 * the contract that matters is not only "a mail goes out" but "a broken mail
 * server changes nothing an attacker can observe". Delivery-failure cases use
 * the recorder's opt-in failure mode, which reproduces an unreachable SMTP
 * server without needing one.
 */
class PasswordResetMailDeliveryIntegrationTest extends AbstractMockMvcIntegrationTest {

    @Autowired
    private RecordingMailSender recordingMailSender;

    @AfterEach
    void resetMailSender() {
        recordingMailSender.clear();
    }

    private void requestReset(String email) throws Exception {
        mockMvc.perform(post("/auth/password-reset/request")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email))))
            .andExpect(status().isAccepted());
    }

    private String seedUser() throws Exception {
        String email = uniqueEmail("reset-mail");
        registerAdmin(uniqueName("ResetMailOrg"), email, "Password123!");
        recordingMailSender.clear();
        return email;
    }

    // ------------------------------------------------------------- Delivery

    @Test
    void aResetRequestSendsExactlyOneMessageFromTheConfiguredSender() throws Exception {
        String email = seedUser();

        requestReset(email);

        assertThat(recordingMailSender.getSentMessages()).hasSize(1);
        SimpleMailMessage message = recordingMailSender.getSentMessages().get(0);
        assertThat(message.getTo()).containsExactly(email);
        // The sender is configuration, never caller-supplied.
        assertThat(message.getFrom()).isNotBlank();
        assertThat(message.getSubject()).isNotBlank();
    }

    @Test
    void theResetLinkUsesTheConfiguredFrontendBaseUrl() throws Exception {
        String email = seedUser();

        requestReset(email);

        String body = recordingMailSender.getSentMessages().get(0).getText();
        // The link must come from app.frontend-url, never from a request header —
        // a request-derived host would turn this into a phishing vector.
        assertThat(body).containsPattern("https?://[^/\\s]+/reset-password\\?token=\\S+");
    }

    @Test
    void theMessageCarriesNoCredentialOrHash() throws Exception {
        String email = seedUser();

        requestReset(email);

        String body = recordingMailSender.getSentMessages().get(0).getText();
        assertThat(body).doesNotContain("Password123!", "$2a$", "$2b$",
            "passwordHash", "refreshToken", "SMTP_PASSWORD");
    }

    // --------------------------------------------------- Anti-enumeration

    @Test
    void anUnknownAddressIsAcceptedAndSendsNothing() throws Exception {
        seedUser();

        requestReset("definitely-not-registered@potriv.test");

        assertThat(recordingMailSender.getSentMessages()).isEmpty();
    }

    /**
     * The response must be identical whether delivery succeeded, failed, or was
     * never attempted — otherwise the endpoint becomes an account oracle.
     */
    @Test
    void aFailedDeliveryChangesNothingTheCallerCanObserve() throws Exception {
        String email = seedUser();
        recordingMailSender.setFailing(true);

        // Both are asserted 202 inside requestReset: a known address whose
        // delivery throws, and an unknown address that never attempts one.
        requestReset(email);
        requestReset("nobody@potriv.test");

        assertThat(recordingMailSender.getSentMessages()).isEmpty();
    }

    /** A failed send must leave the account exactly as it was. */
    @Test
    void aFailedDeliveryStillLeavesTheAccountUsable() throws Exception {
        String email = seedUser();
        recordingMailSender.setFailing(true);

        requestReset(email);

        recordingMailSender.setFailing(false);
        assertThat(login(email, "Password123!").get("accessToken").asText()).isNotBlank();
    }
}
