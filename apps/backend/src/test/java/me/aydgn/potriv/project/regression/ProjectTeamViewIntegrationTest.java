package me.aydgn.potriv.project.regression;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Project-06 team view: proposed/active/past sections tracking the real
 * allocation workflow, snapshot semantics, ordering, and visibility.
 */
class ProjectTeamViewIntegrationTest extends AbstractProjectDomainRegressionIntegrationTest {

    @Test
    void sectionsTrackTheAllocationWorkflow() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Flow"));
        UUID employeeId = workspace.employee().userId();

        UUID proposalId = proposeAssignmentId(workspace.pm().token(), projectId, employeeId, 4,
            List.of(workspace.teamRoleId()));

        // Pending: proposed only.
        JsonNode pending = teamViewJson(workspace.pm().token(), projectId);
        assertThat(pending.get("generatedAt").isNull()).isFalse();
        assertThat(pending.get("proposedMembers")).hasSize(1);
        JsonNode proposed = pending.get("proposedMembers").get(0);
        assertThat(proposed.get("proposalId").asText()).isEqualTo(proposalId.toString());
        assertThat(proposed.get("employee").get("userId").asText())
            .isEqualTo(employeeId.toString());
        assertThat(proposed.get("reviewDepartment").get("departmentId").asText())
            .isEqualTo(workspace.departmentId().toString());
        assertThat(pending.get("activeMembers")).isEmpty();
        assertThat(pending.get("pastMembers")).isEmpty();

        // Accepted: active only.
        UUID allocationId =
            acceptAssignmentForAllocationId(workspace.dm().token(), proposalId);
        JsonNode active = teamViewJson(workspace.pm().token(), projectId);
        assertThat(active.get("proposedMembers")).isEmpty();
        assertThat(active.get("pastMembers")).isEmpty();
        assertThat(active.get("activeMembers")).hasSize(1);
        JsonNode activeMember = active.get("activeMembers").get(0);
        assertThat(activeMember.get("allocationId").asText()).isEqualTo(allocationId.toString());
        assertThat(activeMember.get("assignmentProposalId").asText())
            .isEqualTo(proposalId.toString());
        assertThat(activeMember.get("workHoursPerDay").asInt()).isEqualTo(4);
        assertThat(activeMember.get("roles")).hasSize(1);
        assertThat(activeMember.get("approvedBy").get("userId").asText())
            .isEqualTo(workspace.dm().userId().toString());

        // Deallocated: past only, with the reason exposed on this endpoint.
        UUID deallocation = proposeDeallocationId(
            workspace.pm().token(), projectId, allocationId, "Rotation done");
        acceptDeallocation(workspace.dm().token(), deallocation).andExpect(status().isOk());
        JsonNode past = teamViewJson(workspace.pm().token(), projectId);
        assertThat(past.get("activeMembers")).isEmpty();
        assertThat(past.get("pastMembers")).hasSize(1);
        JsonNode pastMember = past.get("pastMembers").get(0);
        assertThat(pastMember.get("allocationId").asText()).isEqualTo(allocationId.toString());
        assertThat(pastMember.get("deallocatedAt").isNull()).isFalse();
        assertThat(pastMember.get("deallocationReason").asText()).isEqualTo("Rotation done");
        assertThat(pastMember.get("deallocationApprovedBy").get("userId").asText())
            .isEqualTo(workspace.dm().userId().toString());
    }

    @Test
    void rejectedProposalsNeverSurfaceAsMembers() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Rejects"));
        UUID employeeId = workspace.employee().userId();

        // Rejected assignment: gone from all sections.
        UUID rejected = proposeAssignmentId(workspace.pm().token(), projectId, employeeId, 4,
            List.of(workspace.teamRoleId()));
        rejectAssignment(workspace.dm().token(), rejected).andExpect(status().isOk());
        JsonNode afterAssignmentReject = teamViewJson(workspace.pm().token(), projectId);
        assertThat(afterAssignmentReject.get("proposedMembers")).isEmpty();
        assertThat(afterAssignmentReject.get("activeMembers")).isEmpty();
        assertThat(afterAssignmentReject.get("pastMembers")).isEmpty();

        // Rejected deallocation: the member stays active.
        UUID allocationId = allocate(workspace, projectId, employeeId, 4);
        UUID deallocation = proposeDeallocationId(
            workspace.pm().token(), projectId, allocationId, "Denied");
        rejectDeallocation(workspace.dm().token(), deallocation).andExpect(status().isOk());
        JsonNode afterDeallocationReject = teamViewJson(workspace.pm().token(), projectId);
        assertThat(afterDeallocationReject.get("activeMembers")).hasSize(1);
        assertThat(afterDeallocationReject.get("pastMembers")).isEmpty();
    }

    @Test
    void snapshotsSurviveLaterRequirementAndMembershipChanges() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Snapshot"));
        UUID employeeId = workspace.employee().userId();
        allocate(workspace, projectId, employeeId, 4);

        // Replace the project's role requirements and move the employee to a
        // different department after the allocation.
        UUID newRole = createTeamRoleId(workspace.org().adminToken(), uniqueName("Replaced"));
        patchProjectExpectOk(workspace.pm().token(), projectId, Map.of("teamRoles",
            List.of(Map.of("teamRoleId", newRole.toString(), "requiredMembers", 1))));
        Member otherDm = newDepartmentManager(workspace.org(), "dm2");
        UUID otherDept = createDepartment(workspace.org().adminToken(), uniqueName("Design"));
        assignManager(workspace.org().adminToken(), otherDept, otherDm.userId());
        removeMember(workspace.dm().token(), workspace.departmentId(), employeeId);
        addMember(otherDm.token(), otherDept, employeeId);

        // The member still shows the proposal-time role and review department.
        JsonNode view = teamViewJson(workspace.pm().token(), projectId);
        JsonNode member = view.get("activeMembers").get(0);
        assertThat(member.get("roles")).hasSize(1);
        assertThat(member.get("roles").get(0).get("teamRoleId").asText())
            .isEqualTo(workspace.teamRoleId().toString());
        assertThat(member.get("reviewDepartment").get("departmentId").asText())
            .isEqualTo(workspace.departmentId().toString());
    }

    @Test
    void sectionsAreOrderedDeterministically() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Order"));
        List<UUID> roles = List.of(workspace.teamRoleId());

        Member second = newEmployee(workspace.org(), "emp2");
        addMember(workspace.dm().token(), workspace.departmentId(), second.userId());
        Member third = newEmployee(workspace.org(), "emp3");
        addMember(workspace.dm().token(), workspace.departmentId(), third.userId());

        // Proposed members: oldest proposal first.
        UUID firstProposal = proposeAssignmentId(workspace.pm().token(), projectId,
            workspace.employee().userId(), 2, roles);
        UUID secondProposal = proposeAssignmentId(workspace.pm().token(), projectId,
            second.userId(), 2, roles);
        JsonNode proposed = teamViewJson(workspace.pm().token(), projectId)
            .get("proposedMembers");
        assertThat(proposed.get(0).get("proposalId").asText())
            .isEqualTo(firstProposal.toString());
        assertThat(proposed.get(1).get("proposalId").asText())
            .isEqualTo(secondProposal.toString());

        // Past members: latest deallocation first.
        UUID firstAllocation =
            acceptAssignmentForAllocationId(workspace.dm().token(), firstProposal);
        UUID secondAllocation =
            acceptAssignmentForAllocationId(workspace.dm().token(), secondProposal);
        deallocate(workspace, projectId, firstAllocation);
        deallocate(workspace, projectId, secondAllocation);
        JsonNode past = teamViewJson(workspace.pm().token(), projectId).get("pastMembers");
        assertThat(past).hasSize(2);
        assertThat(past.get(0).get("allocationId").asText())
            .isEqualTo(secondAllocation.toString());
        assertThat(past.get(1).get("allocationId").asText())
            .isEqualTo(firstAllocation.toString());
    }

    @Test
    void visibilityMatrix() throws Exception {
        Workspace workspace = newWorkspace();
        Org orgB = newOrg();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Vis"));
        List<UUID> roles = List.of(workspace.teamRoleId());

        // Active employee, past employee, and a proposed-only employee.
        UUID activeAllocation =
            allocate(workspace, projectId, workspace.employee().userId(), 2);
        Member pastEmployee = newEmployee(workspace.org(), "past");
        addMember(workspace.dm().token(), workspace.departmentId(), pastEmployee.userId());
        UUID pastAllocation = allocate(workspace, projectId, pastEmployee.userId(), 2);
        deallocate(workspace, projectId, pastAllocation);
        Member proposedOnly = newEmployee(workspace.org(), "proposed");
        addMember(workspace.dm().token(), workspace.departmentId(), proposedOnly.userId());
        proposeAssignmentId(workspace.pm().token(), projectId, proposedOnly.userId(), 2, roles);

        Member unrelated = newEmployee(workspace.org(), "unrelated");
        Member otherPm = newProjectManager(workspace.org(), "otherpm");
        Member unassignedDm = newDepartmentManager(workspace.org(), "nodept");
        Member foreign = newEmployee(orgB, "foreign");

        getTeamView(workspace.pm().token(), projectId).andExpect(status().isOk());
        getTeamView(workspace.employee().token(), projectId).andExpect(status().isOk());
        getTeamView(pastEmployee.token(), projectId).andExpect(status().isOk());
        getTeamView(workspace.dm().token(), projectId).andExpect(status().isOk());
        getTeamView(proposedOnly.token(), projectId).andExpect(status().isNotFound());
        getTeamView(unassignedDm.token(), projectId).andExpect(status().isForbidden());
        getTeamView(unrelated.token(), projectId).andExpect(status().isNotFound());
        getTeamView(otherPm.token(), projectId).andExpect(status().isNotFound());
        getTeamView(foreign.token(), projectId).andExpect(status().isNotFound());
        mockMvc.perform(MockMvcRequestBuilders.get("/projects/" + projectId + "/team"))
            .andExpect(status().isUnauthorized());

        // The active allocation was untouched by the visibility probes.
        JsonNode view = teamViewJson(workspace.pm().token(), projectId);
        assertThat(memberOf(view.get("activeMembers"), workspace.employee().userId())
            .get("allocationId").asText()).isEqualTo(activeAllocation.toString());
    }
}
