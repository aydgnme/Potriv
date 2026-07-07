package me.aydgn.potriv.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.AbstractMockMvcIntegrationTest;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.entity.UserSession;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.identity.repository.UserSessionRepository;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.OrganizationRepository;
import me.aydgn.potriv.support.JwtTestTokenFactory;

class JwtRbacSecurityIntegrationTest extends AbstractMockMvcIntegrationTest {

    @Autowired
    private JwtTestTokenFactory tokenFactory;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserRoleRepository userRoleRepository;

    @Autowired
    private UserSessionRepository userSessionRepository;

    @Autowired
    private OrganizationRepository organizationRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    // ---- JWT login coverage ----

    @Test
    void validCredentialsReturnAccessTokenWithExpectedClaims() throws Exception {
        String email = uniqueEmail("admin");
        JsonNode admin = registerAdmin(uniqueName("Org"), email, "Password123!");
        UUID userId = UUID.fromString(admin.get("userId").asText());

        JsonNode login = login(email, "Password123!");
        String accessToken = login.get("accessToken").asText();

        JsonNode claims = decodeClaims(accessToken);

        assertThat(claims.get("iss").asText()).isEqualTo("http://localhost:8080/api");
        assertThat(claims.get("sub").asText()).isEqualTo(userId.toString());
        assertThat(UUID.fromString(claims.get("jti").asText())).isNotNull();
        assertThat(UUID.fromString(claims.get("sid").asText())).isNotNull();
        assertThat(claims.get("token_type").asText()).isEqualTo("ACCESS");
    }

    @Test
    void wrongPasswordReturnsGenericBadRequest() throws Exception {
        String email = uniqueEmail("admin");
        registerAdmin(uniqueName("Org"), email, "Password123!");

        mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("email", email, "password", "WrongPassword1!"))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Invalid email or password."));
    }

    @Test
    void unknownEmailReturnsSamePublicErrorSemantics() throws Exception {
        mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("email", uniqueEmail("ghost"), "password", "Password123!"))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Invalid email or password."));
    }

    @Test
    void normalizedEmailLoginWorks() throws Exception {
        String localPart = "admin-" + UUID.randomUUID();
        registerAdmin(uniqueName("Org"), localPart + "@potriv.test", "Password123!");

        // Login with a mixed-case variant of the same address.
        mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("email", localPart + "@POTRIV.TEST", "password", "Password123!"))))
            .andExpect(status().isOk());
    }

    // ---- JWT failure paths (must be JSON 401) ----

    @Test
    void expiredTokenIsRejectedWith401() throws Exception {
        String token = tokenFactory
            .accessToken(UUID.randomUUID(), UUID.randomUUID())
            .expiredAt(Instant.now().minusSeconds(60))
            .build();

        expectUnauthorized(token);
    }

    @Test
    void invalidSignatureIsRejectedWith401() throws Exception {
        String token = tokenFactory
            .accessToken(UUID.randomUUID(), UUID.randomUUID())
            .signedWithForeignKey()
            .build();

        expectUnauthorized(token);
    }

    @Test
    void wrongIssuerIsRejectedWith401() throws Exception {
        String token = tokenFactory
            .accessToken(UUID.randomUUID(), UUID.randomUUID())
            .issuer("https://evil.example.com")
            .build();

        expectUnauthorized(token);
    }

    @Test
    void wrongTokenTypeIsRejectedWith401() throws Exception {
        String token = tokenFactory
            .accessToken(UUID.randomUUID(), UUID.randomUUID())
            .tokenType("REFRESH")
            .build();

        expectUnauthorized(token);
    }

    @Test
    void malformedSubjectUuidReturnsJson401() throws Exception {
        String token = tokenFactory
            .builderWithSubject("not-a-uuid", UUID.randomUUID().toString())
            .build();

        expectUnauthorized(token);
    }

    @Test
    void malformedSidUuidReturnsJson401() throws Exception {
        String token = tokenFactory
            .builderWithSubject(UUID.randomUUID().toString(), "not-a-uuid")
            .build();

        expectUnauthorized(token);
    }

    // ---- HTTP security ----

    @Test
    void noTokenOnProtectedEndpointReturnsJson401() throws Exception {
        mockMvc.perform(get("/auth/me"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    void invalidBearerTokenReturnsJson401() throws Exception {
        mockMvc.perform(get("/auth/me")
                .header(HttpHeaders.AUTHORIZATION, "Bearer not.a.valid.jwt"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    void authenticatedInsufficientRoleReturnsJson403() throws Exception {
        String email = uniqueEmail("employee-user");
        String token = createUserWithRolesAndLogin(
            organizationRepository.save(new Organization(uniqueName("Org"), "Addr")),
            email,
            List.of(AccessRole.EMPLOYEE)
        );

        mockMvc.perform(get("/test-rbac/system-admin")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.status").value(403));
    }

    @Test
    void publicRoutesRemainPublic() throws Exception {
        mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("email", uniqueEmail("x"), "password", "Password123!"))))
            .andExpect(status().isBadRequest()); // reached the handler, not a 401

        mockMvc.perform(post("/auth/password-reset/request")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("email", uniqueEmail("x")))))
            .andExpect(status().isAccepted());
    }

    @Test
    void swaggerEndpointsRemainAccessible() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
            .andExpect(status().isOk());
    }

    // ---- RBAC annotation coverage ----

    @Test
    void systemAdminOnlyAllowsSystemAdminAndDeniesOthers() throws Exception {
        String systemAdmin = systemAdminAccessToken();
        mockMvc.perform(get("/test-rbac/system-admin")
                .header(HttpHeaders.AUTHORIZATION, bearer(systemAdmin)))
            .andExpect(status().isOk());

        String employee = userWithRole(AccessRole.EMPLOYEE);
        mockMvc.perform(get("/test-rbac/system-admin")
                .header(HttpHeaders.AUTHORIZATION, bearer(employee)))
            .andExpect(status().isForbidden());
    }

    @Test
    void organizationAdminOnlyAllowsOrganizationAdmin() throws Exception {
        String orgAdmin = userWithRole(AccessRole.ORGANIZATION_ADMIN);
        mockMvc.perform(get("/test-rbac/organization-admin")
                .header(HttpHeaders.AUTHORIZATION, bearer(orgAdmin)))
            .andExpect(status().isOk());

        String employee = userWithRole(AccessRole.EMPLOYEE);
        mockMvc.perform(get("/test-rbac/organization-admin")
                .header(HttpHeaders.AUTHORIZATION, bearer(employee)))
            .andExpect(status().isForbidden());
    }

    @Test
    void departmentManagerOnlyAllowsDepartmentManager() throws Exception {
        String departmentManager = userWithRole(AccessRole.DEPARTMENT_MANAGER);
        mockMvc.perform(get("/test-rbac/department-manager")
                .header(HttpHeaders.AUTHORIZATION, bearer(departmentManager)))
            .andExpect(status().isOk());

        String employee = userWithRole(AccessRole.EMPLOYEE);
        mockMvc.perform(get("/test-rbac/department-manager")
                .header(HttpHeaders.AUTHORIZATION, bearer(employee)))
            .andExpect(status().isForbidden());
    }

    @Test
    void projectManagerOnlyAllowsProjectManager() throws Exception {
        String projectManager = userWithRole(AccessRole.PROJECT_MANAGER);
        mockMvc.perform(get("/test-rbac/project-manager")
                .header(HttpHeaders.AUTHORIZATION, bearer(projectManager)))
            .andExpect(status().isOk());

        String employee = userWithRole(AccessRole.EMPLOYEE);
        mockMvc.perform(get("/test-rbac/project-manager")
                .header(HttpHeaders.AUTHORIZATION, bearer(employee)))
            .andExpect(status().isForbidden());
    }

    @Test
    void employeeOnlyAllowsAnyAuthenticatedUser() throws Exception {
        String employee = userWithRole(AccessRole.EMPLOYEE);
        mockMvc.perform(get("/test-rbac/employee")
                .header(HttpHeaders.AUTHORIZATION, bearer(employee)))
            .andExpect(status().isOk());

        mockMvc.perform(get("/test-rbac/employee"))
            .andExpect(status().isUnauthorized());
    }

    // ---- Role freshness ----

    @Test
    void authorizationReflectsCurrentDatabaseRolesNotJwtClaims() throws Exception {
        Organization organization = organizationRepository.save(
            new Organization(uniqueName("Org"), "Addr"));
        String email = uniqueEmail("fresh");
        User user = persistUser(organization, email, List.of(AccessRole.EMPLOYEE));

        String token = loginForAccessToken(email, "Password123!");

        // With only EMPLOYEE, the department-manager endpoint is forbidden.
        mockMvc.perform(get("/test-rbac/department-manager")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isForbidden());

        // Grant the role in the database; the JWT still only claims EMPLOYEE.
        userRoleRepository.save(new UserRole(user, AccessRole.DEPARTMENT_MANAGER));

        mockMvc.perform(get("/test-rbac/department-manager")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isOk());
    }

    // ---- Session validation ----

    @Test
    void revokedSessionInvalidatesAccessTokenBeforeExpiry() throws Exception {
        String email = uniqueEmail("revoke");
        registerAdmin(uniqueName("Org"), email, "Password123!");

        JsonNode login = login(email, "Password123!");
        String token = login.get("accessToken").asText();
        UUID sessionId = UUID.fromString(decodeClaims(token).get("sid").asText());

        mockMvc.perform(get("/auth/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isOk());

        UserSession session = userSessionRepository.findById(sessionId).orElseThrow();
        session.revoke();
        userSessionRepository.save(session);

        mockMvc.perform(get("/auth/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isUnauthorized());
    }

    // ---- helpers ----

    private void expectUnauthorized(String token) throws Exception {
        mockMvc.perform(get("/auth/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(token)))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.status").value(401));
    }

    private String userWithRole(AccessRole role) throws Exception {
        Organization organization = role == AccessRole.SYSTEM_ADMIN
            ? null
            : organizationRepository.save(new Organization(uniqueName("Org"), "Addr"));

        return createUserWithRolesAndLogin(organization, uniqueEmail("role"), List.of(role));
    }

    private String createUserWithRolesAndLogin(
        Organization organization,
        String email,
        List<AccessRole> roles
    ) throws Exception {
        persistUser(organization, email, roles);
        return loginForAccessToken(email, "Password123!");
    }

    private User persistUser(Organization organization, String email, List<AccessRole> roles) {
        User user = userRepository.save(new User(
            organization,
            "Test " + email,
            email,
            passwordEncoder.encode("Password123!")
        ));

        roles.forEach(role -> userRoleRepository.save(new UserRole(user, role)));

        return user;
    }

    private JsonNode decodeClaims(String jwt) throws Exception {
        String payload = jwt.split("\\.")[1];
        byte[] decoded = Base64.getUrlDecoder().decode(payload);
        return objectMapper.readTree(decoded);
    }
}
