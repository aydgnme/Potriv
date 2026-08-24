package me.aydgn.potriv.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.identity.service.InviteUrlFactory;
import me.aydgn.potriv.identity.service.PasswordResetUrlFactory;

/**
 * Where a credential is allowed to travel.
 *
 * A request target is the most widely copied part of an HTTP exchange. The
 * servlet container logs it, every reverse proxy in front of it logs it, request
 * tracing records it, and this application's own error bodies name the path that
 * failed. None of that is a misconfiguration to be fixed — it is what URLs are
 * for. So a token in a path or a query string is disclosed by default, in
 * systems whose retention nobody here controls.
 *
 * A request body is none of those things: nothing in this application writes one
 * anywhere, and no infrastructure records it by default.
 *
 * These tests hold the rule rather than any one route. The reflective test is
 * the one that matters most — it fails for an endpoint nobody has written yet.
 */
class TokenTransportIntegrationTest extends AbstractMockMvcIntegrationTest {

    private static final String PASSWORD = "Password123!";

    /**
     * Path variables whose name says they carry a credential. Matching by name
     * is deliberate: it catches the mistake at the moment somebody writes it,
     * and it reads as the rule it enforces.
     */
    private static final List<String> CREDENTIAL_VARIABLES = List.of(
        "{token}", "{inviteToken}", "{resetToken}", "{passwordResetToken}",
        "{refreshToken}", "{accessToken}", "{secret}", "{apiKey}");

    /*
      Named explicitly: the actuator contributes a second mapping of this type,
      and the one under test is the application's own.
    */
    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    private RequestMappingHandlerMapping handlerMapping;

    @Autowired
    private InviteUrlFactory inviteUrlFactory;

    @Autowired
    private PasswordResetUrlFactory passwordResetUrlFactory;

    // ---- the rule, over every route that exists ----

    @Test
    @DisplayName("no controller mapping carries a credential in its path")
    void noRouteTemplateContainsACredentialVariable() {
        List<String> offenders = new ArrayList<>();

        for (RequestMappingInfo info : handlerMapping.getHandlerMethods().keySet()) {
            for (String pattern : patternsOf(info)) {
                String lower = pattern.toLowerCase(java.util.Locale.ROOT);
                for (String variable : CREDENTIAL_VARIABLES) {
                    if (lower.contains(variable.toLowerCase(java.util.Locale.ROOT))) {
                        offenders.add(pattern);
                    }
                }
            }
        }

        assertThat(offenders)
            .as("a credential must be a request body field, never a path variable")
            .isEmpty();
    }

    @Test
    @DisplayName("the registration route is fixed")
    void theEmployeeRegistrationRouteHasNoVariableSegment() {
        List<String> registration = new ArrayList<>();
        for (RequestMappingInfo info : handlerMapping.getHandlerMethods().keySet()) {
            for (String pattern : patternsOf(info)) {
                if (pattern.startsWith("/auth/register-employee")) registration.add(pattern);
            }
        }

        assertThat(registration).containsExactly("/auth/register-employee");
    }

    // ---- what the server actually saw ----

    @Test
    @DisplayName("the token reaches the server in the body and nowhere else")
    void theRequestTargetNeverContainsTheToken() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);

        String employeeEmail = uniqueEmail("employee");
        inviteEmployee(adminToken, employeeEmail);
        String rawToken = inviteTokenFromMailTo(employeeEmail);

        var result = mockMvc.perform(post("/auth/register-employee")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "token", rawToken,
                    "name", "Recipient",
                    "email", employeeEmail,
                    "password", PASSWORD))))
            .andExpect(status().isCreated())
            .andReturn();

        var request = result.getRequest();

        // The three places a server records "what was asked for".
        assertThat(request.getRequestURI()).isEqualTo("/auth/register-employee");
        assertThat(request.getRequestURI()).doesNotContain(rawToken);
        assertThat(request.getQueryString()).isNull();
        assertThat(request.getParameterMap()).isEmpty();

        // And no header carries it either — not Authorization, not a custom one.
        for (String header : java.util.Collections.list(request.getHeaderNames())) {
            for (String value : java.util.Collections.list(request.getHeaders(header))) {
                assertThat(value)
                    .as("header %s must not carry the invite token", header)
                    .doesNotContain(rawToken);
            }
        }

        // The success response does not hand it back.
        assertThat(result.getResponse().getContentAsString()).doesNotContain(rawToken);
    }

    @Test
    @DisplayName("a failed registration echoes no token, in any field")
    void theErrorResponseNeverContainsTheToken() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);

        String invitedEmail = uniqueEmail("invited");
        inviteEmployee(adminToken, invitedEmail);
        String rawToken = inviteTokenFromMailTo(invitedEmail);

        // Redeemed by the wrong person: a real token, a rejected request. This
        // is the case where an error body most plausibly repeats its input.
        String body = mockMvc.perform(post("/auth/register-employee")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "token", rawToken,
                    "name", "Interloper",
                    "email", uniqueEmail("interloper"),
                    "password", PASSWORD))))
            .andExpect(status().isBadRequest())
            .andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain(rawToken);
        assertThat(body).doesNotContain("token=");
        assertThat(body).doesNotMatch(".*[A-Za-z0-9_-]{43}.*");
    }

    @Test
    @DisplayName("a validation failure names the field, never its value")
    void validationErrorsDoNotEchoTheRejectedValue() throws Exception {
        // A token long enough to be rejected by @Size, so the handler has a
        // reason to mention this field at all.
        String overlongToken = "t".repeat(600);

        String body = mockMvc.perform(post("/auth/register-employee")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "token", overlongToken,
                    "name", "Applicant",
                    "email", uniqueEmail("applicant"),
                    "password", PASSWORD))))
            .andExpect(status().isBadRequest())
            .andReturn().getResponse().getContentAsString();

        // Naming the field is useful; repeating what was sent is not.
        assertThat(body).doesNotContain(overlongToken);
    }

    // ---- responses that must not be stored ----

    @Test
    @DisplayName("credential-bearing responses are not cacheable")
    void sensitiveResponsesSayNoStore() throws Exception {
        String adminEmail = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), adminEmail, PASSWORD);
        String adminToken = loginForAccessToken(adminEmail, PASSWORD);

        String employeeEmail = uniqueEmail("employee");
        inviteEmployee(adminToken, employeeEmail);
        String rawToken = inviteTokenFromMailTo(employeeEmail);

        MockHttpServletResponse registration = mockMvc.perform(post("/auth/register-employee")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "token", rawToken,
                    "name", "Recipient",
                    "email", employeeEmail,
                    "password", PASSWORD))))
            .andExpect(status().isCreated())
            .andReturn().getResponse();

        MockHttpServletResponse login = mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "email", employeeEmail, "password", PASSWORD))))
            .andExpect(status().isOk())
            .andReturn().getResponse();

        for (MockHttpServletResponse response : List.of(registration, login)) {
            assertThat(response.getHeader(HttpHeaders.CACHE_CONTROL))
                .as("a response carrying or creating credentials must not be stored")
                .isNotNull()
                .contains("no-store");
        }
    }

    // ---- the links that start these flows ----

    @Test
    @DisplayName("both emailed links keep their token in the fragment")
    void emailedLinksCarryTheirTokenWhereNoServerSeesIt() {
        for (String url : List.of(
            inviteUrlFactory.build("a-token-value"),
            passwordResetUrlFactory.build("a-token-value"))) {

            String serverVisible = url.substring(0, url.indexOf('#'));

            assertThat(url).contains("#token=");
            assertThat(serverVisible).doesNotContain("a-token-value");
            assertThat(serverVisible).doesNotContain("token=");
            assertThat(serverVisible).doesNotContain("?");
        }
    }

    private static List<String> patternsOf(RequestMappingInfo info) {
        if (info.getPathPatternsCondition() != null) {
            return info.getPathPatternsCondition().getPatterns().stream()
                .map(Object::toString)
                .toList();
        }
        return List.copyOf(info.getPatternValues());
    }
}
