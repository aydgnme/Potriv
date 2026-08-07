package me.aydgn.potriv.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Two {@code @RestController}s live under {@code /admin/**}:
 * {@code AdminSecurityAuditController} at {@code /admin/security} and
 * {@code AdminUserController} at {@code /admin/users}. They are Bearer-JWT REST
 * operations, declared in OpenAPI, guarded by {@code @SystemAdminOnly}.
 *
 * <p>The console's own chain matches {@code /admin/**} at {@code @Order(0)}, so
 * while the console was enabled it also owned those two paths — and a session
 * chain has no idea what a Bearer token is. The REST operations answered 302
 * (redirect to the console login) and 403 instead of working. Turning the
 * console on silently removed two documented API operations.
 *
 * <p>This class runs with the console **enabled**, which is the condition that
 * produced the defect, and pins both halves of the boundary: the REST operations
 * work over JWT, and the console pages remain session-only.
 */
class AdminRestApiBoundaryIntegrationTest extends AbstractAdminIntegrationTest {

    private static final String AUDIT_EVENTS = "/admin/security/audit-events";

    private String systemAdminToken() throws Exception {
        return systemAdminAccessToken();
    }

    /** An organization admin — authenticated, but not a platform administrator. */
    private String organizationAdminToken() throws Exception {
        String email = uniqueEmail("rest-boundary");
        registerAdmin(uniqueName("RestBoundaryOrg"), email, "Password123!");
        return loginForAccessToken(email, "Password123!");
    }

    private UUID someUserId() throws Exception {
        JsonNode admin = registerAdmin(uniqueName("BoundaryTarget"),
            uniqueEmail("boundary-target"), "Password123!");
        return UUID.fromString(admin.get("userId").asText());
    }

    // ------------------------------------------------- REST over JWT works

    @Test
    void systemAdminReachesTheAuditRestApiWithABearerToken() throws Exception {
        mockMvc.perform(get(AUDIT_EVENTS)
                .header(HttpHeaders.AUTHORIZATION, bearer(systemAdminToken())))
            .andExpect(status().isOk());
    }

    @Test
    void systemAdminChangesUserStatusThroughTheRestApi() throws Exception {
        UUID userId = someUserId();

        mockMvc.perform(patch("/admin/users/" + userId + "/status")
                .header(HttpHeaders.AUTHORIZATION, bearer(systemAdminToken()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("status", "SUSPENDED"))))
            .andExpect(status().isOk());
    }

    // ------------------------------------------ …with the REST contract

    /**
     * 401, not a redirect. Every other protected REST operation answers 401 for an
     * anonymous caller; these two answered 302/403 while the console owned them,
     * which made the API's authentication contract inconsistent.
     */
    @Test
    void anonymousGetsUnauthorizedFromTheRestApiRatherThanAConsoleRedirect() throws Exception {
        mockMvc.perform(get(AUDIT_EVENTS)).andExpect(status().isUnauthorized());
        mockMvc.perform(patch("/admin/users/" + UUID.randomUUID() + "/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("status", "ACTIVE"))))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void anAuthenticatedNonSystemAdminIsForbidden() throws Exception {
        String token = organizationAdminToken();

        mockMvc.perform(get(AUDIT_EVENTS).header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isForbidden());
        mockMvc.perform(patch("/admin/users/" + someUserId() + "/status")
                .header(HttpHeaders.AUTHORIZATION, bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("status", "SUSPENDED"))))
            .andExpect(status().isForbidden());
    }

    /** The REST chain is stateless: a console session grants nothing there. */
    @Test
    void aConsoleSessionDoesNotAuthorizeTheRestApi() throws Exception {
        mockMvc.perform(get(AUDIT_EVENTS).session(adminSession()))
            .andExpect(status().isUnauthorized());
    }

    // ------------------------------------- …and the console is untouched

    @Test
    void consolePagesStillRequireABrowserSession() throws Exception {
        mockMvc.perform(get("/admin/users")).andExpect(status().is3xxRedirection());
        mockMvc.perform(get("/admin/audit-logs")).andExpect(status().is3xxRedirection());
    }

    /** A Bearer token must never open a console page — the chains stay separate. */
    @Test
    void aBearerTokenDoesNotOpenConsolePages() throws Exception {
        String token = systemAdminToken();

        mockMvc.perform(get("/admin/users").header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().is3xxRedirection());
        mockMvc.perform(get("/admin/monitor").header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().is3xxRedirection());
    }

    @Test
    void theConsoleStillServesItsOwnPagesToASignedInAdministrator() throws Exception {
        String html = adminGet("/admin/users")
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        assertThat(html).contains("Potriv Admin");
    }

    /**
     * The console's user pages share the {@code /admin/users} prefix with the REST
     * operation; only the PATCH belongs to the API. This pins that the console's
     * own POST actions still live on the session chain.
     *
     * <p>403 is the evidence, not a redirect: CSRF is evaluated before the login
     * redirect, and only the console chain has CSRF enabled. The stateless REST
     * chain would have answered 401 — so a 403 here proves the request never left
     * the session chain.
     */
    @Test
    void consoleUserActionsStayOnTheSessionChain() throws Exception {
        UUID userId = someUserId();

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .post("/admin/users/" + userId + "/suspend"))
            .andExpect(status().isForbidden());
    }
}
