package me.aydgn.potriv.project.allocation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import me.aydgn.potriv.project.entity.ProjectStatus;
import me.aydgn.potriv.project.entity.ProjectStatusHistory;
import me.aydgn.potriv.project.repository.ProjectStatusHistoryRepository;

/**
 * Active-allocation capacity semantics: only active allocations on
 * capacity-consuming project statuses count toward the 8-hour daily maximum,
 * and the project activation guard blocks over-allocating transitions.
 */
class ProjectAllocationCapacityIntegrationTest extends AbstractProjectAllocationIntegrationTest {

    @Autowired
    private ProjectStatusHistoryRepository statusHistoryRepository;

    @Test
    void allocationsOnNonConsumingProjectsDoNotReduceCapacity() throws Exception {
        Workspace workspace = newWorkspace();
        UUID employeeId = workspace.employee().userId();

        // A full 8-hour allocation on a NOT_STARTED project consumes nothing.
        UUID dormant = createProjectId(workspace.pm().token(),
            projectPayload(uniqueName("Dormant")));
        allocate(workspace, dormant, employeeId, 8);

        // The employee is still fully available for a consuming project.
        UUID active = createConsumingProject(workspace.pm().token(), uniqueName("Active"));
        proposeAssignment(workspace.pm().token(), active, employeeId, 8,
                List.of(workspace.teamRoleId()))
            .andExpect(status().isCreated());
    }

    @Test
    void consumingAllocationsSumAndAllowExactlyEightHours() throws Exception {
        Workspace workspace = newWorkspace();
        UUID employeeId = workspace.employee().userId();
        List<UUID> roles = List.of(workspace.teamRoleId());

        UUID projectA = createConsumingProject(workspace.pm().token(), uniqueName("A"));
        UUID projectB = createConsumingProject(workspace.pm().token(), uniqueName("B"));
        allocate(workspace, projectA, employeeId, 5);

        // 4 more hours would exceed the maximum, 3 reaches exactly 8.
        proposeAssignment(workspace.pm().token(), projectB, employeeId, 4, roles)
            .andExpect(status().isConflict());
        allocate(workspace, projectB, employeeId, 3);

        // At exactly 8 hours there is no capacity left at all.
        UUID projectC = createConsumingProject(workspace.pm().token(), uniqueName("C"));
        proposeAssignment(workspace.pm().token(), projectC, employeeId, 1, roles)
            .andExpect(status().isConflict());
    }

    @Test
    void closingAProjectReleasesItsCapacity() throws Exception {
        Workspace workspace = newWorkspace();
        UUID employeeId = workspace.employee().userId();

        UUID projectA = createConsumingProject(workspace.pm().token(), uniqueName("A"));
        allocate(workspace, projectA, employeeId, 8);

        // Consuming -> non-consuming: CLOSED stops counting, freeing the employee.
        patchProjectExpectOk(workspace.pm().token(), projectA, Map.of("status", "CLOSING"));
        patchProjectExpectOk(workspace.pm().token(), projectA, Map.of("status", "CLOSED"));

        UUID projectB = createConsumingProject(workspace.pm().token(), uniqueName("B"));
        proposeAssignment(workspace.pm().token(), projectB, employeeId, 8,
                List.of(workspace.teamRoleId()))
            .andExpect(status().isCreated());
    }

    @Test
    void activationGuardBlocksOverAllocatingTransition() throws Exception {
        Workspace workspace = newWorkspace();
        UUID employeeId = workspace.employee().userId();

        // 5h on a dormant project first (while the employee is fully free), then
        // 6h on an already-consuming project.
        UUID dormant = createProjectId(workspace.pm().token(),
            projectPayload(uniqueName("Dormant")));
        allocate(workspace, dormant, employeeId, 5);
        UUID running = createConsumingProject(workspace.pm().token(), uniqueName("Running"));
        allocate(workspace, running, employeeId, 6);

        int historyRowsBefore = statusHistoryRepository
            .findByProject_IdOrderByCreatedAtAsc(dormant).size();

        // Activating the dormant project would put the employee at 11h.
        patchProject(workspace.pm().token(), dormant, Map.of("status", "STARTING"))
            .andExpect(status().isConflict());

        // The status is unchanged and the failed transition wrote no history.
        getProject(workspace.pm().token(), dormant)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("NOT_STARTED"));
        List<ProjectStatusHistory> history =
            statusHistoryRepository.findByProject_IdOrderByCreatedAtAsc(dormant);
        assertThat(history).hasSize(historyRowsBefore);
        assertThat(history)
            .extracting(ProjectStatusHistory::getToStatus)
            .doesNotContain(ProjectStatus.STARTING);
    }

    @Test
    void activationGuardAllowsExactFitAndConsumingToConsumingTransitions() throws Exception {
        Workspace workspace = newWorkspace();
        UUID employeeId = workspace.employee().userId();

        UUID dormant = createProjectId(workspace.pm().token(),
            projectPayload(uniqueName("Dormant")));
        allocate(workspace, dormant, employeeId, 4);
        UUID running = createConsumingProject(workspace.pm().token(), uniqueName("Running"));
        allocate(workspace, running, employeeId, 4);

        // Activation reaching exactly 8 hours is allowed.
        patchProjectExpectOk(workspace.pm().token(), dormant, Map.of("status", "STARTING"));

        // Consuming -> consuming does not re-trigger the guard even at 8h.
        patchProjectExpectOk(workspace.pm().token(), dormant, Map.of("status", "IN_PROGRESS"));
    }
}
