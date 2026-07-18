package me.aydgn.potriv.project;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.groups.Tuple.tuple;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.project.entity.ProjectStatus;
import me.aydgn.potriv.project.entity.ProjectStatusHistory;
import me.aydgn.potriv.project.repository.ProjectStatusHistoryRepository;

/**
 * Project-01 happy path: creation, managed list scoping, owner read, partial
 * update semantics, and status history recording.
 */
class ProjectLifecycleIntegrationTest extends AbstractProjectLifecycleIntegrationTest {

    @Autowired
    private ProjectStatusHistoryRepository statusHistoryRepository;

    @Test
    void projectManagerCreatesProjectWithCleanedSafeResponse() throws Exception {
        Org org = newOrg();
        Member pm = newProjectManager(org, "pm");
        UUID roleId = createTeamRoleId(org.adminToken(), uniqueName("Backend"));

        Map<String, Object> payload = projectPayload(uniqueName("Apollo"));
        payload.put("technologyStack", List.of(" Java ", "React   Native"));
        payload.put("teamRoles", List.of(
            Map.of("teamRoleId", roleId.toString(), "requiredMembers", 2)));

        JsonNode project = createProjectExpectCreated(pm.token(), payload);

        // Identity and metadata.
        assertThat(UUID.fromString(project.get("projectId").asText())).isNotNull();
        assertThat(project.get("name").asText()).isEqualTo(payload.get("name"));
        assertThat(project.get("period").asText()).isEqualTo("FIXED");
        assertThat(project.get("startDate").asText()).isEqualTo("2026-08-01");
        assertThat(project.get("deadlineDate").asText()).isEqualTo("2026-12-31");
        assertThat(project.get("status").asText()).isEqualTo("NOT_STARTED");
        assertThat(project.get("generalDescription").asText())
            .isEqualTo("Test project description");

        // Technologies are trimmed, internal whitespace collapsed, name-sorted.
        assertThat(project.get("technologyStack"))
            .extracting(JsonNode::asText)
            .containsExactly("Java", "React Native");

        // Team role requirement rows with the informative role view.
        JsonNode requirement = project.get("teamRoles").get(0);
        assertThat(project.get("teamRoles")).hasSize(1);
        assertThat(requirement.get("teamRoleId").asText()).isEqualTo(roleId.toString());
        assertThat(requirement.get("requiredMembers").asInt()).isEqualTo(2);
        assertThat(requirement.get("active").asBoolean()).isTrue();
        assertThat(requirement.hasNonNull("requirementId")).isTrue();

        // The manager is the authenticated principal, exposed safely.
        JsonNode manager = project.get("projectManager");
        assertThat(manager.get("userId").asText()).isEqualTo(pm.userId().toString());
        assertThat(manager.get("email").asText()).isEqualTo(pm.email());
        assertThat(manager.has("passwordHash")).isFalse();
        assertThat(manager.has("failedLoginAttempts")).isFalse();
        assertThat(manager.has("lockedUntil")).isFalse();
    }

    @Test
    void creationWritesInitialStatusHistoryRow() throws Exception {
        Org org = newOrg();
        Member pm = newProjectManager(org, "pm");
        Map<String, Object> payload = projectPayload(uniqueName("History"));
        payload.put("status", "STARTING");
        UUID projectId = createProjectId(pm.token(), payload);

        List<ProjectStatusHistory> history =
            statusHistoryRepository.findByProject_IdOrderByCreatedAtAsc(projectId);

        assertThat(history).hasSize(1);
        ProjectStatusHistory initial = history.getFirst();
        assertThat(initial.getFromStatus()).isNull();
        assertThat(initial.getToStatus()).isEqualTo(ProjectStatus.STARTING);
        assertThat(initial.getChangedBy().getId()).isEqualTo(pm.userId());
        assertThat(initial.getProject().getId()).isEqualTo(projectId);
        assertThat(initial.getCreatedAt()).isNotNull();
    }

    @Test
    void managedListIsOwnerScopedAndNewestFirst() throws Exception {
        Org org = newOrg();
        Member pmA = newProjectManager(org, "pma");
        Member pmB = newProjectManager(org, "pmb");

        UUID first = createProjectId(pmA.token(), projectPayload(uniqueName("First")));
        UUID second = createProjectId(pmA.token(), projectPayload(uniqueName("Second")));
        createProjectId(pmB.token(), projectPayload(uniqueName("Other")));

        String body = mockMvc.perform(get("/projects/managed")
                .header(HttpHeaders.AUTHORIZATION, bearer(pmA.token())))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JsonNode projects = objectMapper.readTree(body);

        // Only pmA's projects, newest first.
        assertThat(projects).hasSize(2);
        assertThat(projects.get(0).get("projectId").asText()).isEqualTo(second.toString());
        assertThat(projects.get(1).get("projectId").asText()).isEqualTo(first.toString());
    }

    @Test
    void managedListSupportsStatusFilterAndRejectsInvalidStatus() throws Exception {
        Org org = newOrg();
        Member pm = newProjectManager(org, "pm");

        createProjectId(pm.token(), projectPayload(uniqueName("Planned")));
        Map<String, Object> starting = projectPayload(uniqueName("Starting"));
        starting.put("status", "STARTING");
        UUID startingId = createProjectId(pm.token(), starting);

        mockMvc.perform(get("/projects/managed").param("status", "STARTING")
                .header(HttpHeaders.AUTHORIZATION, bearer(pm.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].projectId").value(startingId.toString()));

        mockMvc.perform(get("/projects/managed").param("status", "CLOSED")
                .header(HttpHeaders.AUTHORIZATION, bearer(pm.token())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));

        mockMvc.perform(get("/projects/managed").param("status", "NOT_A_STATUS")
                .header(HttpHeaders.AUTHORIZATION, bearer(pm.token())))
            .andExpect(status().isBadRequest());
    }

    @Test
    void ownerReadIsScopedToOwnerAndKnownProjects() throws Exception {
        Org org = newOrg();
        Member owner = newProjectManager(org, "owner");
        Member otherPm = newProjectManager(org, "other");
        UUID projectId = createProjectId(owner.token(), projectPayload(uniqueName("Own")));

        getProject(owner.token(), projectId)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.projectId").value(projectId.toString()));

        // Same-org non-owner PM and unknown IDs both resolve to anti-leak 404.
        getProject(otherPm.token(), projectId).andExpect(status().isNotFound());
        getProject(owner.token(), UUID.randomUUID()).andExpect(status().isNotFound());
    }

    @Test
    void patchUpdatesOnlyPresentFields() throws Exception {
        Org org = newOrg();
        Member pm = newProjectManager(org, "pm");
        Map<String, Object> payload = projectPayload(uniqueName("Original"));
        payload.put("technologyStack", List.of("Java"));
        UUID projectId = createProjectId(pm.token(), payload);

        String newName = uniqueName("Renamed");
        JsonNode updated = patchProjectExpectOk(pm.token(), projectId, Map.of("name", newName));

        // Only the name changed; everything absent from the patch is untouched.
        assertThat(updated.get("name").asText()).isEqualTo(newName);
        assertThat(updated.get("period").asText()).isEqualTo("FIXED");
        assertThat(updated.get("startDate").asText()).isEqualTo("2026-08-01");
        assertThat(updated.get("deadlineDate").asText()).isEqualTo("2026-12-31");
        assertThat(updated.get("status").asText()).isEqualTo("NOT_STARTED");
        assertThat(updated.get("generalDescription").asText())
            .isEqualTo("Test project description");
        assertThat(updated.get("technologyStack")).extracting(JsonNode::asText)
            .containsExactly("Java");

        JsonNode redescribed = patchProjectExpectOk(pm.token(), projectId,
            Map.of("generalDescription", "New description"));
        assertThat(redescribed.get("generalDescription").asText()).isEqualTo("New description");
        assertThat(redescribed.get("name").asText()).isEqualTo(newName);
    }

    @Test
    void patchReplacesAndClearsCollections() throws Exception {
        Org org = newOrg();
        Member pm = newProjectManager(org, "pm");
        UUID roleId = createTeamRoleId(org.adminToken(), uniqueName("Backend"));
        Map<String, Object> payload = projectPayload(uniqueName("Stack"));
        payload.put("technologyStack", List.of("Java", "PostgreSQL"));
        payload.put("teamRoles", List.of(
            Map.of("teamRoleId", roleId.toString(), "requiredMembers", 1)));
        UUID projectId = createProjectId(pm.token(), payload);

        // Replacement is atomic and complete.
        JsonNode replaced = patchProjectExpectOk(pm.token(), projectId,
            Map.of("technologyStack", List.of("Kotlin")));
        assertThat(replaced.get("technologyStack")).extracting(JsonNode::asText)
            .containsExactly("Kotlin");
        assertThat(replaced.get("teamRoles")).hasSize(1);

        // A present empty list clears; an absent list leaves the other untouched.
        JsonNode cleared = patchProjectExpectOk(pm.token(), projectId,
            Map.of("technologyStack", List.of(), "teamRoles", List.of()));
        assertThat(cleared.get("technologyStack")).isEmpty();
        assertThat(cleared.get("teamRoles")).isEmpty();
    }

    @Test
    void statusChangesRecordHistoryWithoutDuplicates() throws Exception {
        Org org = newOrg();
        Member pm = newProjectManager(org, "pm");
        UUID projectId = createProjectId(pm.token(), projectPayload(uniqueName("Flow")));

        patchProjectExpectOk(pm.token(), projectId, Map.of("status", "STARTING"));
        patchProjectExpectOk(pm.token(), projectId, Map.of("status", "IN_PROGRESS"));
        // Same status again must not add a history row.
        patchProjectExpectOk(pm.token(), projectId, Map.of("status", "IN_PROGRESS"));

        List<ProjectStatusHistory> history =
            statusHistoryRepository.findByProject_IdOrderByCreatedAtAsc(projectId);

        assertThat(history).hasSize(3);
        assertThat(history)
            .extracting(ProjectStatusHistory::getFromStatus, ProjectStatusHistory::getToStatus)
            .containsExactly(
                tuple(null, ProjectStatus.NOT_STARTED),
                tuple(ProjectStatus.NOT_STARTED, ProjectStatus.STARTING),
                tuple(ProjectStatus.STARTING, ProjectStatus.IN_PROGRESS));
        assertThat(history)
            .allSatisfy(row -> {
                assertThat(row.getChangedBy().getId()).isEqualTo(pm.userId());
                assertThat(row.getProject().getId()).isEqualTo(projectId);
            });
    }

    @Test
    void periodSwitchesApplyDeadlineRules() throws Exception {
        Org org = newOrg();
        Member pm = newProjectManager(org, "pm");
        UUID projectId = createProjectId(pm.token(), projectPayload(uniqueName("Period")));

        // FIXED -> ONGOING clears the deadline.
        JsonNode ongoing = patchProjectExpectOk(pm.token(), projectId,
            Map.of("period", "ONGOING"));
        assertThat(ongoing.get("period").asText()).isEqualTo("ONGOING");
        assertThat(ongoing.get("deadlineDate").isNull()).isTrue();

        // ONGOING -> FIXED needs a deadline again.
        patchProject(pm.token(), projectId, Map.of("period", "FIXED"))
            .andExpect(status().isBadRequest());
        JsonNode fixedAgain = patchProjectExpectOk(pm.token(), projectId,
            Map.of("period", "FIXED", "deadlineDate", "2027-01-31"));
        assertThat(fixedAgain.get("deadlineDate").asText()).isEqualTo("2027-01-31");
    }
}
