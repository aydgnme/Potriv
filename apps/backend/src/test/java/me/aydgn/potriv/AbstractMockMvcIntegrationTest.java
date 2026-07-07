package me.aydgn.potriv;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
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

    protected static String extractInviteToken(String inviteUrl) {
        return inviteUrl.substring(inviteUrl.indexOf("token=") + "token=".length());
    }

    protected static String bearer(String accessToken) {
        return "Bearer " + accessToken;
    }
}
