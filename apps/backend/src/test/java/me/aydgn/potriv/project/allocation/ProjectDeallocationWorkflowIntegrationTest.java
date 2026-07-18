package me.aydgn.potriv.project.allocation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.allocation.entity.ProjectAllocation;
import me.aydgn.potriv.allocation.repository.ProjectAllocationRepository;

/**
 * Project-04/05 deallocation workflow: proposal creation, validation, review
 * accept/reject, capacity release, and reassignment as a new allocation
 * episode.
 */
class ProjectDeallocationWorkflowIntegrationTest
    extends AbstractProjectAllocationIntegrationTest {

    @Autowired
    private ProjectAllocationRepository allocationRepository;

    @Test
    void ownerCreatesPendingDeallocationProposal() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Apollo"));
        UUID allocationId = allocate(workspace, projectId, workspace.employee().userId(), 5);

        String body = proposeDeallocation(workspace.pm().token(), projectId, allocationId,
                "  Phase completed  ")
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        JsonNode proposal = objectMapper.readTree(body);

        assertThat(UUID.fromString(proposal.get("proposalId").asText())).isNotNull();
        assertThat(proposal.get("allocationId").asText()).isEqualTo(allocationId.toString());
        assertThat(proposal.get("project").get("projectId").asText())
            .isEqualTo(projectId.toString());
        assertThat(proposal.get("employee").get("userId").asText())
            .isEqualTo(workspace.employee().userId().toString());
        assertThat(proposal.get("reviewDepartment").get("departmentId").asText())
            .isEqualTo(workspace.departmentId().toString());
        assertThat(proposal.get("reason").asText()).isEqualTo("Phase completed");
        assertThat(proposal.get("status").asText()).isEqualTo("PENDING");
        assertThat(proposal.get("proposedBy").get("userId").asText())
            .isEqualTo(workspace.pm().userId().toString());
        assertThat(proposal.get("reviewedBy").isNull()).isTrue();
        assertThat(proposal.get("reviewedAt").isNull()).isTrue();
    }

    @Test
    void deallocationCreationScopeAndValidationRules() throws Exception {
        Workspace workspace = newWorkspace();
        Org orgB = newOrg();
        Member foreignPm = newProjectManager(orgB, "fpm");
        Member otherPm = newProjectManager(workspace.org(), "otherpm");

        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Scope"));
        UUID sibling = createConsumingProject(workspace.pm().token(), uniqueName("Sibling"));
        UUID allocationId = allocate(workspace, projectId, workspace.employee().userId(), 4);

        // Authentication and role boundary.
        mockMvc.perform(post("/projects/" + projectId + "/allocations/" + allocationId
                + "/deallocation-proposals")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("reason", "r"))))
            .andExpect(status().isUnauthorized());
        proposeDeallocation(workspace.employee().token(), projectId, allocationId, "reason")
            .andExpect(status().isForbidden());
        proposeDeallocation(workspace.dm().token(), projectId, allocationId, "reason")
            .andExpect(status().isForbidden());

        // Ownership, tenant scope, and allocation-project mismatch anti-leak.
        proposeDeallocation(otherPm.token(), projectId, allocationId, "reason")
            .andExpect(status().isNotFound());
        proposeDeallocation(foreignPm.token(), projectId, allocationId, "reason")
            .andExpect(status().isNotFound());
        proposeDeallocation(workspace.pm().token(), UUID.randomUUID(), allocationId, "reason")
            .andExpect(status().isNotFound());
        proposeDeallocation(workspace.pm().token(), projectId, UUID.randomUUID(), "reason")
            .andExpect(status().isNotFound());
        proposeDeallocation(workspace.pm().token(), sibling, allocationId, "reason")
            .andExpect(status().isNotFound());

        // Reason validation.
        proposeDeallocation(workspace.pm().token(), projectId, allocationId, "   ")
            .andExpect(status().isBadRequest());
        proposeDeallocation(workspace.pm().token(), projectId, allocationId, "x".repeat(5001))
            .andExpect(status().isBadRequest());
    }

    @Test
    void duplicateAndInactiveAllocationRules() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Dup"));
        UUID allocationId = allocate(workspace, projectId, workspace.employee().userId(), 4);

        UUID first = proposeDeallocationId(
            workspace.pm().token(), projectId, allocationId, "First");

        // Only one PENDING proposal per active allocation.
        proposeDeallocation(workspace.pm().token(), projectId, allocationId, "Second")
            .andExpect(status().isConflict());

        // A rejection unblocks a fresh PENDING proposal.
        rejectDeallocation(workspace.dm().token(), first).andExpect(status().isOk());
        UUID second = proposeDeallocationId(
            workspace.pm().token(), projectId, allocationId, "Retry");

        // After approval the allocation is inactive: further proposals conflict.
        acceptDeallocation(workspace.dm().token(), second).andExpect(status().isOk());
        proposeDeallocation(workspace.pm().token(), projectId, allocationId, "Too late")
            .andExpect(status().isConflict());
    }

    @Test
    void acceptDeallocatesAndReleasesCapacity() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Release"));
        UUID employeeId = workspace.employee().userId();
        UUID allocationId = allocate(workspace, projectId, employeeId, 8);

        // Fully allocated: nothing else fits.
        UUID other = createConsumingProject(workspace.pm().token(), uniqueName("Other"));
        proposeAssignment(workspace.pm().token(), other, employeeId, 1,
                List.of(workspace.teamRoleId()))
            .andExpect(status().isConflict());

        UUID proposalId = proposeDeallocationId(
            workspace.pm().token(), projectId, allocationId, "Rotation");
        String body = acceptDeallocation(workspace.dm().token(), proposalId)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JsonNode review = objectMapper.readTree(body);

        assertThat(review.get("proposal").get("status").asText()).isEqualTo("APPROVED");
        assertThat(review.get("proposal").get("reviewedBy").get("userId").asText())
            .isEqualTo(workspace.dm().userId().toString());
        assertThat(review.get("proposal").get("reviewedAt").isNull()).isFalse();
        assertThat(review.get("allocation").get("deallocatedAt").isNull()).isFalse();

        ProjectAllocation allocation = allocationRepository.findById(allocationId).orElseThrow();
        assertThat(allocation.getDeallocatedAt()).isNotNull();

        // Capacity is released, and the approved row shows up in the queue as a
        // DEALLOCATION entry with allocation and reason populated.
        proposeAssignment(workspace.pm().token(), other, employeeId, 1,
                List.of(workspace.teamRoleId()))
            .andExpect(status().isCreated());
        JsonNode approvedQueue = proposalQueueJson(workspace.dm().token(), "APPROVED");
        JsonNode deallocationRow = null;
        for (JsonNode row : approvedQueue) {
            if (row.get("proposalType").asText().equals("DEALLOCATION")) {
                deallocationRow = row;
            }
        }
        assertThat(deallocationRow).isNotNull();
        assertThat(deallocationRow.get("allocationId").asText())
            .isEqualTo(allocationId.toString());
        assertThat(deallocationRow.get("reason").asText()).isEqualTo("Rotation");
    }

    @Test
    void rejectKeepsAllocationActiveAndCapacityConsumed() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Keep"));
        UUID employeeId = workspace.employee().userId();
        UUID allocationId = allocate(workspace, projectId, employeeId, 8);

        UUID proposalId = proposeDeallocationId(
            workspace.pm().token(), projectId, allocationId, "Considered");
        String body = rejectDeallocation(workspace.dm().token(), proposalId)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JsonNode review = objectMapper.readTree(body);

        assertThat(review.get("proposal").get("status").asText()).isEqualTo("REJECTED");
        assertThat(review.get("proposal").get("reviewedAt").isNull()).isFalse();
        assertThat(review.get("allocation").get("deallocatedAt").isNull()).isTrue();

        ProjectAllocation allocation = allocationRepository.findById(allocationId).orElseThrow();
        assertThat(allocation.getDeallocatedAt()).isNull();

        // Capacity was not released.
        UUID other = createConsumingProject(workspace.pm().token(), uniqueName("Other"));
        proposeAssignment(workspace.pm().token(), other, employeeId, 1,
                List.of(workspace.teamRoleId()))
            .andExpect(status().isConflict());
    }

    @Test
    void repeatedDeallocationReviewReturnsConflict() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Repeat"));
        UUID employeeId = workspace.employee().userId();
        Member second = newEmployee(workspace.org(), "emp2");
        addMember(workspace.dm().token(), workspace.departmentId(), second.userId());
        UUID allocationA = allocate(workspace, projectId, employeeId, 3);
        UUID allocationB = allocate(workspace, projectId, second.userId(), 3);

        UUID approved = proposeDeallocationId(
            workspace.pm().token(), projectId, allocationA, "Approved");
        UUID rejected = proposeDeallocationId(
            workspace.pm().token(), projectId, allocationB, "Rejected");
        acceptDeallocation(workspace.dm().token(), approved).andExpect(status().isOk());
        rejectDeallocation(workspace.dm().token(), rejected).andExpect(status().isOk());

        acceptDeallocation(workspace.dm().token(), approved).andExpect(status().isConflict());
        rejectDeallocation(workspace.dm().token(), approved).andExpect(status().isConflict());
        acceptDeallocation(workspace.dm().token(), rejected).andExpect(status().isConflict());
        rejectDeallocation(workspace.dm().token(), rejected).andExpect(status().isConflict());

        // Wrong-department, cross-org, unknown, and unassigned reviewers.
        UUID freshAllocation = allocationB;
        UUID pending = proposeDeallocationId(
            workspace.pm().token(), projectId, freshAllocation, "Pending");
        Member wrongDm = newDepartmentManager(workspace.org(), "wrongdm");
        UUID wrongDept = createDepartment(workspace.org().adminToken(), uniqueName("Wrong"));
        assignManager(workspace.org().adminToken(), wrongDept, wrongDm.userId());
        Member unassignedDm = newDepartmentManager(workspace.org(), "nodept");

        acceptDeallocation(wrongDm.token(), pending).andExpect(status().isNotFound());
        acceptDeallocation(workspace.dm().token(), UUID.randomUUID())
            .andExpect(status().isNotFound());
        acceptDeallocation(unassignedDm.token(), pending).andExpect(status().isForbidden());
    }

    @Test
    void reassignmentAfterDeallocationCreatesNewEpisode() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Episode"));
        UUID employeeId = workspace.employee().userId();

        UUID firstAllocation = allocate(workspace, projectId, employeeId, 8);
        deallocate(workspace, projectId, firstAllocation);

        // Reassignment to the same project succeeds as a brand-new episode.
        UUID reassignment = proposeAssignmentId(workspace.pm().token(), projectId,
            employeeId, 6, List.of(workspace.teamRoleId()));
        UUID secondAllocation =
            acceptAssignmentForAllocationId(workspace.dm().token(), reassignment);

        assertThat(secondAllocation).isNotEqualTo(firstAllocation);

        // The historical episode survives untouched next to the active one.
        ProjectAllocation first = allocationRepository.findById(firstAllocation).orElseThrow();
        ProjectAllocation second = allocationRepository.findById(secondAllocation).orElseThrow();
        assertThat(first.getDeallocatedAt()).isNotNull();
        assertThat(first.getWorkHoursPerDay()).isEqualTo(8);
        assertThat(second.getDeallocatedAt()).isNull();
        assertThat(second.getWorkHoursPerDay()).isEqualTo(6);
        assertThat(second.getProject().getId()).isEqualTo(projectId);
        assertThat(second.getEmployee().getId()).isEqualTo(employeeId);
    }

    @Test
    void projectDeletionCleansUpAllocationWorkflowRows() throws Exception {
        Workspace workspace = newWorkspace();

        // A NOT_STARTED project stays deletable; capacity is irrelevant here.
        UUID projectId = createProjectId(workspace.pm().token(),
            projectPayload(uniqueName("Cleanup")));
        UUID employeeId = workspace.employee().userId();
        UUID allocationId = allocate(workspace, projectId, employeeId, 4);
        UUID deallocationProposal = proposeDeallocationId(
            workspace.pm().token(), projectId, allocationId, "History");
        rejectDeallocation(workspace.dm().token(), deallocationProposal)
            .andExpect(status().isOk());

        deleteProject(workspace.pm().token(), projectId, "?confirmed=true")
            .andExpect(status().isNoContent());

        // Allocation workflow rows are gone with the project.
        assertThat(allocationRepository.findById(allocationId)).isEmpty();
        assertThat(allocationRepository
            .existsByProject_IdAndEmployee_Id(projectId, employeeId)).isFalse();
        getProject(workspace.pm().token(), projectId).andExpect(status().isNotFound());
    }
}
