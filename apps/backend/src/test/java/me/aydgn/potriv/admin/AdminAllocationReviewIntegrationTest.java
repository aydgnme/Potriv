package me.aydgn.potriv.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.unauthenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Allocation review filters.
 *
 * <p>Allocations are only ever created by approving an assignment proposal, and
 * the console deliberately offers no way to create, approve or reverse one — so
 * these tests seed rows through the persistence layer and assert on what the
 * review page can <em>find</em>, which is the whole point of the change.
 */
class AdminAllocationReviewIntegrationTest extends AbstractAdminIntegrationTest {

    private static final DateTimeFormatter LOCAL_DATE_TIME =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");

    private static final Pattern ROW_LINK =
        Pattern.compile("/admin/allocations/([0-9a-fA-F-]{36})");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private String allocationPage(String... params) throws Exception {
        MockHttpServletRequestBuilder request = get("/admin/allocations");
        for (int i = 0; i < params.length; i += 2) {
            request = request.param(params[i], params[i + 1]);
        }
        return mockMvc.perform(authorized(request))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
    }

    private static String row(UUID allocationId) {
        return "/admin/allocations/" + allocationId;
    }

    /** Every allocation linked from a review page, in the order the page lists them. */
    private static List<String> rowsOn(String html) {
        List<String> ids = new ArrayList<>();
        Matcher matcher = ROW_LINK.matcher(html);
        while (matcher.find()) {
            ids.add(matcher.group(1));
        }
        return ids;
    }

    private static String asFilterValue(OffsetDateTime value) {
        return value.atZoneSameInstant(ZoneOffset.UTC).format(LOCAL_DATE_TIME);
    }

    private static OffsetDateTime hoursAgo(long hours) {
        return OffsetDateTime.now(ZoneOffset.UTC).minusHours(hours).truncatedTo(ChronoUnit.SECONDS);
    }

    /** One organization with a project, a department, an employee and an allocation. */
    private record Seed(
        UUID allocationId, UUID organizationId, UUID projectId,
        UUID employeeId, UUID departmentId) {
    }

    /**
     * Builds a complete allocation graph directly, in an organization of its own.
     * The product's own approval flow is exercised by the allocation module's
     * tests; what needs proving here is the console's query, so the rows are
     * written rather than negotiated.
     */
    private Seed seedAllocation(OffsetDateTime allocatedAt, OffsetDateTime deallocatedAt) {
        return seedAllocation(seedOrganization(), allocatedAt, deallocatedAt);
    }

    /**
     * A fresh, empty organization, for tests that need more than one allocation
     * inside the same one.
     *
     * <p>The review page lists at most {@code AdminPaging.DEFAULT_SIZE} (25) rows,
     * newest allocation first, and every integration test in this run shares a
     * single database. "The page contains my row" is therefore only true while the
     * rest of the suite has not already filled that first page with allocations of
     * its own -- and it does: by the time this class runs, page one is full, which
     * is exactly how these tests failed in CI while passing when the class was run
     * alone. A test that asserts on an unscoped listing is asserting on the whole
     * suite's leftovers, so the ones below scope the page to the organization they
     * just seeded and assert only about their own rows.
     */
    private UUID seedOrganization() {
        UUID organizationId = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        jdbcTemplate.update("insert into organizations "
            + "(id, created_at, updated_at, name, headquarter_address) values (?, ?, ?, ?, ?)",
            organizationId, now, now,
            "AllocOrg " + organizationId.toString().substring(0, 8), "Address 1");
        return organizationId;
    }

    /** The same graph, inside an organization the caller already seeded. */
    private Seed seedAllocation(
        UUID organizationId, OffsetDateTime allocatedAt, OffsetDateTime deallocatedAt) {
        UUID departmentId = UUID.randomUUID();
        UUID employeeId = UUID.randomUUID();
        UUID managerId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID proposalId = UUID.randomUUID();
        UUID allocationId = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        // Per-seed, not per-organization: two allocations can now share one
        // organization, and the department name and user emails below are unique.
        String suffix = allocationId.toString().substring(0, 8);

        jdbcTemplate.update("insert into departments "
            + "(id, created_at, updated_at, organization_id, name, normalized_name) "
            + "values (?, ?, ?, ?, ?, ?)",
            departmentId, now, now, organizationId, "AllocDept " + suffix, "allocdept " + suffix);
        insertUser(employeeId, organizationId, "alloc-emp-" + suffix + "@potriv.test", now);
        insertUser(managerId, organizationId, "alloc-mgr-" + suffix + "@potriv.test", now);
        jdbcTemplate.update("insert into projects "
            + "(id, created_at, updated_at, organization_id, project_manager_user_id, name, period, "
            + " start_date, status) values (?, ?, ?, ?, ?, ?, ?, ?, ?)"
,
            projectId, now, now, organizationId, managerId, "AllocProject " + suffix,
            "FIXED", java.sql.Date.valueOf("2026-01-01"), "IN_PROGRESS");
        jdbcTemplate.update("insert into project_assignment_proposals "
            + "(id, created_at, updated_at, project_id, employee_user_id, review_department_id, "
            + " work_hours_per_day, status, proposed_by_user_id, reviewed_by_user_id, reviewed_at) "
            + "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            proposalId, now, now, projectId, employeeId, departmentId, 4, "APPROVED",
            managerId, managerId, now);
        jdbcTemplate.update("insert into project_allocations "
            + "(id, created_at, updated_at, project_id, employee_user_id, assignment_proposal_id, "
            + " work_hours_per_day, allocated_at, deallocated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            allocationId, now, now, projectId, employeeId, proposalId, 4,
            allocatedAt, deallocatedAt);

        return new Seed(allocationId, organizationId, projectId, employeeId, departmentId);
    }

    private void insertUser(UUID id, UUID organizationId, String email, OffsetDateTime now) {
        jdbcTemplate.update("insert into users "
            + "(id, created_at, updated_at, organization_id, name, email, password_hash, status, "
            + " failed_login_attempts) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            id, now, now, organizationId, "Alloc User", email, "not-a-real-hash", "ACTIVE", 0);
    }

    // --------------------------------------------------------------- Access

    @Test
    void anonymousCannotReviewAllocations() throws Exception {
        mockMvc.perform(get("/admin/allocations")).andExpect(status().is3xxRedirection());
        mockMvc.perform(get("/admin/allocations/" + UUID.randomUUID()))
            .andExpect(status().is3xxRedirection());
    }

    @Test
    void nonSystemAdminCannotAuthenticateIntoTheConsole() throws Exception {
        String email = uniqueEmail("allocreview");
        registerAdmin(uniqueName("AllocReviewOrg"), email, "Password123!");

        mockMvc.perform(formLogin("/admin/login").user(email).password("Password123!"))
            .andExpect(unauthenticated());
    }

    /** The review pages are read-only: there is no allocation action to POST to. */
    @Test
    void theAllocationPagesExposeNoMutation() throws Exception {
        Seed seed = seedAllocation(hoursAgo(2), null);

        mockMvc.perform(post("/admin/allocations/" + seed.allocationId())
                .with(csrf()).session(adminSession()))
            .andExpect(status().isMethodNotAllowed());

        long before = countAllocations(seed.organizationId());
        adminGet("/admin/allocations/" + seed.allocationId()).andExpect(status().isOk());
        adminGet("/admin/allocations").andExpect(status().isOk());
        assertThat(countAllocations(seed.organizationId())).isEqualTo(before);
    }

    private long countAllocations(UUID organizationId) {
        Long count = jdbcTemplate.queryForObject(
            "select count(*) from project_allocations a join projects p on p.id = a.project_id "
                + "where p.organization_id = ?", Long.class, organizationId);
        return count == null ? 0 : count;
    }

    // -------------------------------------------------------------- Filters

    @Test
    void organizationFilterReturnsOnlyThatOrganization() throws Exception {
        Seed mine = seedAllocation(hoursAgo(2), null);
        Seed other = seedAllocation(hoursAgo(2), null);

        String html = allocationPage("organizationId", mine.organizationId().toString());

        assertThat(html).contains(row(mine.allocationId()))
            .doesNotContain(row(other.allocationId()));
    }

    @Test
    void projectEmployeeAndDepartmentFiltersEachNarrowToTheirOwnRow() throws Exception {
        Seed mine = seedAllocation(hoursAgo(2), null);
        Seed other = seedAllocation(hoursAgo(2), null);

        assertThat(allocationPage("projectId", mine.projectId().toString()))
            .contains(row(mine.allocationId())).doesNotContain(row(other.allocationId()));
        assertThat(allocationPage("employeeId", mine.employeeId().toString()))
            .contains(row(mine.allocationId())).doesNotContain(row(other.allocationId()));
        assertThat(allocationPage("departmentId", mine.departmentId().toString()))
            .contains(row(mine.allocationId())).doesNotContain(row(other.allocationId()));
    }

    @Test
    void statusFilterSeparatesActiveFromPast() throws Exception {
        UUID organizationId = seedOrganization();
        String scope = organizationId.toString();
        Seed active = seedAllocation(organizationId, hoursAgo(4), null);
        Seed past = seedAllocation(organizationId, hoursAgo(4), hoursAgo(1));

        String actives = allocationPage("organizationId", scope, "status", "ACTIVE");
        String pasts = allocationPage("organizationId", scope, "status", "PAST");

        assertThat(actives).contains(row(active.allocationId()))
            .doesNotContain(row(past.allocationId()));
        assertThat(pasts).contains(row(past.allocationId()))
            .doesNotContain(row(active.allocationId()));
    }

    @Test
    void dateBoundsExcludeAllocationsOutsideTheWindow() throws Exception {
        UUID organizationId = seedOrganization();
        String scope = organizationId.toString();
        Seed old = seedAllocation(organizationId, hoursAgo(72), null);
        Seed recent = seedAllocation(organizationId, hoursAgo(1), null);

        assertThat(allocationPage("organizationId", scope, "from", asFilterValue(hoursAgo(24))))
            .contains(row(recent.allocationId())).doesNotContain(row(old.allocationId()));
        assertThat(allocationPage("organizationId", scope, "to", asFilterValue(hoursAgo(24))))
            .contains(row(old.allocationId())).doesNotContain(row(recent.allocationId()));
    }

    @Test
    void combinedFiltersUseAndSemantics() throws Exception {
        // All three in one organization: with one organization each, the two rows
        // this asserts are filtered out were being excluded by the organization
        // filter alone, so the status and date halves of "AND" proved nothing.
        UUID organizationId = seedOrganization();
        Seed wanted = seedAllocation(organizationId, hoursAgo(2), null);
        Seed wrongStatus = seedAllocation(organizationId, hoursAgo(2), hoursAgo(1));
        Seed tooOld = seedAllocation(organizationId, hoursAgo(72), null);

        String html = allocationPage(
            "organizationId", organizationId.toString(),
            "status", "ACTIVE",
            "from", asFilterValue(hoursAgo(24)));

        assertThat(html).contains(row(wanted.allocationId()));
        assertThat(html).doesNotContain(row(wrongStatus.allocationId()), row(tooOld.allocationId()));
    }

    @Test
    void paginationPreservesFilters() throws Exception {
        UUID organizationId = seedOrganization();
        Seed first = seedAllocation(organizationId, hoursAgo(4), null);
        Seed second = seedAllocation(organizationId, hoursAgo(2), null);

        // Scoped to this organization, the page has exactly the two rows above to
        // choose from, so size=1 showing one of them is a statement about the page
        // size rather than about whatever the rest of the suite left behind.
        String page = allocationPage(
            "organizationId", organizationId.toString(), "status", "ACTIVE", "size", "1");

        assertThat(page).contains("status=ACTIVE", "size=1", "page=1");
        // Exactly one of the two seeded rows is on this page.
        assertThat(page.contains(row(first.allocationId()))
            ^ page.contains(row(second.allocationId()))).isTrue();
    }

    @Test
    void unreadableFilterValuesNarrowNothingInsteadOfFailing() throws Exception {
        Seed seed = seedAllocation(hoursAgo(2), null);

        String html = allocationPage(
            "organizationId", "not-a-uuid",
            "projectId", "1;drop table project_allocations",
            "employeeId", "<script>alert('potriv-alloc-marker')</script>",
            "departmentId", "",
            "status", "MAYBE",
            "from", "yesterday",
            "to", "31/07/2026",
            "page", "-2",
            "size", "999999");

        // Every unreadable filter value was dropped, so this lists exactly what the
        // same request without any filters lists. Asserted that way rather than as
        // "the row I just seeded is in there", which would depend on that row
        // surviving onto page one of a list every test in this run writes into.
        //
        // The comparison keeps page and size on both sides: unlike the filters,
        // those two are not dropped -- AdminPaging reads "-2" as page 0 and clamps
        // "999999" to MAX_SIZE -- so a baseline without them would be a differently
        // sized page and the two row lists could not match.
        assertThat(rowsOn(html)).isNotEmpty()
            .isEqualTo(rowsOn(allocationPage("page", "-2", "size", "999999")));
        // The seeded row is findable too; nothing above filtered it away.
        assertThat(allocationPage("organizationId", seed.organizationId().toString()))
            .contains(row(seed.allocationId()));
        // A filter form must show what was typed, so the values do come back — but
        // only escaped. The raw tag never reaches the document.
        assertThat(html).doesNotContain("<script>alert");
        assertThat(html).contains("&lt;script&gt;");
    }

    // --------------------------------------------------------------- Detail

    @Test
    void theDetailPageLinksItsContextAndHidesNothingSensitive() throws Exception {
        Seed seed = seedAllocation(hoursAgo(2), null);

        String html = adminGet("/admin/allocations/" + seed.allocationId())
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        assertThat(html)
            .contains("/admin/projects/" + seed.projectId())
            .contains("/admin/users/" + seed.employeeId())
            .contains("/admin/departments/" + seed.departmentId())
            .contains("/admin/organizations/" + seed.organizationId())
            .contains("Assignment Review", "APPROVED");
        // Pivots back into the filtered review list.
        assertThat(html).contains("organizationId=" + seed.organizationId());
        // The seeded password hash must never surface on an admin page.
        assertThat(html).doesNotContain("not-a-real-hash", "password_hash");
    }

    @Test
    void unknownAllocationReturns404() throws Exception {
        adminGet("/admin/allocations/" + UUID.randomUUID()).andExpect(status().isNotFound());
    }
}
