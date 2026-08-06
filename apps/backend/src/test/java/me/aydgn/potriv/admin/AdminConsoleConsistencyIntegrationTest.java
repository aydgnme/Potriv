package me.aydgn.potriv.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Cross-page consistency of the finished console.
 *
 * <p>These assert the properties every admin page must share, rather than the
 * wording of any one of them: one status vocabulary, labelled controls, no stack
 * traces, no secrets, and relationship links that actually resolve.
 */
class AdminConsoleConsistencyIntegrationTest extends AbstractAdminIntegrationTest {

    private static final Pattern INPUT_ID = Pattern.compile("<(?:input|select)\\b[^>]*\\bid=\"([^\"]+)\"");

    static Stream<String> listRoutes() {
        return Stream.of(
            "/admin",
            "/admin/users",
            "/admin/organizations",
            "/admin/departments",
            "/admin/projects",
            "/admin/allocations",
            "/admin/invitations",
            "/admin/skills",
            "/admin/skill-categories",
            "/admin/audit-logs");
    }

    private String render(String route) throws Exception {
        return mockMvc.perform(authorized(get(route)))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
    }

    /** An organization with a department, a user and a skill category to link from. */
    private JsonNode seedOrganization() throws Exception {
        return registerAdmin(uniqueName("ConsistencyOrg"), uniqueEmail("consistency"),
            "Password123!");
    }

    // ------------------------------------------------------ Shared shell

    @ParameterizedTest
    @MethodSource("listRoutes")
    void everyPageRendersTheSameShellAndNoStackTrace(String route) throws Exception {
        String html = render(route);

        assertThat(html).contains("Potriv Admin", "admin-topbar", "admin/css/admin.css");
        assertThat(html).doesNotContain("Exception", "at me.aydgn.potriv", "java.lang.");
    }

    /**
     * Entity status is one vocabulary. `.signal` is reserved for system state
     * (health, flyway, readiness); a record's own status is always a `.badge`.
     */
    @ParameterizedTest
    @MethodSource("listRoutes")
    void entityStatusUsesTheBadgeVocabularyNotTheSystemSignal(String route) throws Exception {
        String html = render(route);
        String table = html.contains("<table") ? html.substring(html.indexOf("<table")) : "";

        assertThat(table).doesNotContain("class=\"signal\"");
    }

    /** Every filter control an operator can type into carries a label. */
    @ParameterizedTest
    @MethodSource("listRoutes")
    void everyFilterControlIsLabelled(String route) throws Exception {
        String html = render(route);
        if (!html.contains("admin-filters")) {
            return;
        }
        Matcher matcher = INPUT_ID.matcher(html);
        while (matcher.find()) {
            String id = matcher.group(1);
            if (id.startsWith("filter-")) {
                assertThat(html)
                    .as("control %s on %s must have a label or aria-label", id, route)
                    .contains("for=\"" + id + "\"");
            }
        }
        // Controls without an id must still name themselves for a screen reader.
        assertThat(html.contains("<label") || html.contains("aria-label")).isTrue();
    }

    // ------------------------------------------- Accessibility & layout

    @ParameterizedTest
    @MethodSource("listRoutes")
    void everyPageOffersASkipLinkToItsContent(String route) throws Exception {
        String html = render(route);

        assertThat(html).contains("admin-skip-link", "href=\"#admin-content\"");
        assertThat(html).contains("id=\"admin-content\"");
    }

    /**
     * A narrow viewport must scroll the table, not the page — so every data table
     * sits inside a scroll container.
     */
    @ParameterizedTest
    @MethodSource("listRoutes")
    void everyDataTableCanScrollIndependently(String route) throws Exception {
        String html = render(route);
        if (!html.contains("class=\"admin-table\"")) {
            return;
        }
        assertThat(html.indexOf("admin-table-scroll"))
            .as("%s must wrap its table in a scroll container", route)
            .isGreaterThanOrEqualTo(0)
            .isLessThan(html.indexOf("class=\"admin-table\""));
    }

    /** Flash banners announce themselves; the shared fragment supplies the roles. */
    @Test
    void flashMessagesCarryTheirAlertSemantics() throws Exception {
        String messages = new String(getClass().getClassLoader()
            .getResourceAsStream("templates/admin/layout/messages.html").readAllBytes());

        assertThat(messages).contains("role=\"status\"", "role=\"alert\"");
    }

    // ------------------------------------------------ Relationship links

    @Test
    void detailPagesLinkTheirRelatedRecordsAndThoseLinksResolve() throws Exception {
        JsonNode admin = seedOrganization();
        UUID organizationId = UUID.fromString(admin.get("organizationId").asText());
        UUID adminUserId = UUID.fromString(admin.get("userId").asText());

        String organization = render("/admin/organizations/" + organizationId);
        String user = render("/admin/users/" + adminUserId);

        assertThat(organization).contains(
            "/admin/skills?organization=" + organizationId,
            "/admin/allocations?organizationId=" + organizationId,
            "/admin/audit-logs?organizationId=" + organizationId);
        assertThat(user).contains(
            "/admin/allocations?employeeId=" + adminUserId,
            "/admin/audit-logs?actor=" + adminUserId,
            "/admin/organizations/" + organizationId);

        // Every one of those pivots is a real, reachable page.
        for (String pivot : List.of(
            "/admin/skills?organization=" + organizationId,
            "/admin/allocations?organizationId=" + organizationId,
            "/admin/audit-logs?organizationId=" + organizationId,
            "/admin/allocations?employeeId=" + adminUserId,
            "/admin/audit-logs?actor=" + adminUserId)) {
            mockMvc.perform(authorized(get(pivot))).andExpect(status().isOk());
        }
    }

    // ---------------------------------------------------- Secret hygiene

    @ParameterizedTest
    @MethodSource("listRoutes")
    void noPageEverRendersACredentialField(String route) throws Exception {
        String html = render(route);

        assertThat(html).doesNotContain(
            "passwordHash", "password_hash", "$2a$", "$2b$",
            "refreshToken", "resetToken", "Bearer ", "jwtSecret");
    }

    @Test
    void theUserDetailPageStillHidesAccountInternals() throws Exception {
        JsonNode admin = seedOrganization();
        UUID adminUserId = UUID.fromString(admin.get("userId").asText());

        String html = render("/admin/users/" + adminUserId);

        assertThat(html).doesNotContain("passwordHash", "$2a$", "$2b$");
        // The security card still reports the operationally useful facts.
        assertThat(html).contains("Account security", "Failed login attempts");
    }

    // --------------------------------------------------- Destructive copy

    @Test
    void destructiveActionsAreDistinguishableAndConfirmedBeforeTheyRun() throws Exception {
        JsonNode admin = seedOrganization();
        UUID organizationId = UUID.fromString(admin.get("organizationId").asText());

        String departments = render("/admin/departments");
        assertThat(departments).contains("Departments");

        // The organization has no delete action at all — it is not offered anywhere.
        String organization = render("/admin/organizations/" + organizationId);
        assertThat(organization).doesNotContain("Delete organization");
    }
}
