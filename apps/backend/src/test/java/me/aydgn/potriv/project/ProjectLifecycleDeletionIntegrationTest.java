package me.aydgn.potriv.project;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import me.aydgn.potriv.project.repository.ProjectRepository;
import me.aydgn.potriv.project.repository.ProjectStatusHistoryRepository;
import me.aydgn.potriv.project.repository.ProjectTeamRoleRequirementRepository;
import me.aydgn.potriv.project.repository.ProjectTechnologyRepository;

/**
 * Project-01 deletion rules: explicit confirmation, the permanent historical
 * status block, and complete cleanup of satellite rows.
 */
class ProjectLifecycleDeletionIntegrationTest extends AbstractProjectLifecycleIntegrationTest {

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private ProjectTechnologyRepository technologyRepository;

    @Autowired
    private ProjectTeamRoleRequirementRepository requirementRepository;

    @Autowired
    private ProjectStatusHistoryRepository statusHistoryRepository;

    @Test
    void deletionRequiresExplicitConfirmationAndKnownProject() throws Exception {
        Org org = newOrg();
        Member pm = newProjectManager(org, "pm");
        UUID projectId = createProjectId(pm.token(), projectPayload(uniqueName("Keep")));

        deleteProject(pm.token(), projectId, "").andExpect(status().isBadRequest());
        deleteProject(pm.token(), projectId, "?confirmed=false")
            .andExpect(status().isBadRequest());
        deleteProject(pm.token(), UUID.randomUUID(), "?confirmed=true")
            .andExpect(status().isNotFound());

        // The unconfirmed attempts deleted nothing.
        getProject(pm.token(), projectId).andExpect(status().isOk());
    }

    @Test
    void confirmedDeletionRemovesProjectAndSatelliteRows() throws Exception {
        Org org = newOrg();
        Member pm = newProjectManager(org, "pm");
        UUID roleId = createTeamRoleId(org.adminToken(), uniqueName("Backend"));

        Map<String, Object> payload = projectPayload(uniqueName("Doomed"));
        payload.put("technologyStack", List.of("Java", "PostgreSQL"));
        payload.put("teamRoles", List.of(
            Map.of("teamRoleId", roleId.toString(), "requiredMembers", 2)));
        UUID projectId = createProjectId(pm.token(), payload);

        // A planning-only history (NOT_STARTED -> STARTING) does not block.
        patchProjectExpectOk(pm.token(), projectId, Map.of("status", "STARTING"));

        deleteProject(pm.token(), projectId, "?confirmed=true")
            .andExpect(status().isNoContent());

        assertThat(projectRepository.findById(projectId)).isEmpty();
        assertThat(technologyRepository.findByProject_IdOrderByNameAsc(projectId)).isEmpty();
        assertThat(requirementRepository.findByProjectIdWithTeamRole(projectId)).isEmpty();
        assertThat(statusHistoryRepository.findByProject_IdOrderByCreatedAtAsc(projectId))
            .isEmpty();

        getProject(pm.token(), projectId).andExpect(status().isNotFound());
    }

    @Test
    void historicalProgressBlocksDeletionPermanently() throws Exception {
        Org org = newOrg();
        Member pm = newProjectManager(org, "pm");
        UUID projectId = createProjectId(pm.token(), projectPayload(uniqueName("Progressed")));

        // STARTING -> IN_PROGRESS -> back to NOT_STARTED: the current status is
        // deletable-looking, but history still contains IN_PROGRESS.
        patchProjectExpectOk(pm.token(), projectId, Map.of("status", "STARTING"));
        patchProjectExpectOk(pm.token(), projectId, Map.of("status", "IN_PROGRESS"));
        patchProjectExpectOk(pm.token(), projectId, Map.of("status", "NOT_STARTED"));

        deleteProject(pm.token(), projectId, "?confirmed=true")
            .andExpect(status().isConflict());

        // The block is permanent and the project survives.
        getProject(pm.token(), projectId).andExpect(status().isOk());
        assertThat(projectRepository.findById(projectId)).isPresent();
    }
}
