package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mail.SimpleMailMessage;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.common.security.TokenDigest;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.PasswordResetTokenRepository;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.support.RecordingMailSender;

class PasswordResetIntegrationTest extends AbstractMockMvcIntegrationTest {

    private static final Pattern TOKEN_PATTERN = Pattern.compile("token=([A-Za-z0-9_-]+)");

    @Autowired
    private RecordingMailSender recordingMailSender;

    @Autowired
    private PasswordResetTokenRepository passwordResetTokenRepository;

    @Autowired
    private UserRepository userRepository;

    @Test
    void existingEmailRequestReturns202() throws Exception {
        String email = uniqueEmail("reset");
        registerAdmin(uniqueName("Org"), email, "Password123!");

        requestReset(email)
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.message").exists());
    }

    @Test
    void unknownEmailRequestReturnsSame202ResponseShape() throws Exception {
        String existingEmail = uniqueEmail("reset");
        registerAdmin(uniqueName("Org"), existingEmail, "Password123!");

        String existingBody = requestReset(existingEmail)
            .andExpect(status().isAccepted())
            .andReturn().getResponse().getContentAsString();

        String unknownBody = requestReset(uniqueEmail("ghost"))
            .andExpect(status().isAccepted())
            .andReturn().getResponse().getContentAsString();

        assertThat(unknownBody).isEqualTo(existingBody);
    }

    @Test
    void existingAccountProducesResetEmailWithFrontendUrl() throws Exception {
        String email = uniqueEmail("reset");
        registerAdmin(uniqueName("Org"), email, "Password123!");

        requestReset(email).andExpect(status().isAccepted());

        SimpleMailMessage message = latestMessageTo(email);
        assertThat(message.getSubject()).contains("Potriv");
        assertThat(Objects.requireNonNull(message.getText()))
            .contains("http://localhost:5173/reset-password?token=");
    }

    @Test
    void databaseStoresOnlyHashNotRawToken() throws Exception {
        String email = uniqueEmail("reset");
        registerAdmin(uniqueName("Org"), email, "Password123!");
        requestReset(email).andExpect(status().isAccepted());

        String rawToken = extractTokenFromLatestMailTo(email);

        assertThat(passwordResetTokenRepository.findByTokenHash(rawToken)).isEmpty();
        assertThat(passwordResetTokenRepository
            .findByTokenHash(TokenDigest.sha256Base64Url(rawToken))).isPresent();
    }

    @Test
    void validTokenChangesPasswordAndIsSingleUse() throws Exception {
        String email = uniqueEmail("reset");
        registerAdmin(uniqueName("Org"), email, "OldPassword1!");
        requestReset(email).andExpect(status().isAccepted());

        String rawToken = extractTokenFromLatestMailTo(email);

        confirmReset(rawToken, "NewPassword1!").andExpect(status().isNoContent());

        // Old password no longer works; new password does.
        mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("email", email, "password", "OldPassword1!"))))
            .andExpect(status().isBadRequest());
        login(email, "NewPassword1!");

        // The token cannot be reused.
        confirmReset(rawToken, "AnotherPassword1!").andExpect(status().isBadRequest());
    }

    @Test
    void expiredOrInvalidTokenIsRejected() throws Exception {
        confirmReset("never-issued-token", "NewPassword1!")
            .andExpect(status().isBadRequest());
    }

    @Test
    void requestingNewResetInvalidatesPriorUnusedToken() throws Exception {
        String email = uniqueEmail("reset");
        registerAdmin(uniqueName("Org"), email, "OldPassword1!");

        requestReset(email).andExpect(status().isAccepted());
        String firstToken = extractTokenFromLatestMailTo(email);

        requestReset(email).andExpect(status().isAccepted());
        String secondToken = extractTokenFromLatestMailTo(email);

        // The first token was invalidated by the second request.
        confirmReset(firstToken, "NewPassword1!").andExpect(status().isBadRequest());
        confirmReset(secondToken, "NewPassword1!").andExpect(status().isNoContent());
    }

    @Test
    void passwordResetRevokesAllUserSessions() throws Exception {
        String email = uniqueEmail("reset");
        registerAdmin(uniqueName("Org"), email, "OldPassword1!");

        String accessToken = login(email, "OldPassword1!").get("accessToken").asText();
        mockMvc.perform(get("/auth/me")
                .header(org.springframework.http.HttpHeaders.AUTHORIZATION, bearer(accessToken)))
            .andExpect(status().isOk());

        requestReset(email).andExpect(status().isAccepted());
        confirmReset(extractTokenFromLatestMailTo(email), "NewPassword1!")
            .andExpect(status().isNoContent());

        // The pre-reset access token is now rejected.
        mockMvc.perform(get("/auth/me")
                .header(org.springframework.http.HttpHeaders.AUTHORIZATION, bearer(accessToken)))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void loginLockoutStateIsResetAfterCompletedPasswordReset() throws Exception {
        String email = uniqueEmail("reset");
        registerAdmin(uniqueName("Org"), email, "OldPassword1!");

        // A couple of failed logins accumulate without locking.
        for (int i = 0; i < 2; i++) {
            mockMvc.perform(post("/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(
                        Map.of("email", email, "password", "WrongPassword1!"))))
                .andExpect(status().isBadRequest());
        }

        assertThat(userRepository.findByEmail(email).orElseThrow().getFailedLoginAttempts())
            .isEqualTo(2);

        requestReset(email).andExpect(status().isAccepted());
        confirmReset(extractTokenFromLatestMailTo(email), "NewPassword1!")
            .andExpect(status().isNoContent());

        User user = userRepository.findByEmail(email).orElseThrow();
        assertThat(user.getFailedLoginAttempts()).isZero();
        assertThat(user.getLockedUntil()).isNull();
    }

    private org.springframework.test.web.servlet.ResultActions requestReset(String email)
        throws Exception {
        return mockMvc.perform(post("/auth/password-reset/request")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("email", email))));
    }

    private org.springframework.test.web.servlet.ResultActions confirmReset(
        String token, String newPassword) throws Exception {
        return mockMvc.perform(post("/auth/password-reset/confirm")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(
                Map.of("token", token, "newPassword", newPassword))));
    }

    private String extractTokenFromLatestMailTo(String email) {
        Matcher matcher = TOKEN_PATTERN.matcher(
            Objects.requireNonNull(latestMessageTo(email).getText()));
        assertThat(matcher.find()).isTrue();
        return matcher.group(1);
    }

    private SimpleMailMessage latestMessageTo(String email) {
        SimpleMailMessage latest = null;
        for (SimpleMailMessage message : recordingMailSender.getSentMessages()) {
            if (message.getTo() != null
                && java.util.Arrays.asList(message.getTo()).contains(email)) {
                latest = message;
            }
        }
        return Objects.requireNonNull(latest, "No reset email captured for " + email);
    }
}
