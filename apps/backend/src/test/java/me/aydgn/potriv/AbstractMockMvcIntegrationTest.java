package me.aydgn.potriv;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mail.SimpleMailMessage;
import me.aydgn.potriv.support.RecordingMailSender;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Foundation for HTTP-level integration tests running through the real
 * security filter chain against Testcontainers PostgreSQL.
 */
@AutoConfigureMockMvc
public abstract class AbstractMockMvcIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper objectMapper;

    protected static String uniqueEmail(String prefix) {
        return prefix + "-" + UUID.randomUUID() + "@potriv.test";
    }

    protected static String uniqueName(String prefix) {
        return prefix + " " + UUID.randomUUID();
    }

    @org.springframework.beans.factory.annotation.Autowired
    protected RecordingMailSender recordingMailSender;

    protected JsonNode registerAdmin(String organizationName, String email, String password)
        throws Exception {

        String body = objectMapper.writeValueAsString(Map.of(
            "name", "Admin of " + organizationName,
            "email", email,
            "password", password,
            "organizationName", organizationName,
            "headquarterAddress", "Test Address 1"
        ));

        String response = mockMvc
            .perform(post("/auth/register-admin")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();

        return objectMapper.readTree(response);
    }

    protected JsonNode registerEmployee(String inviteToken, String email, String password)
        throws Exception {

        String body = objectMapper.writeValueAsString(Map.of(
            "name", "Employee " + email,
            "email", email,
            "password", password
        ));

        String response = mockMvc
            .perform(post("/auth/register-employee/" + inviteToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();

        return objectMapper.readTree(response);
    }

    /**
     * Invites an address and registers it, which is now the only way an
     * employee account comes into being.
     *
     * The token is read out of the email, because that is the only place it
     * exists: the invite response carries metadata and a masked address, never
     * a link. Tests going through the mail is not a workaround — it is the same
     * path a real recipient takes, and it would fail loudly if the token ever
     * started appearing in the API response instead.
     */
    protected JsonNode inviteAndRegisterEmployee(
        String adminToken, String email, String password
    ) throws Exception {
        inviteEmployee(adminToken, email);
        return registerEmployee(inviteTokenFromMailTo(email), email, password);
    }

    /** Issues an invite and returns the administrator-visible metadata. */
    protected JsonNode inviteEmployee(String adminToken, String email) throws Exception {
        String response = mockMvc
            .perform(post("/organizations/current/invites")
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email))))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();

        return objectMapper.readTree(response);
    }

    /**
     * The raw invite token, taken from the message actually sent to it.
     *
     * The comparison is case-insensitive because the backend normalises the
     * address before it stores or mails anything, so a caller that invited
     * {@code Sam@…} is looked up against a message addressed to {@code sam@…}.
     * Matching exactly would make this helper disagree with the system it is
     * testing, over the very normalisation the invite's security depends on.
     */
    protected String inviteTokenFromMailTo(String email) {
        String wanted = email.trim().toLowerCase(java.util.Locale.ROOT);
        SimpleMailMessage latest = null;
        for (SimpleMailMessage message : recordingMailSender.getSentMessages()) {
            if (message.getTo() == null) continue;
            for (String recipient : message.getTo()) {
                if (recipient != null
                    && recipient.trim().toLowerCase(java.util.Locale.ROOT).equals(wanted)) {
                    latest = message;
                }
            }
        }
        String body = java.util.Objects.requireNonNull(
            java.util.Objects.requireNonNull(latest, "No invite email captured for " + email)
                .getText());

        java.util.regex.Matcher matcher =
            java.util.regex.Pattern.compile("token=([A-Za-z0-9_-]+)").matcher(body);
        if (!matcher.find()) {
            throw new IllegalStateException("No invite token in the email sent to " + email);
        }
        return matcher.group(1);
    }

    protected JsonNode login(String email, String password) throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
            "email", email,
            "password", password
        ));

        String response = mockMvc
            .perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        return objectMapper.readTree(response);
    }

    protected String loginForAccessToken(String email, String password) throws Exception {
        return login(email, password).get("accessToken").asText();
    }

    protected String systemAdminAccessToken() throws Exception {
        return loginForAccessToken(SYSTEM_ADMIN_EMAIL, SYSTEM_ADMIN_PASSWORD);
    }

    protected JsonNode refresh(String refreshToken) throws Exception {
        String body = objectMapper.writeValueAsString(Map.of("refreshToken", refreshToken));

        String response = mockMvc
            .perform(post("/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        return objectMapper.readTree(response);
    }

    protected static String extractInviteToken(String inviteUrl) {
        return inviteUrl.substring(inviteUrl.indexOf("token=") + "token=".length());
    }

    protected static String bearer(String accessToken) {
        return "Bearer " + accessToken;
    }
}
