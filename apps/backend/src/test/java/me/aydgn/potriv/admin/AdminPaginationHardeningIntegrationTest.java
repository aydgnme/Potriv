package me.aydgn.potriv.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.unauthenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.repository.SecurityAuditEventRepository;

/**
 * Every paginated admin list page must survive a hand-edited query string.
 *
 * <p>Pagination used to bind as {@code Integer}, so {@code ?page=abc} raised a
 * type mismatch that {@code AdminErrorAdvice} rendered as a 500. These cases run
 * the hostile inputs against each real route rather than trusting that one
 * shared helper is wired everywhere.
 */
class AdminPaginationHardeningIntegrationTest extends AbstractAdminIntegrationTest {

    @Autowired
    private SecurityAuditEventRepository auditEventRepository;

    /** Every admin route that accepts {@code page}/{@code size}. */
    static Stream<String> paginatedRoutes() {
        return Stream.of(
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

    private String renders(MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(authorized(request))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
    }

    // --------------------------------------------------- Malformed per route

    @ParameterizedTest
    @MethodSource("paginatedRoutes")
    void malformedPaginationStillRendersTheList(String route) throws Exception {
        assertThat(renders(get(route).param("page", "abc").param("size", "foo")))
            .contains("</html>");
    }

    @ParameterizedTest
    @MethodSource("paginatedRoutes")
    void negativePaginationStillRendersTheList(String route) throws Exception {
        assertThat(renders(get(route).param("page", "-5").param("size", "-10")))
            .contains("</html>");
    }

    @ParameterizedTest
    @MethodSource("paginatedRoutes")
    void oversizedPaginationStillRendersTheList(String route) throws Exception {
        assertThat(renders(get(route).param("page", "0").param("size", "999999")))
            .contains("</html>");
    }

    @ParameterizedTest
    @MethodSource("paginatedRoutes")
    void aPageFarPastTheEndStillRendersTheList(String route) throws Exception {
        assertThat(renders(get(route).param("page", "999999"))).contains("</html>");
    }

    /**
     * Two values for one parameter bind as {@code "abc,1"}, which is not a number
     * — so the outcome is the default page, deterministically, on every route.
     */
    @ParameterizedTest
    @MethodSource("paginatedRoutes")
    void repeatedPaginationParametersStillRenderTheList(String route) throws Exception {
        assertThat(renders(get(route).param("page", "abc", "1").param("size", "foo", "50")))
            .contains("</html>");
    }

    @ParameterizedTest
    @MethodSource("paginatedRoutes")
    void hostilePaginationIsNeitherExecutedNorReflected(String route) throws Exception {
        String html = renders(get(route)
            .param("page", "<script>alert('potriv-page-marker')</script>")
            .param("size", "1;drop table security_audit_events"));

        assertThat(html).doesNotContain("potriv-page-marker", "drop table");
    }

    // ------------------------------------------------- Observable normalization

    /**
     * `size=-1` used to clamp to a page size of **1** (`max(size, 1)`); it now
     * falls back to the default. Two rows in one organization make the difference
     * visible: a clamped-to-1 size would show only the newer one.
     */
    @Test
    void nonPositiveSizeFallsBackToTheDefaultRatherThanASingleRow() throws Exception {
        UUID organizationId = UUID.randomUUID();
        UUID first = saveAuditEvent(organizationId);
        UUID second = saveAuditEvent(organizationId);

        String html = renders(get("/admin/audit-logs")
            .param("organizationId", organizationId.toString()).param("size", "-1"));

        assertThat(html)
            .contains("/admin/audit-logs/" + first)
            .contains("/admin/audit-logs/" + second);
    }

    /**
     * The audit page's size dropdown is the one place the effective page size is
     * visible, so it doubles as proof that normalization and clamping happened —
     * and that the hostile text was replaced rather than echoed.
     */
    @Test
    void theEffectiveSizeIsWhatTheOperatorSees() throws Exception {
        String hostile = renders(get("/admin/audit-logs")
            .param("size", "1;drop table security_audit_events"));
        String oversized = renders(get("/admin/audit-logs").param("size", "999999"));

        assertThat(hostile)
            .doesNotContain("drop table")
            .contains("<option value=\"" + AdminPaging.DEFAULT_SIZE + "\" selected=\"selected\">");
        assertThat(oversized)
            .contains("<option value=\"" + AdminPaging.MAX_SIZE + "\" selected=\"selected\">");
    }

    // ------------------------------------------------ OPS-02 filters intact

    @Test
    void auditFiltersStillApplyWhenPaginationIsMalformed() throws Exception {
        UUID organizationId = UUID.randomUUID();
        UUID otherOrganization = UUID.randomUUID();
        UUID wanted = saveAuditEvent(organizationId);
        UUID elsewhere = saveAuditEvent(otherOrganization);

        String html = renders(get("/admin/audit-logs")
            .param("eventType", SecurityAuditEventType.LOGIN_SUCCEEDED.name())
            .param("organizationId", organizationId.toString())
            .param("page", "abc")
            .param("size", "foo"));

        assertThat(html)
            .contains("/admin/audit-logs/" + wanted)
            .doesNotContain("/admin/audit-logs/" + elsewhere);
    }

    // ------------------------------------------------- Boundary still holds

    @ParameterizedTest
    @MethodSource("paginatedRoutes")
    void anonymousIsStillTurnedAwayEvenWithHostilePagination(String route) throws Exception {
        mockMvc.perform(get(route).param("page", "abc").param("size", "999999"))
            .andExpect(status().is3xxRedirection());
    }

    @Test
    void nonSystemAdminStillCannotAuthenticateIntoTheConsole() throws Exception {
        String email = uniqueEmail("pagination");
        registerAdmin(uniqueName("PaginationOrg"), email, "Password123!");

        mockMvc.perform(formLogin("/admin/login").user(email).password("Password123!"))
            .andExpect(unauthenticated());
    }

    private UUID saveAuditEvent(UUID organizationId) {
        return auditEventRepository.save(
            SecurityAuditEvent.builder(SecurityAuditEventType.LOGIN_SUCCEEDED, true)
                .organizationId(organizationId).build()).getId();
    }
}
