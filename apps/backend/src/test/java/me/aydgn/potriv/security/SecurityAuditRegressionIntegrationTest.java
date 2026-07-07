package me.aydgn.potriv.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mail.SimpleMailMessage;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.repository.SecurityAuditEventRepository;
import me.aydgn.potriv.support.RecordingMailSender;

class SecurityAuditRegressionIntegrationTest extends AbstractMockMvcIntegrationTest {

    private static final Pattern TOKEN_PATTERN = Pattern.compile("token=([A-Za-z0-9_-]+)");

    @Autowired
    private SecurityAuditEventRepository auditRepository;

    @Autowired
    private RecordingMailSender recordingMailSender;

    @Test
    void loginSuccessAndFailureAreAudited() throws Exception {
        String email = uniqueEmail("audit");
        JsonNode admin = registerAdmin(uniqueName("Org"), email, "Password123!");
        UUID userId = UUID.fromString(admin.get("userId").asText());

        mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("email", email, "password", "WrongPassword1!"))))
            .andExpect(status().isBadRequest());
        login(email, "Password123!");

        assertThat(eventsFor(userId, SecurityAuditEventType.LOGIN_FAILED)).isNotEmpty();
        assertThat(eventsFor(userId, SecurityAuditEventType.LOGIN_SUCCEEDED)).isNotEmpty();
        assertThat(eventsFor(userId, SecurityAuditEventType.ORGANIZATION_ADMIN_REGISTERED))
            .isNotEmpty();
    }

    @Test
    void accountLockIsAudited() throws Exception {
        String email = uniqueEmail("audit");
        JsonNode admin = registerAdmin(uniqueName("Org"), email, "Password123!");
        UUID userId = UUID.fromString(admin.get("userId").asText());

        for (int i = 0; i < 5; i++) {
            mockMvc.perform(post("/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(
                        Map.of("email", email, "password", "WrongPassword1!"))))
                .andExpect(status().isBadRequest());
        }

        assertThat(eventsFor(userId, SecurityAuditEventType.ACCOUNT_LOCKED)).isNotEmpty();
    }

    @Test
    void refreshAndReuseAreAudited() throws Exception {
        String email = uniqueEmail("audit");
        JsonNode admin = registerAdmin(uniqueName("Org"), email, "Password123!");
        UUID userId = UUID.fromString(admin.get("userId").asText());

        String refreshToken = login(email, "Password123!").get("refreshToken").asText();
        refresh(refreshToken);
        mockMvc.perform(post("/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("refreshToken", refreshToken))))
            .andExpect(status().isUnauthorized());

        assertThat(eventsFor(userId, SecurityAuditEventType.TOKEN_REFRESHED)).isNotEmpty();
        assertThat(eventsFor(userId, SecurityAuditEventType.REFRESH_TOKEN_REUSE_DETECTED))
            .isNotEmpty();
    }

    @Test
    void logoutIsAudited() throws Exception {
        String email = uniqueEmail("audit");
        JsonNode admin = registerAdmin(uniqueName("Org"), email, "Password123!");
        UUID userId = UUID.fromString(admin.get("userId").asText());

        String token = login(email, "Password123!").get("accessToken").asText();
        mockMvc.perform(post("/auth/logout")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isNoContent());

        assertThat(eventsFor(userId, SecurityAuditEventType.LOGOUT)).isNotEmpty();
    }

    @Test
    void passwordResetRequestAndCompletionAreAudited() throws Exception {
        String email = uniqueEmail("audit");
        JsonNode admin = registerAdmin(uniqueName("Org"), email, "OldPassword1!");
        UUID userId = UUID.fromString(admin.get("userId").asText());

        mockMvc.perform(post("/auth/password-reset/request")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email))))
            .andExpect(status().isAccepted());

        // Obtain the raw token from the recorded email, then complete the reset.
        String rawToken = extractTokenFromLatestMailTo(email);
        mockMvc.perform(post("/auth/password-reset/confirm")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("token", rawToken, "newPassword", "NewPassword1!"))))
            .andExpect(status().isNoContent());

        // eventsFor filters by userId, so both events are asserted to belong
        // to the expected user.
        assertThat(eventsFor(userId, SecurityAuditEventType.PASSWORD_RESET_REQUESTED))
            .isNotEmpty();
        assertThat(eventsFor(userId, SecurityAuditEventType.PASSWORD_RESET_COMPLETED))
            .isNotEmpty();
    }

    @Test
    void roleChangeIsAuditedWithActorAndTarget() throws Exception {
        JsonNode admin = registerAdmin(uniqueName("Org"), uniqueEmail("admin"), "Password123!");
        String employeeEmail = uniqueEmail("employee");
        JsonNode employee = registerEmployee(
            extractInviteToken(admin.get("employeeInviteUrl").asText()),
            employeeEmail, "Password123!");
        UUID employeeId = UUID.fromString(employee.get("userId").asText());

        String systemAdminToken = systemAdminAccessToken();
        UUID systemAdminId = systemAdminUserId();

        mockMvc.perform(patch("/users/" + employeeId + "/roles")
                .header(HttpHeaders.AUTHORIZATION, bearer(systemAdminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("roles", List.of("EMPLOYEE", "PROJECT_MANAGER")))))
            .andExpect(status().isOk());

        SecurityAuditEvent event = eventsFor(employeeId, SecurityAuditEventType.USER_ROLES_CHANGED)
            .get(0);
        assertThat(event.getActorUserId()).isEqualTo(systemAdminId);
        assertThat(event.getUserId()).isEqualTo(employeeId);
    }

    @Test
    void statusChangeIsAuditedWithActorAndTarget() throws Exception {
        JsonNode admin = registerAdmin(uniqueName("Org"), uniqueEmail("admin"), "Password123!");
        UUID targetId = UUID.fromString(admin.get("userId").asText());

        String systemAdminToken = systemAdminAccessToken();
        UUID systemAdminId = systemAdminUserId();

        mockMvc.perform(patch("/admin/users/" + targetId + "/status")
                .header(HttpHeaders.AUTHORIZATION, bearer(systemAdminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("status", "SUSPENDED"))))
            .andExpect(status().isOk());

        SecurityAuditEvent event = eventsFor(targetId, SecurityAuditEventType.USER_STATUS_CHANGED)
            .get(0);
        assertThat(event.getActorUserId()).isEqualTo(systemAdminId);
        assertThat(event.getUserId()).isEqualTo(targetId);
    }

    @Test
    void inviteRotationIsAudited() throws Exception {
        String email = uniqueEmail("admin");
        JsonNode admin = registerAdmin(uniqueName("Org"), email, "Password123!");
        UUID adminId = UUID.fromString(admin.get("userId").asText());
        String token = loginForAccessToken(email, "Password123!");

        mockMvc.perform(post("/organizations/current/invite/rotate")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isOk());

        assertThat(eventsFor(adminId, SecurityAuditEventType.EMPLOYEE_INVITE_ROTATED))
            .isNotEmpty();
    }

    @Test
    void auditRecordsContainNoPasswordsOrRawTokens() throws Exception {
        String email = uniqueEmail("audit");
        registerAdmin(uniqueName("Org"), email, "Password123!");
        String refreshToken = login(email, "Password123!").get("refreshToken").asText();

        for (SecurityAuditEvent event : auditRepository.findAll()) {
            String details = event.getDetails();
            if (details != null) {
                assertThat(details).doesNotContain("Password123!");
                assertThat(details).doesNotContain(refreshToken);
            }
        }
    }

    @Test
    void systemAdminCanQueryPaginatedAuditEventsAndNonAdminIsForbidden() throws Exception {
        registerAdmin(uniqueName("Org"), uniqueEmail("admin"), "Password123!");

        String response = mockMvc.perform(get("/admin/security/audit-events")
                .param("size", "5")
                .header(HttpHeaders.AUTHORIZATION, bearer(systemAdminAccessToken())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content").isArray())
            .andReturn().getResponse().getContentAsString();

        JsonNode page = objectMapper.readTree(response);
        assertThat(page.get("content").size()).isLessThanOrEqualTo(5);
        assertThat(page.get("totalElements").asLong()).isPositive();

        String employeeEmail = uniqueEmail("employee");
        JsonNode admin = registerAdmin(uniqueName("Org"), uniqueEmail("admin"), "Password123!");
        registerEmployee(extractInviteToken(admin.get("employeeInviteUrl").asText()),
            employeeEmail, "Password123!");
        String employeeToken = loginForAccessToken(employeeEmail, "Password123!");

        mockMvc.perform(get("/admin/security/audit-events")
                .header(HttpHeaders.AUTHORIZATION, bearer(employeeToken)))
            .andExpect(status().isForbidden());
    }

    @Test
    void auditFiltersWork() throws Exception {
        String email = uniqueEmail("audit");
        JsonNode admin = registerAdmin(uniqueName("Org"), email, "Password123!");
        UUID userId = UUID.fromString(admin.get("userId").asText());
        login(email, "Password123!");

        String response = mockMvc.perform(get("/admin/security/audit-events")
                .param("eventType", "LOGIN_SUCCEEDED")
                .param("userId", userId.toString())
                .header(HttpHeaders.AUTHORIZATION, bearer(systemAdminAccessToken())))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        JsonNode content = objectMapper.readTree(response).get("content");
        assertThat(content).isNotEmpty();
        content.forEach(event -> {
            assertThat(event.get("eventType").asText()).isEqualTo("LOGIN_SUCCEEDED");
            assertThat(event.get("userId").asText()).isEqualTo(userId.toString());
        });
    }

    private List<SecurityAuditEvent> eventsFor(UUID userId, SecurityAuditEventType type) {
        return auditRepository.findAll().stream()
            .filter(event -> type == event.getEventType())
            .filter(event -> userId.equals(event.getUserId()))
            .toList();
    }

    private UUID systemAdminUserId() throws Exception {
        String me = mockMvc.perform(get("/auth/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(systemAdminAccessToken())))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(me).get("userId").asText());
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
            if (message.getTo() != null && Arrays.asList(message.getTo()).contains(email)) {
                latest = message;
            }
        }
        return Objects.requireNonNull(latest, "No reset email captured for " + email);
    }
}
