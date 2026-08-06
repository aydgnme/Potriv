package me.aydgn.potriv.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.unauthenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.allocation.service.AllocationProjectStatusChangeGuard;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.project.entity.ProjectStatus;
import me.aydgn.potriv.project.entity.ProjectStatusHistory;
import me.aydgn.potriv.project.repository.ProjectRepository;
import me.aydgn.potriv.project.repository.ProjectStatusHistoryRepository;
import me.aydgn.potriv.project.repository.ProjectTechnologyRepository;
import me.aydgn.potriv.project.service.ProjectDeletionContributor;
import me.aydgn.potriv.project.service.ProjectStatusChangeGuard;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.repository.SecurityAuditEventRepository;

/**
 * Safe project administration actions.
 *
 * <p>The console cannot call {@code ProjectService}: every mutation there is
 * gated on the caller being the project's own manager, which a platform
 * {@code SYSTEM_ADMIN} never is. What these tests pin down is that the admin path
 * changes only <em>who may act</em> — the lifecycle rules themselves (status
 * history, the deletion-blocking history rule, the guard and contributor beans)
 * are the product's own.
 */
class AdminProjectActionsIntegrationTest extends AbstractAdminIntegrationTest {

    @Autowired
    private ProjectRepository projectRepository;
    @Autowired
    private ProjectStatusHistoryRepository statusHistoryRepository;
    @Autowired
    private ProjectTechnologyRepository technologyRepository;
    @Autowired
    private SecurityAuditEventRepository auditEventRepository;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private List<ProjectStatusChangeGuard> statusChangeGuards;
    @Autowired
    private List<ProjectDeletionContributor> deletionContributors;

    /** A project created through the real product API by its own manager. */
    private record Fixture(UUID projectId, UUID pmUserId, String pmEmail, String pmToken) {
    }

    private Fixture seed(String status) throws Exception {
        String adminEmail = uniqueEmail("proj-admin");
        JsonNode admin = registerAdmin(uniqueName("ProjActionOrg"), adminEmail, "Password123!");
        String adminToken = loginForAccessToken(adminEmail, "Password123!");
        String inviteToken = extractInviteToken(admin.get("employeeInviteUrl").asText());

        String pmEmail = uniqueEmail("pm");
        JsonNode pm = registerEmployee(inviteToken, pmEmail, "Password123!");
        UUID pmUserId = UUID.fromString(pm.get("userId").asText());
        mockMvc.perform(patch("/users/" + pmUserId + "/roles")
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    Map.of("roles", List.of("EMPLOYEE", "PROJECT_MANAGER")))))
            .andExpect(status().isOk());
        String pmToken = loginForAccessToken(pmEmail, "Password123!");

        String created = mockMvc.perform(post("/projects")
                .header(HttpHeaders.AUTHORIZATION, bearer(pmToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "name", uniqueName("AdminActionProject"),
                    "period", "FIXED",
                    "startDate", "2026-08-01",
                    "deadlineDate", "2026-12-31",
                    "status", status,
                    "technologyStack", List.of("Java", "Postgres"),
                    "generalDescription", "Created for admin project action tests"))))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        UUID projectId = UUID.fromString(objectMapper.readTree(created).get("projectId").asText());
        return new Fixture(projectId, pmUserId, pmEmail, pmToken);
    }

    /** Moves a project through the product's own API, so real history is written. */
    private void patchStatusAsManager(Fixture fixture, String status) throws Exception {
        mockMvc.perform(patch("/projects/" + fixture.projectId())
                .header(HttpHeaders.AUTHORIZATION, bearer(fixture.pmToken()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("status", status))))
            .andExpect(status().isOk());
    }

    private ProjectStatus statusOf(UUID projectId) {
        return projectRepository.findById(projectId).orElseThrow().getStatus();
    }

    /**
     * Creating a project already writes one {@code (null -> status)} history row,
     * so every assertion here is about how the history <em>grows</em>.
     */
    private List<ProjectStatusHistory> historyOf(UUID projectId) {
        return statusHistoryRepository.findByProject_IdOrderByCreatedAtAsc(projectId);
    }

    private ProjectStatusHistory latestHistoryOf(UUID projectId) {
        List<ProjectStatusHistory> history = historyOf(projectId);
        return history.get(history.size() - 1);
    }

    private List<SecurityAuditEvent> auditOf(SecurityAuditEventType type) {
        return auditEventRepository.findAll().stream()
            .filter(event -> event.getEventType() == type).toList();
    }

    private void changeStatus(UUID projectId, String status) throws Exception {
        mockMvc.perform(post("/admin/projects/" + projectId + "/status")
                .param("status", status).with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/admin/projects/" + projectId));
    }

    // -------------------------------------------------------------- Access

    @Test
    void anonymousCannotChangeStatusOrDelete() throws Exception {
        Fixture fixture = seed("NOT_STARTED");

        mockMvc.perform(post("/admin/projects/" + fixture.projectId() + "/status")
                .param("status", "STARTING").with(csrf()))
            .andExpect(status().is3xxRedirection());
        mockMvc.perform(post("/admin/projects/" + fixture.projectId() + "/delete").with(csrf()))
            .andExpect(status().is3xxRedirection());

        assertThat(statusOf(fixture.projectId())).isEqualTo(ProjectStatus.NOT_STARTED);
        assertThat(projectRepository.findById(fixture.projectId())).isPresent();
    }

    @Test
    void nonSystemAdminCannotAuthenticateIntoTheConsole() throws Exception {
        Fixture fixture = seed("NOT_STARTED");

        // The project's own manager is a real user with no console access.
        mockMvc.perform(formLogin("/admin/login")
                .user(fixture.pmEmail()).password("Password123!"))
            .andExpect(unauthenticated());
    }

    @Test
    void actionsRequireCsrf() throws Exception {
        Fixture fixture = seed("NOT_STARTED");

        mockMvc.perform(post("/admin/projects/" + fixture.projectId() + "/status")
                .param("status", "STARTING").session(adminSession()))
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/admin/projects/" + fixture.projectId() + "/delete")
                .session(adminSession()))
            .andExpect(status().isForbidden());

        assertThat(statusOf(fixture.projectId())).isEqualTo(ProjectStatus.NOT_STARTED);
        assertThat(projectRepository.findById(fixture.projectId())).isPresent();
    }

    @Test
    void viewingTheDeleteConfirmationDoesNotMutate() throws Exception {
        Fixture fixture = seed("NOT_STARTED");

        adminGet("/admin/projects/" + fixture.projectId() + "/delete")
            .andExpect(status().isOk());
        adminGet("/admin/projects/" + fixture.projectId() + "/delete")
            .andExpect(status().isOk());

        assertThat(projectRepository.findById(fixture.projectId())).isPresent();
        assertThat(historyOf(fixture.projectId())).hasSize(1);
    }

    @Test
    void unknownProjectReturns404() throws Exception {
        UUID unknown = UUID.randomUUID();

        adminGet("/admin/projects/" + unknown + "/delete").andExpect(status().isNotFound());
        mockMvc.perform(post("/admin/projects/" + unknown + "/status")
                .param("status", "STARTING").with(csrf()).session(adminSession()))
            .andExpect(status().isNotFound());
        mockMvc.perform(post("/admin/projects/" + unknown + "/delete")
                .with(csrf()).session(adminSession()))
            .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------- Status change

    @Test
    void statusChangeIsAppliedAndRecordedAsRealHistory() throws Exception {
        Fixture fixture = seed("NOT_STARTED");

        changeStatus(fixture.projectId(), "STARTING");

        assertThat(statusOf(fixture.projectId())).isEqualTo(ProjectStatus.STARTING);
        // One row from creation, one from this transition.
        assertThat(historyOf(fixture.projectId())).hasSize(2);
        ProjectStatusHistory latest = latestHistoryOf(fixture.projectId());
        assertThat(latest.getFromStatus()).isEqualTo(ProjectStatus.NOT_STARTED);
        assertThat(latest.getToStatus()).isEqualTo(ProjectStatus.STARTING);
        // The acting administrator is recorded, not the project manager. Compared by
        // id: changedBy is a lazy proxy and its identifier needs no session.
        UUID systemAdminId = userRepository.findByEmail(SYSTEM_ADMIN_EMAIL).orElseThrow().getId();
        assertThat(latest.getChangedBy().getId()).isEqualTo(systemAdminId);
        assertThat(latest.getChangedBy().getId()).isNotEqualTo(fixture.pmUserId());
        assertThat(auditOf(SecurityAuditEventType.ADMIN_PROJECT_STATUS_CHANGED)).isNotEmpty();

        String html = adminGet("/admin/projects/" + fixture.projectId())
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("Status History", "NOT_STARTED", "STARTING");
    }

    @Test
    void changingToTheCurrentStatusChangesNothing() throws Exception {
        Fixture fixture = seed("NOT_STARTED");

        changeStatus(fixture.projectId(), "NOT_STARTED");

        assertThat(statusOf(fixture.projectId())).isEqualTo(ProjectStatus.NOT_STARTED);
        // Only the row creation wrote — a no-op transition records nothing.
        assertThat(historyOf(fixture.projectId())).hasSize(1);
    }

    @Test
    void anUnusableStatusValueIsRejectedWithoutChangingAnything() throws Exception {
        Fixture fixture = seed("NOT_STARTED");

        changeStatus(fixture.projectId(), "BANANA");
        changeStatus(fixture.projectId(), "");
        changeStatus(fixture.projectId(), "<script>alert(1)</script>");

        assertThat(statusOf(fixture.projectId())).isEqualTo(ProjectStatus.NOT_STARTED);
        assertThat(historyOf(fixture.projectId())).hasSize(1);
    }

    /**
     * The console does not own a second copy of the lifecycle rules: it is handed
     * the very beans the product's own update and delete paths use.
     */
    @Test
    void theConsoleSharesTheProductsLifecycleGuardsAndContributors() {
        assertThat(statusChangeGuards)
            .hasAtLeastOneElementOfType(AllocationProjectStatusChangeGuard.class);
        assertThat(deletionContributors).isNotEmpty();
    }

    // ------------------------------------------------------------- Deletion

    @Test
    void aProjectStillInPlanningCanBeDeleted() throws Exception {
        Fixture fixture = seed("NOT_STARTED");

        mockMvc.perform(post("/admin/projects/" + fixture.projectId() + "/delete")
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/admin/projects"));

        assertThat(projectRepository.findById(fixture.projectId())).isEmpty();
        assertThat(technologyRepository.findByProject_IdOrderByNameAsc(fixture.projectId()))
            .isEmpty();
        assertThat(historyOf(fixture.projectId())).isEmpty();
        assertThat(auditOf(SecurityAuditEventType.ADMIN_PROJECT_DELETED)).isNotEmpty();
    }

    /**
     * The product's rule is historical, not current: once a project has actually
     * been worked on it is kept, even if it is moved back to planning afterwards.
     */
    @Test
    void aProjectThatEverReachedInProgressCanNeverBeDeleted() throws Exception {
        Fixture fixture = seed("NOT_STARTED");
        patchStatusAsManager(fixture, "IN_PROGRESS");
        patchStatusAsManager(fixture, "NOT_STARTED");

        assertThat(statusOf(fixture.projectId())).isEqualTo(ProjectStatus.NOT_STARTED);

        mockMvc.perform(post("/admin/projects/" + fixture.projectId() + "/delete")
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/admin/projects/" + fixture.projectId()));

        assertThat(projectRepository.findById(fixture.projectId())).isPresent();
        assertThat(auditOf(SecurityAuditEventType.ADMIN_PROJECT_ACTION_BLOCKED)).isNotEmpty();
    }

    @Test
    void theDeleteActionIsOnlyOfferedWhileDeletionIsStillPossible() throws Exception {
        Fixture deletable = seed("NOT_STARTED");
        Fixture blocked = seed("NOT_STARTED");
        patchStatusAsManager(blocked, "IN_PROGRESS");

        String deletableHtml = adminGet("/admin/projects/" + deletable.projectId())
            .andReturn().getResponse().getContentAsString();
        String blockedHtml = adminGet("/admin/projects/" + blocked.projectId())
            .andReturn().getResponse().getContentAsString();

        assertThat(deletableHtml).contains("Delete project");
        assertThat(blockedHtml).doesNotContain("Delete project");
        // The confirmation page states the reason rather than offering the button.
        assertThat(adminGet("/admin/projects/" + blocked.projectId() + "/delete")
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString())
            .contains("Cannot delete");
    }

    @Test
    void deletingAProjectLeavesItsPeopleAndAccountsAlone() throws Exception {
        Fixture fixture = seed("NOT_STARTED");

        mockMvc.perform(post("/admin/projects/" + fixture.projectId() + "/delete")
                .with(csrf()).session(adminSession()))
            .andExpect(status().is3xxRedirection());

        assertThat(userRepository.findById(fixture.pmUserId())).isPresent();
        assertThat(login(fixture.pmEmail(), "Password123!").get("accessToken").asText())
            .isNotBlank();
    }

    // ------------------------------------------------------- Audit hygiene

    @Test
    void projectAuditDetailsCarryNoSecretsAndStayShort() throws Exception {
        Fixture fixture = seed("NOT_STARTED");
        changeStatus(fixture.projectId(), "STARTING");

        List<SecurityAuditEvent> events =
            auditOf(SecurityAuditEventType.ADMIN_PROJECT_STATUS_CHANGED);

        assertThat(events).isNotEmpty();
        assertThat(events).allSatisfy(event -> {
            assertThat(event.getDetails()).doesNotContain(fixture.pmToken());
            assertThat(event.getDetails()).doesNotContainIgnoringCase("password");
            assertThat(event.getDetails()).doesNotContainIgnoringCase("token");
            assertThat(event.getDetails().length()).isLessThan(200);
        });
    }
}
