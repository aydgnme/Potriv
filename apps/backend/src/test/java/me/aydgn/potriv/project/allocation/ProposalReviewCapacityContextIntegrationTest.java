package me.aydgn.potriv.project.allocation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * The capacity context a department manager sees before deciding a staffing
 * request.
 *
 * <p>The figures are current state at response time, not a reservation. These
 * tests pin both halves of that: the read model reports what acceptance would do
 * right now, and acceptance still revalidates transactionally — so a context that
 * said "fits" does not make a later accept succeed.
 */
class ProposalReviewCapacityContextIntegrationTest
    extends AbstractProjectAllocationIntegrationTest {

    private static final int MAX_HOURS = 8;

    @Test
    void freshEmployeeHasFullCapacity() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Apollo"));
        proposeAssignment(workspace.pm().token(), projectId, workspace.employee().userId(), 6,
            List.of(workspace.teamRoleId()))
            .andExpect(status().isCreated());

        JsonNode capacity = onlyCapacity(workspace);

        assertThat(capacity.get("maxHoursPerDay").asInt()).isEqualTo(MAX_HOURS);
        assertThat(capacity.get("allocatedHoursPerDay").asInt()).isZero();
        assertThat(capacity.get("availableHoursPerDay").asInt()).isEqualTo(MAX_HOURS);
        assertThat(capacity.get("requestedHoursPerDay").asInt()).isEqualTo(6);
        assertThat(capacity.get("projectedAllocatedHoursPerDay").asInt()).isEqualTo(6);
        assertThat(capacity.get("projectedAvailableHoursPerDay").asInt()).isEqualTo(2);
        assertThat(capacity.get("currentlyAcceptableByCapacity").asBoolean()).isTrue();
    }

    @Test
    void partiallyAllocatedEmployeeReportsRemainingHours() throws Exception {
        Workspace workspace = newWorkspace();
        UUID busy = createConsumingProject(workspace.pm().token(), uniqueName("Busy"));
        allocate(workspace, busy, workspace.employee().userId(), 5);

        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Apollo"));
        proposeAssignment(workspace.pm().token(), projectId, workspace.employee().userId(), 2,
            List.of(workspace.teamRoleId()))
            .andExpect(status().isCreated());

        JsonNode capacity = pendingCapacityFor(workspace, projectId);

        assertThat(capacity.get("allocatedHoursPerDay").asInt()).isEqualTo(5);
        assertThat(capacity.get("availableHoursPerDay").asInt()).isEqualTo(3);
        assertThat(capacity.get("projectedAllocatedHoursPerDay").asInt()).isEqualTo(7);
        assertThat(capacity.get("projectedAvailableHoursPerDay").asInt()).isEqualTo(1);
        assertThat(capacity.get("currentlyAcceptableByCapacity").asBoolean()).isTrue();
    }

    @Test
    void exactFitIsAcceptableAndLeavesNothing() throws Exception {
        Workspace workspace = newWorkspace();
        UUID busy = createConsumingProject(workspace.pm().token(), uniqueName("Busy"));
        allocate(workspace, busy, workspace.employee().userId(), 5);

        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Apollo"));
        proposeAssignment(workspace.pm().token(), projectId, workspace.employee().userId(), 3,
            List.of(workspace.teamRoleId()))
            .andExpect(status().isCreated());

        JsonNode capacity = pendingCapacityFor(workspace, projectId);

        assertThat(capacity.get("projectedAllocatedHoursPerDay").asInt()).isEqualTo(MAX_HOURS);
        assertThat(capacity.get("projectedAvailableHoursPerDay").asInt()).isZero();
        assertThat(capacity.get("currentlyAcceptableByCapacity").asBoolean()).isTrue();
    }

    @Test
    void deallocatedAllocationStopsConsumingCapacity() throws Exception {
        Workspace workspace = newWorkspace();
        UUID busy = createConsumingProject(workspace.pm().token(), uniqueName("Busy"));
        UUID allocationId = allocate(workspace, busy, workspace.employee().userId(), 6);

        // Only 2 hours are left, so that is the largest proposal the creation guard
        // will accept — capacity is enforced when a proposal is made, not only when
        // it is reviewed.
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Apollo"));
        proposeAssignment(workspace.pm().token(), projectId, workspace.employee().userId(), 2,
            List.of(workspace.teamRoleId()))
            .andExpect(status().isCreated());

        JsonNode before = pendingCapacityFor(workspace, projectId);
        assertThat(before.get("allocatedHoursPerDay").asInt()).isEqualTo(6);
        assertThat(before.get("availableHoursPerDay").asInt()).isEqualTo(2);

        deallocate(workspace, busy, allocationId);

        JsonNode after = pendingCapacityFor(workspace, projectId);
        assertThat(after.get("allocatedHoursPerDay").asInt())
            .as("a deallocated allocation must stop consuming capacity")
            .isZero();
        assertThat(after.get("availableHoursPerDay").asInt()).isEqualTo(MAX_HOURS);
        assertThat(after.get("currentlyAcceptableByCapacity").asBoolean()).isTrue();
    }

    @Test
    void allocationOnANonConsumingProjectDoesNotCount() throws Exception {
        Workspace workspace = newWorkspace();
        // A project left in a non-capacity-consuming status.
        UUID planning = createProjectId(
            workspace.pm().token(), projectPayload(uniqueName("Planning")));
        allocate(workspace, planning, workspace.employee().userId(), 8);

        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Apollo"));
        proposeAssignment(workspace.pm().token(), projectId, workspace.employee().userId(), 8,
            List.of(workspace.teamRoleId()))
            .andExpect(status().isCreated());

        JsonNode capacity = pendingCapacityFor(workspace, projectId);
        assertThat(capacity.get("allocatedHoursPerDay").asInt()).isZero();
        assertThat(capacity.get("currentlyAcceptableByCapacity").asBoolean()).isTrue();
    }

    @Test
    void capacityIsRecalculatedRatherThanFrozenAtProposalTime() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Apollo"));
        proposeAssignment(workspace.pm().token(), projectId, workspace.employee().userId(), 5,
            List.of(workspace.teamRoleId()))
            .andExpect(status().isCreated());

        assertThat(pendingCapacityFor(workspace, projectId)
            .get("currentlyAcceptableByCapacity").asBoolean()).isTrue();

        // Someone else's project consumes the room in the meantime.
        UUID other = createConsumingProject(workspace.pm().token(), uniqueName("Other"));
        allocate(workspace, other, workspace.employee().userId(), 6);

        JsonNode capacity = pendingCapacityFor(workspace, projectId);
        assertThat(capacity.get("allocatedHoursPerDay").asInt()).isEqualTo(6);
        assertThat(capacity.get("availableHoursPerDay").asInt()).isEqualTo(2);
        assertThat(capacity.get("currentlyAcceptableByCapacity").asBoolean()).isFalse();
    }

    @Test
    void aPendingProposalThatNoLongerFitsStaysPendingAndAcceptanceStillRefuses()
        throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Apollo"));
        UUID proposalId = proposeAssignmentId(
            workspace.pm().token(), projectId, workspace.employee().userId(), 5,
            List.of(workspace.teamRoleId()));

        UUID other = createConsumingProject(workspace.pm().token(), uniqueName("Other"));
        allocate(workspace, other, workspace.employee().userId(), 6);

        // The read model says so…
        assertThat(pendingCapacityFor(workspace, projectId)
            .get("currentlyAcceptableByCapacity").asBoolean()).isFalse();

        // …and the authoritative guard agrees, without changing the proposal.
        acceptAssignment(workspace.dm().token(), proposalId).andExpect(status().isConflict());

        JsonNode row = pendingRowFor(workspace, projectId);
        assertThat(row.get("status").asText()).isEqualTo("PENDING");
        assertThat(row.get("reviewedAt").isNull()).isTrue();

        // Rejecting it remains available, which is the point of leaving it pending.
        rejectAssignment(workspace.dm().token(), proposalId).andExpect(status().isOk());
    }

    @Test
    void decidedProposalsCarryNoCapacityContext() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Apollo"));
        UUID proposalId = proposeAssignmentId(
            workspace.pm().token(), projectId, workspace.employee().userId(), 4,
            List.of(workspace.teamRoleId()));
        acceptAssignment(workspace.dm().token(), proposalId).andExpect(status().isOk());

        JsonNode approved = proposalQueueJson(workspace.dm().token(), "APPROVED");
        assertThat(approved).isNotEmpty();
        for (JsonNode row : approved) {
            assertThat(row.get("capacity").isNull())
                .as("a decided proposal has nothing left to check")
                .isTrue();
        }
    }

    @Test
    void deallocationRowsCarryNoCapacityContext() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Apollo"));
        UUID allocationId = allocate(workspace, projectId, workspace.employee().userId(), 4);
        proposeDeallocation(
            workspace.pm().token(), projectId, allocationId, "Workstream closed.")
            .andExpect(status().isCreated());

        JsonNode queue = proposalQueueJson(workspace.dm().token(), "PENDING");
        JsonNode deallocation = rowOfType(queue, "DEALLOCATION");

        assertThat(deallocation).isNotNull();
        assertThat(deallocation.get("capacity").isNull())
            .as("accepting a removal frees capacity; it can never fail on it")
            .isTrue();
    }

    @Test
    void capacityNeverLeaksAcrossOrganizations() throws Exception {
        Workspace first = newWorkspace();
        Workspace second = newWorkspace();

        UUID projectId = createConsumingProject(first.pm().token(), uniqueName("Apollo"));
        proposeAssignment(first.pm().token(), projectId, first.employee().userId(), 4,
            List.of(first.teamRoleId()))
            .andExpect(status().isCreated());

        // The other organization's manager sees an empty queue, not a foreign row.
        JsonNode foreign = proposalQueueJson(second.dm().token(), "PENDING");
        assertThat(foreign).isEmpty();
    }

    @Test
    void oneQueryPricesTheWholeQueue() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Apollo"));

        // Several pending proposals for distinct employees in the same department.
        for (int index = 0; index < 3; index++) {
            Member extra = newEmployee(workspace.org(), "extra" + index);
            addMember(workspace.dm().token(), workspace.departmentId(), extra.userId());
            proposeAssignment(workspace.pm().token(), projectId, extra.userId(), 2,
            List.of(workspace.teamRoleId()))
                .andExpect(status().isCreated());
        }

        JsonNode queue = proposalQueueJson(workspace.dm().token(), "PENDING");

        assertThat(queue).hasSize(3);
        for (JsonNode row : queue) {
            assertThat(row.get("capacity").isNull()).isFalse();
            assertThat(row.get("capacity").get("maxHoursPerDay").asInt()).isEqualTo(MAX_HOURS);
        }
    }

    // ---- helpers ----

    private JsonNode onlyCapacity(Workspace workspace) throws Exception {
        JsonNode queue = proposalQueueJson(workspace.dm().token(), "PENDING");
        assertThat(queue).hasSize(1);
        return queue.get(0).get("capacity");
    }

    private JsonNode pendingRowFor(Workspace workspace, UUID projectId) throws Exception {
        for (JsonNode row : proposalQueueJson(workspace.dm().token(), "PENDING")) {
            if (projectId.toString().equals(row.get("project").get("projectId").asText())) {
                return row;
            }
        }
        throw new AssertionError("no pending proposal for project " + projectId);
    }

    private JsonNode pendingCapacityFor(Workspace workspace, UUID projectId) throws Exception {
        return pendingRowFor(workspace, projectId).get("capacity");
    }

    private static JsonNode rowOfType(JsonNode queue, String proposalType) {
        for (JsonNode row : queue) {
            if (proposalType.equals(row.get("proposalType").asText())) {
                return row;
            }
        }
        return null;
    }
}
