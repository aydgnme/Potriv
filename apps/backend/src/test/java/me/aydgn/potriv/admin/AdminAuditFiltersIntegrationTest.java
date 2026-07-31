package me.aydgn.potriv.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.unauthenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.repository.SecurityAuditEventRepository;

/**
 * Read-only audit review filters.
 *
 * <p>The integration database accumulates audit rows from every other test, so
 * each case seeds its own events under a unique {@code organizationId} marker
 * and asserts on the <em>row links</em> the page renders. Asserting on event-type
 * text would be meaningless: the filter form's dropdown lists every enum value,
 * so every type name appears on every render.
 */
class AdminAuditFiltersIntegrationTest extends AbstractAdminIntegrationTest {

    /** What the browser's {@code datetime-local} control submits. */
    private static final DateTimeFormatter LOCAL_DATE_TIME =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");

    @Autowired
    private SecurityAuditEventRepository auditEventRepository;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    // ------------------------------------------------------------- Fixtures

    private UUID save(SecurityAuditEvent.Builder builder) {
        return auditEventRepository.save(builder.build()).getId();
    }

    /**
     * Moves a seeded row back in time. {@code createdAt} is {@code updatable=false}
     * by design, so date filters can only be exercised from outside JPA.
     */
    private void backdate(UUID id, OffsetDateTime when) {
        jdbcTemplate.update(
            "UPDATE security_audit_events SET created_at = ? WHERE id = ?", when, id);
    }

    private static OffsetDateTime hoursAgo(long hours) {
        return OffsetDateTime.now(ZoneOffset.UTC).minusHours(hours).truncatedTo(ChronoUnit.SECONDS);
    }

    private static String asFilterValue(OffsetDateTime value) {
        return value.atZoneSameInstant(ZoneOffset.UTC).format(LOCAL_DATE_TIME);
    }

    /** The row link the list page renders for an event; unique per event. */
    private static String row(UUID eventId) {
        return "/admin/audit-logs/" + eventId;
    }

    private String auditPage(String... params) throws Exception {
        MockHttpServletRequestBuilder request = get("/admin/audit-logs");
        for (int i = 0; i < params.length; i += 2) {
            request = request.param(params[i], params[i + 1]);
        }
        return mockMvc.perform(authorized(request))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
    }

    // --------------------------------------------------------------- Access

    @Test
    void anonymousCannotViewTheAuditPage() throws Exception {
        mockMvc.perform(get("/admin/audit-logs")).andExpect(status().is3xxRedirection());
        mockMvc.perform(get("/admin/audit-logs").param("eventType", "LOGIN_SUCCEEDED"))
            .andExpect(status().is3xxRedirection());
    }

    @Test
    void nonSystemAdminCannotAuthenticateIntoTheConsole() throws Exception {
        String email = uniqueEmail("auditviewer");
        registerAdmin(uniqueName("AuditViewerOrg"), email, "Password123!");

        mockMvc.perform(formLogin("/admin/login").user(email).password("Password123!"))
            .andExpect(unauthenticated());
    }

    @Test
    void systemAdminCanViewTheAuditPage() throws Exception {
        assertThat(auditPage()).contains("Audit Logs", "Apply filters");
    }

    // ------------------------------------------------------------- Ordering

    @Test
    void defaultOrderingIsNewestFirstAndStable() throws Exception {
        UUID organizationId = UUID.randomUUID();
        UUID oldest = save(event(SecurityAuditEventType.LOGIN_SUCCEEDED, organizationId));
        UUID middle = save(event(SecurityAuditEventType.LOGIN_SUCCEEDED, organizationId));
        UUID newest = save(event(SecurityAuditEventType.LOGIN_SUCCEEDED, organizationId));
        // The last two share a timestamp, so only the id tiebreaker can order them.
        OffsetDateTime shared = hoursAgo(1);
        backdate(oldest, hoursAgo(3));
        backdate(middle, shared);
        backdate(newest, shared);

        String first = auditPage("organizationId", organizationId.toString());
        String second = auditPage("organizationId", organizationId.toString());

        assertThat(first.indexOf(row(oldest)))
            .isGreaterThan(first.indexOf(row(middle)))
            .isGreaterThan(first.indexOf(row(newest)));
        // Same request, same order — equal timestamps must not shuffle between pages.
        assertThat(second.indexOf(row(middle)) < second.indexOf(row(newest)))
            .isEqualTo(first.indexOf(row(middle)) < first.indexOf(row(newest)));
    }

    // -------------------------------------------------------------- Filters

    @Test
    void eventTypeFilterReturnsOnlyThatType() throws Exception {
        UUID organizationId = UUID.randomUUID();
        UUID revoked = save(event(SecurityAuditEventType.ADMIN_INVITATION_REVOKED, organizationId));
        UUID login = save(event(SecurityAuditEventType.LOGIN_SUCCEEDED, organizationId));

        String html = auditPage(
            "organizationId", organizationId.toString(),
            "eventType", SecurityAuditEventType.ADMIN_INVITATION_REVOKED.name());

        assertThat(html).contains(row(revoked)).doesNotContain(row(login));
    }

    @Test
    void organizationFilterReturnsOnlyThatOrganization() throws Exception {
        UUID mine = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        UUID kept = save(event(SecurityAuditEventType.LOGIN_SUCCEEDED, mine));
        UUID excluded = save(event(SecurityAuditEventType.LOGIN_SUCCEEDED, other));

        String html = auditPage("organizationId", mine.toString());

        assertThat(html).contains(row(kept)).doesNotContain(row(excluded));
    }

    @Test
    void outcomeFilterSeparatesSuccessFromFailure() throws Exception {
        UUID organizationId = UUID.randomUUID();
        UUID succeeded = save(SecurityAuditEvent
            .builder(SecurityAuditEventType.LOGIN_SUCCEEDED, true).organizationId(organizationId));
        UUID failed = save(SecurityAuditEvent
            .builder(SecurityAuditEventType.LOGIN_FAILED, false).organizationId(organizationId));

        String successes = auditPage(
            "organizationId", organizationId.toString(), "outcome", "success");
        String failures = auditPage(
            "organizationId", organizationId.toString(), "outcome", "failure");

        assertThat(successes).contains(row(succeeded)).doesNotContain(row(failed));
        assertThat(failures).contains(row(failed)).doesNotContain(row(succeeded));
    }

    /**
     * The audit table stores an actor two ways — a normalized email on
     * authentication events and raw user ids on administrative ones — so the
     * single actor box has to match both.
     */
    @Test
    void actorFilterMatchesStoredEmailAndUserIds() throws Exception {
        UUID organizationId = UUID.randomUUID();
        String email = uniqueEmail("audit-actor");
        UUID actorUserId = UUID.randomUUID();
        UUID byEmail = save(SecurityAuditEvent
            .builder(SecurityAuditEventType.LOGIN_SUCCEEDED, true)
            .organizationId(organizationId).normalizedEmail(email));
        UUID byId = save(SecurityAuditEvent
            .builder(SecurityAuditEventType.ADMIN_USER_ROLE_GRANTED, true)
            .organizationId(organizationId).actorUserId(actorUserId));

        String emailMatch = auditPage("actor", email);
        String idMatch = auditPage("actor", actorUserId.toString());

        assertThat(emailMatch).contains(row(byEmail)).doesNotContain(row(byId));
        assertThat(idMatch).contains(row(byId)).doesNotContain(row(byEmail));
    }

    @Test
    void ipFilterMatchesAStoredAddress() throws Exception {
        UUID organizationId = UUID.randomUUID();
        UUID fromOffice = save(SecurityAuditEvent
            .builder(SecurityAuditEventType.LOGIN_SUCCEEDED, true)
            .organizationId(organizationId).ipAddress("203.0.113.42"));
        UUID elsewhere = save(SecurityAuditEvent
            .builder(SecurityAuditEventType.LOGIN_SUCCEEDED, true)
            .organizationId(organizationId).ipAddress("198.51.100.7"));

        String html = auditPage("organizationId", organizationId.toString(), "ip", "203.0.113.");

        assertThat(html).contains(row(fromOffice)).doesNotContain(row(elsewhere));
    }

    @Test
    void dateFromExcludesOlderEvents() throws Exception {
        UUID organizationId = UUID.randomUUID();
        UUID old = save(event(SecurityAuditEventType.LOGIN_SUCCEEDED, organizationId));
        UUID recent = save(event(SecurityAuditEventType.LOGIN_SUCCEEDED, organizationId));
        backdate(old, hoursAgo(48));
        backdate(recent, hoursAgo(1));

        String html = auditPage(
            "organizationId", organizationId.toString(), "from", asFilterValue(hoursAgo(24)));

        assertThat(html).contains(row(recent)).doesNotContain(row(old));
    }

    @Test
    void dateToExcludesNewerEvents() throws Exception {
        UUID organizationId = UUID.randomUUID();
        UUID old = save(event(SecurityAuditEventType.LOGIN_SUCCEEDED, organizationId));
        UUID recent = save(event(SecurityAuditEventType.LOGIN_SUCCEEDED, organizationId));
        backdate(old, hoursAgo(48));
        backdate(recent, hoursAgo(1));

        String html = auditPage(
            "organizationId", organizationId.toString(), "to", asFilterValue(hoursAgo(24)));

        assertThat(html).contains(row(old)).doesNotContain(row(recent));
    }

    @Test
    void combinedFiltersUseAndSemantics() throws Exception {
        UUID organizationId = UUID.randomUUID();
        UUID otherOrganization = UUID.randomUUID();
        UUID wanted = save(event(SecurityAuditEventType.ADMIN_INVITATION_REVOKED, organizationId));
        UUID wrongType = save(event(SecurityAuditEventType.LOGIN_SUCCEEDED, organizationId));
        UUID tooOld = save(event(SecurityAuditEventType.ADMIN_INVITATION_REVOKED, organizationId));
        UUID wrongOrganization =
            save(event(SecurityAuditEventType.ADMIN_INVITATION_REVOKED, otherOrganization));
        backdate(wanted, hoursAgo(2));
        backdate(wrongType, hoursAgo(2));
        backdate(tooOld, hoursAgo(72));
        backdate(wrongOrganization, hoursAgo(2));

        String html = auditPage(
            "organizationId", organizationId.toString(),
            "eventType", SecurityAuditEventType.ADMIN_INVITATION_REVOKED.name(),
            "from", asFilterValue(hoursAgo(24)));

        assertThat(html).contains(row(wanted));
        assertThat(html).doesNotContain(row(wrongType), row(tooOld), row(wrongOrganization));
    }

    // ----------------------------------------------------------- Pagination

    @Test
    void paginationPreservesFilters() throws Exception {
        UUID organizationId = UUID.randomUUID();
        UUID older = save(event(SecurityAuditEventType.LOGIN_SUCCEEDED, organizationId));
        UUID newer = save(event(SecurityAuditEventType.LOGIN_SUCCEEDED, organizationId));
        backdate(older, hoursAgo(4));
        backdate(newer, hoursAgo(2));

        String firstPage = auditPage(
            "organizationId", organizationId.toString(), "eventType",
            SecurityAuditEventType.LOGIN_SUCCEEDED.name(), "size", "1");
        String secondPage = auditPage(
            "organizationId", organizationId.toString(), "eventType",
            SecurityAuditEventType.LOGIN_SUCCEEDED.name(), "size", "1", "page", "1");

        assertThat(firstPage).contains(row(newer)).doesNotContain(row(older));
        assertThat(secondPage).contains(row(older)).doesNotContain(row(newer));
        // The "next page" link must carry every filter, not reset to an unfiltered
        // page 2. Separators appear as &amp; because Thymeleaf escapes the href.
        assertThat(firstPage).contains("?eventType=" + SecurityAuditEventType.LOGIN_SUCCEEDED.name()
            + "&amp;organizationId=" + organizationId + "&amp;size=1&amp;page=1");
    }

    // ---------------------------------------------------- Hostile parameters

    @Test
    void unreadableFilterValuesNarrowResultsInsteadOfFailing() throws Exception {
        UUID organizationId = UUID.randomUUID();
        String email = uniqueEmail("audit-wildcard");
        UUID seeded = save(event(SecurityAuditEventType.LOGIN_SUCCEEDED, organizationId)
            .normalizedEmail(email));

        // Every value here is either unparseable or out of range; none may 500.
        assertThat(auditPage(
            "eventType", "NOT_A_REAL_EVENT",
            "organizationId", "not-a-uuid",
            "outcome", "maybe",
            "from", "yesterday",
            "to", "31/07/2026",
            "page", "-4",
            "size", "99999",
            "sort", "createdAt; DROP TABLE security_audit_events"))
            .contains("Audit Logs");

        // A bare LIKE wildcard is escaped, so it matches a literal '%' — not every
        // row. The same term spelled out still finds the event it belongs to.
        assertThat(auditPage("actor", "%")).doesNotContain(row(seeded));
        assertThat(auditPage("actor", "_")).doesNotContain(row(seeded));
        assertThat(auditPage("actor", email)).contains(row(seeded));
    }

    // ------------------------------------------------------ Detail secrecy

    @Test
    void auditDetailsAreNeverRenderedIntoThePage() throws Exception {
        UUID organizationId = UUID.randomUUID();
        String payload = "<script>alert('potriv-audit-xss-marker')</script>";
        UUID eventId = save(SecurityAuditEvent
            .builder(SecurityAuditEventType.ADMIN_USER_ROLE_GRANTED, true)
            .organizationId(organizationId).details(payload));

        String list = auditPage("organizationId", organizationId.toString());
        String detail = adminGet("/admin/audit-logs/" + eventId)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        assertThat(list).contains(row(eventId));
        // Not merely escaped — the console does not surface details at all, so an
        // injected payload has no path into the rendered HTML.
        assertThat(list).doesNotContain("potriv-audit-xss-marker");
        assertThat(detail).doesNotContain("potriv-audit-xss-marker");
    }

    @Test
    void secretsWrittenIntoDetailsNeverReachTheRenderedHtml() throws Exception {
        UUID organizationId = UUID.randomUUID();
        String secret = "potriv-fake-secret-a1b2c3d4e5f6";
        UUID eventId = save(SecurityAuditEvent
            .builder(SecurityAuditEventType.PASSWORD_RESET_COMPLETED, true)
            .organizationId(organizationId)
            .details("password=" + secret + " refreshToken=" + secret));

        String list = auditPage("organizationId", organizationId.toString());
        String detail = adminGet("/admin/audit-logs/" + eventId)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        assertThat(list).doesNotContain(secret);
        assertThat(detail).doesNotContain(secret);
    }

    // ------------------------------------------------------- Read-only-ness

    @Test
    void repeatedGetRequestsDoNotMutateAuditRows() throws Exception {
        UUID organizationId = UUID.randomUUID();
        save(event(SecurityAuditEventType.LOGIN_SUCCEEDED, organizationId));
        save(event(SecurityAuditEventType.ADMIN_INVITATION_REGENERATED, organizationId));
        adminSession();

        long countBefore = countFor(organizationId);
        OffsetDateTime touchedBefore = lastUpdateFor(organizationId);
        for (int i = 0; i < 3; i++) {
            auditPage("organizationId", organizationId.toString());
            auditPage("organizationId", organizationId.toString(), "outcome", "success");
        }

        assertThat(countFor(organizationId)).isEqualTo(countBefore);
        assertThat(lastUpdateFor(organizationId)).isEqualTo(touchedBefore);
    }

    private long countFor(UUID organizationId) {
        Long count = jdbcTemplate.queryForObject(
            "SELECT count(*) FROM security_audit_events WHERE organization_id = ?",
            Long.class, organizationId);
        return count == null ? 0 : count;
    }

    private OffsetDateTime lastUpdateFor(UUID organizationId) {
        return jdbcTemplate.queryForObject(
            "SELECT max(updated_at) FROM security_audit_events WHERE organization_id = ?",
            OffsetDateTime.class, organizationId);
    }

    private static SecurityAuditEvent.Builder event(
        SecurityAuditEventType type, UUID organizationId) {
        return SecurityAuditEvent.builder(type, true).organizationId(organizationId);
    }
}
