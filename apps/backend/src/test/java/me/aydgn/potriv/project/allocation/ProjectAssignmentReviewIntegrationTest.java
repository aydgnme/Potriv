package me.aydgn.potriv.project.allocation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.allocation.repository.ProjectAllocationRepository;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRoleRepository;

/**
 * Project-05 assignment confirmation: the Department Manager queue, accept and
 * reject flows, repeated-review conflicts, and the accept-time capacity
 * recheck.
 */
class ProjectAssignmentReviewIntegrationTest extends AbstractProjectAllocationIntegrationTest {

    @Autowired
    private ProjectAllocationRepository allocationRepository;

    @Autowired
    private ProjectAssignmentProposalRoleRepository proposalRoleRepository;

    @Test
    void queueIsDepartmentScopedPendingByDefaultAndOldestFirst() throws Exception {
        Workspace workspace = newWorkspace();

        // A sibling department with its own manager and member in the same org.
        Member otherDm = newDepartmentManager(workspace.org(), "dmB");
        UUID otherDept = createDepartment(workspace.org().adminToken(), uniqueName("Design"));
        assignManager(workspace.org().adminToken(), otherDept, otherDm.userId());
        Member otherEmployee = newEmployee(workspace.org(), "empB");
        addMember(otherDm.token(), otherDept, otherEmployee.userId());

        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Queue"));
        List<UUID> roles = List.of(workspace.teamRoleId());
        UUID first = proposeAssignmentId(
            workspace.pm().token(), projectId, workspace.employee().userId(), 2, roles);
        proposeAssignmentId(
            workspace.pm().token(), projectId, otherEmployee.userId(), 2, roles);

        JsonNode queue = proposalQueueJson(workspace.dm().token(), null);

        // Only the manager's own department, ASSIGNMENT rows, PENDING default.
        assertThat(queue).hasSize(1);
        JsonNode row = queue.get(0);
        assertThat(row.get("proposalId").asText()).isEqualTo(first.toString());
        assertThat(row.get("proposalType").asText()).isEqualTo("ASSIGNMENT");
        assertThat(row.get("status").asText()).isEqualTo("PENDING");
        assertThat(row.get("allocationId").isNull()).isTrue();
        assertThat(row.get("reason").isNull()).isTrue();
        assertThat(row.get("employee").get("userId").asText())
            .isEqualTo(workspace.employee().userId().toString());
        assertThat(row.get("project").get("projectId").asText())
            .isEqualTo(projectId.toString());

        // Oldest first within the department.
        Member thirdEmployee = newEmployee(workspace.org(), "empC");
        addMember(workspace.dm().token(), workspace.departmentId(), thirdEmployee.userId());
        UUID second = proposeAssignmentId(
            workspace.pm().token(), projectId, thirdEmployee.userId(), 2, roles);
        JsonNode ordered = proposalQueueJson(workspace.dm().token(), null);
        assertThat(ordered).hasSize(2);
        assertThat(ordered.get(0).get("proposalId").asText()).isEqualTo(first.toString());
        assertThat(ordered.get(1).get("proposalId").asText()).isEqualTo(second.toString());
    }

    @Test
    void queueStatusFiltersWorkAndInvalidStatusIsRejected() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Filter"));
        List<UUID> roles = List.of(workspace.teamRoleId());
        Member second = newEmployee(workspace.org(), "emp2");
        addMember(workspace.dm().token(), workspace.departmentId(), second.userId());

        UUID approved = proposeAssignmentId(
            workspace.pm().token(), projectId, workspace.employee().userId(), 2, roles);
        UUID rejected = proposeAssignmentId(
            workspace.pm().token(), projectId, second.userId(), 2, roles);
        acceptAssignment(workspace.dm().token(), approved).andExpect(status().isOk());
        rejectAssignment(workspace.dm().token(), rejected).andExpect(status().isOk());

        JsonNode pending = proposalQueueJson(workspace.dm().token(), "PENDING");
        assertThat(pending).isEmpty();

        JsonNode approvedRows = proposalQueueJson(workspace.dm().token(), "APPROVED");
        assertThat(approvedRows).hasSize(1);
        assertThat(approvedRows.get(0).get("proposalId").asText())
            .isEqualTo(approved.toString());

        JsonNode rejectedRows = proposalQueueJson(workspace.dm().token(), "REJECTED");
        assertThat(rejectedRows).hasSize(1);
        assertThat(rejectedRows.get(0).get("proposalId").asText())
            .isEqualTo(rejected.toString());

        proposalQueue(workspace.dm().token(), "NOT_A_STATUS")
            .andExpect(status().isBadRequest());
    }

    @Test
    void acceptCreatesAllocationAndApprovesProposal() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Accept"));
        UUID proposalId = proposeAssignmentId(workspace.pm().token(), projectId,
            workspace.employee().userId(), 5, List.of(workspace.teamRoleId()));

        String body = acceptAssignment(workspace.dm().token(), proposalId)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JsonNode review = objectMapper.readTree(body);

        JsonNode proposal = review.get("proposal");
        assertThat(proposal.get("status").asText()).isEqualTo("APPROVED");
        assertThat(proposal.get("reviewedBy").get("userId").asText())
            .isEqualTo(workspace.dm().userId().toString());
        assertThat(proposal.get("reviewedAt").isNull()).isFalse();

        JsonNode allocation = review.get("allocation");
        UUID allocationId = UUID.fromString(allocation.get("allocationId").asText());
        assertThat(allocation.get("projectId").asText()).isEqualTo(projectId.toString());
        assertThat(allocation.get("employee").get("userId").asText())
            .isEqualTo(workspace.employee().userId().toString());
        assertThat(allocation.get("assignmentProposalId").asText())
            .isEqualTo(proposalId.toString());
        assertThat(allocation.get("workHoursPerDay").asInt()).isEqualTo(5);
        assertThat(allocation.get("allocatedAt").isNull()).isFalse();
        assertThat(allocation.get("deallocatedAt").isNull()).isTrue();

        // The allocation row exists and the role snapshot stays on the proposal.
        assertThat(allocationRepository.findById(allocationId)).isPresent();
        assertThat(proposalRoleRepository.findByProposalIdWithTeamRole(proposalId)).hasSize(1);
    }

    @Test
    void rejectLeavesNoAllocationAndAllowsRetry() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Reject"));
        UUID employeeId = workspace.employee().userId();
        UUID proposalId = proposeAssignmentId(workspace.pm().token(), projectId,
            employeeId, 5, List.of(workspace.teamRoleId()));

        String body = rejectAssignment(workspace.dm().token(), proposalId)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JsonNode review = objectMapper.readTree(body);

        assertThat(review.get("proposal").get("status").asText()).isEqualTo("REJECTED");
        assertThat(review.get("proposal").get("reviewedBy").get("userId").asText())
            .isEqualTo(workspace.dm().userId().toString());
        assertThat(review.get("proposal").get("reviewedAt").isNull()).isFalse();
        assertThat(review.get("allocation").isNull()).isTrue();

        // No allocation was created and capacity stayed free: a fresh full-day
        // proposal for the same project+employee is accepted.
        assertThat(allocationRepository
            .existsByProject_IdAndEmployee_Id(projectId, employeeId)).isFalse();
        UUID retry = proposeAssignmentId(workspace.pm().token(), projectId,
            employeeId, 8, List.of(workspace.teamRoleId()));
        acceptAssignment(workspace.dm().token(), retry).andExpect(status().isOk());
    }

    @Test
    void repeatedReviewReturnsConflict() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Repeat"));
        List<UUID> roles = List.of(workspace.teamRoleId());
        Member second = newEmployee(workspace.org(), "emp2");
        addMember(workspace.dm().token(), workspace.departmentId(), second.userId());

        UUID approved = proposeAssignmentId(
            workspace.pm().token(), projectId, workspace.employee().userId(), 2, roles);
        UUID rejected = proposeAssignmentId(
            workspace.pm().token(), projectId, second.userId(), 2, roles);
        acceptAssignment(workspace.dm().token(), approved).andExpect(status().isOk());
        rejectAssignment(workspace.dm().token(), rejected).andExpect(status().isOk());

        acceptAssignment(workspace.dm().token(), approved).andExpect(status().isConflict());
        rejectAssignment(workspace.dm().token(), approved).andExpect(status().isConflict());
        acceptAssignment(workspace.dm().token(), rejected).andExpect(status().isConflict());
        rejectAssignment(workspace.dm().token(), rejected).andExpect(status().isConflict());
    }

    @Test
    void reviewScopeRules() throws Exception {
        Workspace workspace = newWorkspace();
        Org orgB = newOrg();

        // A manager of a different department in the same org, and a cross-org
        // manager with a real assignment in their own org.
        Member wrongDm = newDepartmentManager(workspace.org(), "wrongdm");
        UUID wrongDept = createDepartment(workspace.org().adminToken(), uniqueName("Wrong"));
        assignManager(workspace.org().adminToken(), wrongDept, wrongDm.userId());
        Member foreignDm = newDepartmentManager(orgB, "fdm");
        UUID foreignDept = createDepartment(orgB.adminToken(), uniqueName("Foreign"));
        assignManager(orgB.adminToken(), foreignDept, foreignDm.userId());

        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Scope"));
        UUID proposalId = proposeAssignmentId(workspace.pm().token(), projectId,
            workspace.employee().userId(), 2, List.of(workspace.teamRoleId()));

        acceptAssignment(workspace.dm().token(), UUID.randomUUID())
            .andExpect(status().isNotFound());
        acceptAssignment(wrongDm.token(), proposalId).andExpect(status().isNotFound());
        acceptAssignment(foreignDm.token(), proposalId).andExpect(status().isNotFound());

        // A DEPARTMENT_MANAGER role holder without an actual assignment gets the
        // controlled forbidden.
        Member unassignedDm = newDepartmentManager(workspace.org(), "nodept");
        acceptAssignment(unassignedDm.token(), proposalId).andExpect(status().isForbidden());

        // The proposal is untouched by all failed attempts.
        acceptAssignment(workspace.dm().token(), proposalId).andExpect(status().isOk());
    }

    @Test
    void acceptRechecksCapacityAndKeepsProposalPending() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectA = createConsumingProject(workspace.pm().token(), uniqueName("A"));
        UUID projectB = createConsumingProject(workspace.pm().token(), uniqueName("B"));
        UUID employeeId = workspace.employee().userId();
        List<UUID> roles = List.of(workspace.teamRoleId());

        // Both fit at creation time because pending proposals reserve nothing.
        UUID sixHours = proposeAssignmentId(
            workspace.pm().token(), projectA, employeeId, 6, roles);
        UUID fiveHours = proposeAssignmentId(
            workspace.pm().token(), projectB, employeeId, 5, roles);

        acceptAssignment(workspace.dm().token(), sixHours).andExpect(status().isOk());

        // Only 2 hours remain, so the 5-hour proposal no longer fits.
        acceptAssignment(workspace.dm().token(), fiveHours).andExpect(status().isConflict());

        // The failed accept left the proposal PENDING and created no allocation.
        JsonNode pending = proposalQueueJson(workspace.dm().token(), "PENDING");
        assertThat(pending).hasSize(1);
        assertThat(pending.get(0).get("proposalId").asText()).isEqualTo(fiveHours.toString());
        assertThat(allocationRepository
            .existsByProject_IdAndEmployee_Id(projectB, employeeId)).isFalse();
    }
}
