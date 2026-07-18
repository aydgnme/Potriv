package me.aydgn.potriv.project.allocation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Project-03 assignment proposal creation: snapshots, eligibility, capacity at
 * creation time, duplicate-pending rules, and role snapshot rules.
 */
class ProjectAssignmentProposalIntegrationTest extends AbstractProjectAllocationIntegrationTest {

    @Test
    void ownerCreatesPendingProposalWithSnapshots() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Apollo"));

        Map<String, Object> payload = new HashMap<>();
        payload.put("employeeId", workspace.employee().userId().toString());
        payload.put("workHoursPerDay", 5);
        payload.put("teamRoleIds", List.of(workspace.teamRoleId().toString()));
        payload.put("comments", "  Strong backend candidate  ");

        String body = proposeAssignmentRaw(workspace.pm().token(), projectId, payload)
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        JsonNode proposal = objectMapper.readTree(body);

        assertThat(UUID.fromString(proposal.get("proposalId").asText())).isNotNull();
        assertThat(proposal.get("projectId").asText()).isEqualTo(projectId.toString());
        assertThat(proposal.get("status").asText()).isEqualTo("PENDING");
        assertThat(proposal.get("workHoursPerDay").asInt()).isEqualTo(5);
        assertThat(proposal.get("comments").asText()).isEqualTo("Strong backend candidate");

        // Safe employee summary and the review-department snapshot.
        assertThat(proposal.get("employee").get("userId").asText())
            .isEqualTo(workspace.employee().userId().toString());
        assertThat(proposal.get("employee").has("passwordHash")).isFalse();
        assertThat(proposal.get("reviewDepartment").get("departmentId").asText())
            .isEqualTo(workspace.departmentId().toString());

        // Proposal-time role snapshot and the proposing PM; not yet reviewed.
        assertThat(proposal.get("teamRoles")).hasSize(1);
        assertThat(proposal.get("teamRoles").get(0).get("teamRoleId").asText())
            .isEqualTo(workspace.teamRoleId().toString());
        assertThat(proposal.get("proposedBy").get("userId").asText())
            .isEqualTo(workspace.pm().userId().toString());
        assertThat(proposal.get("reviewedBy").isNull()).isTrue();
        assertThat(proposal.get("reviewedAt").isNull()).isTrue();
    }

    @Test
    void proposalCreationScopeAndAccessRules() throws Exception {
        Workspace workspace = newWorkspace();
        Org orgB = newOrg();
        Member foreignPm = newProjectManager(orgB, "fpm");
        Member otherPm = newProjectManager(workspace.org(), "otherpm");
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Scoped"));

        Map<String, Object> payload = new HashMap<>();
        payload.put("employeeId", workspace.employee().userId().toString());
        payload.put("workHoursPerDay", 2);
        payload.put("teamRoleIds", List.of(workspace.teamRoleId().toString()));

        // Unauthenticated and role-based rejections.
        mockMvc.perform(post("/projects/" + projectId + "/assignment-proposals")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload)))
            .andExpect(status().isUnauthorized());
        proposeAssignmentRaw(workspace.employee().token(), projectId, payload)
            .andExpect(status().isForbidden());
        proposeAssignmentRaw(workspace.dm().token(), projectId, payload)
            .andExpect(status().isForbidden());

        // Ownership and tenant anti-leak.
        proposeAssignmentRaw(otherPm.token(), projectId, payload)
            .andExpect(status().isNotFound());
        proposeAssignmentRaw(foreignPm.token(), projectId, payload)
            .andExpect(status().isNotFound());
        proposeAssignmentRaw(workspace.pm().token(), UUID.randomUUID(), payload)
            .andExpect(status().isNotFound());
    }

    @Test
    void employeeEligibilityRules() throws Exception {
        Workspace workspace = newWorkspace();
        Org orgB = newOrg();
        Member foreignEmployee = newEmployee(orgB, "femp");
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Eligible"));
        List<UUID> roles = List.of(workspace.teamRoleId());

        // Unknown and cross-org employees are indistinguishable: 404.
        proposeAssignment(workspace.pm().token(), projectId, UUID.randomUUID(), 2, roles)
            .andExpect(status().isNotFound());
        proposeAssignment(workspace.pm().token(), projectId, foreignEmployee.userId(), 2, roles)
            .andExpect(status().isNotFound());

        // Same-org user without a department membership cannot be reviewed.
        Member unassigned = newEmployee(workspace.org(), "loose");
        proposeAssignment(workspace.pm().token(), projectId, unassigned.userId(), 2, roles)
            .andExpect(status().isConflict());

        // A multi-role employee (also a PM) remains an eligible assignment target.
        Member hybrid = newProjectManager(workspace.org(), "hybrid");
        addMember(workspace.dm().token(), workspace.departmentId(), hybrid.userId());
        proposeAssignment(workspace.pm().token(), projectId, hybrid.userId(), 2, roles)
            .andExpect(status().isCreated());
    }

    @Test
    void capacityRulesAtProposalCreation() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectA = createConsumingProject(workspace.pm().token(), uniqueName("A"));
        UUID projectB = createConsumingProject(workspace.pm().token(), uniqueName("B"));
        List<UUID> roles = List.of(workspace.teamRoleId());
        UUID employeeId = workspace.employee().userId();

        // Bean validation floor and the 8-hour ceiling.
        proposeAssignment(workspace.pm().token(), projectA, employeeId, 0, roles)
            .andExpect(status().isBadRequest());
        proposeAssignment(workspace.pm().token(), projectA, employeeId, 9, roles)
            .andExpect(status().isConflict());

        // Pending proposals do not reserve capacity: two full-day pending
        // proposals on different projects are both allowed.
        proposeAssignment(workspace.pm().token(), projectA, employeeId, 8, roles)
            .andExpect(status().isCreated());
        UUID pendingB = proposeAssignmentId(
            workspace.pm().token(), projectB, employeeId, 8, roles);

        // An accepted allocation does consume capacity: a third project proposal
        // exceeding the remainder is rejected.
        acceptAssignment(workspace.dm().token(), pendingB).andExpect(status().isOk());
        UUID projectC = createConsumingProject(workspace.pm().token(), uniqueName("C"));
        proposeAssignment(workspace.pm().token(), projectC, employeeId, 1, roles)
            .andExpect(status().isConflict());
    }

    @Test
    void duplicatePendingRules() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Dup"));
        List<UUID> roles = List.of(workspace.teamRoleId());
        UUID employeeId = workspace.employee().userId();

        UUID first = proposeAssignmentId(workspace.pm().token(), projectId, employeeId, 3, roles);

        // A second PENDING proposal for the same project+employee conflicts.
        proposeAssignment(workspace.pm().token(), projectId, employeeId, 2, roles)
            .andExpect(status().isConflict());

        // After a rejection, a fresh PENDING proposal is allowed again.
        rejectAssignment(workspace.dm().token(), first).andExpect(status().isOk());
        UUID second = proposeAssignmentId(workspace.pm().token(), projectId, employeeId, 3, roles);

        // Once approved (active allocation), creation may pass the pending check,
        // but acceptance is blocked by the active-allocation rule.
        acceptAssignment(workspace.dm().token(), second).andExpect(status().isOk());
        UUID third = proposeAssignmentId(workspace.pm().token(), projectId, employeeId, 2, roles);
        acceptAssignment(workspace.dm().token(), third).andExpect(status().isConflict());
    }

    @Test
    void roleSnapshotRules() throws Exception {
        Workspace workspace = newWorkspace();
        Org orgB = newOrg();
        UUID foreignRole = createTeamRoleId(orgB.adminToken(), uniqueName("Foreign"));
        UUID inactiveRole = createTeamRoleId(workspace.org().adminToken(), uniqueName("Legacy"));
        deactivateTeamRole(workspace.org().adminToken(), inactiveRole);
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Roles"));
        UUID employeeId = workspace.employee().userId();

        proposeAssignment(workspace.pm().token(), projectId, employeeId, 2, List.of())
            .andExpect(status().isBadRequest());
        proposeAssignment(workspace.pm().token(), projectId, employeeId, 2,
                List.of(workspace.teamRoleId(), workspace.teamRoleId()))
            .andExpect(status().isBadRequest());
        proposeAssignment(workspace.pm().token(), projectId, employeeId, 2,
                List.of(inactiveRole))
            .andExpect(status().isBadRequest());
        proposeAssignment(workspace.pm().token(), projectId, employeeId, 2,
                List.of(UUID.randomUUID()))
            .andExpect(status().isNotFound());
        proposeAssignment(workspace.pm().token(), projectId, employeeId, 2,
                List.of(foreignRole))
            .andExpect(status().isNotFound());

        // None of the rejected attempts left partial state: a valid proposal
        // still succeeds with the full role snapshot persisted atomically.
        UUID secondRole = createTeamRoleId(workspace.org().adminToken(), uniqueName("Frontend"));
        String body = proposeAssignment(workspace.pm().token(), projectId, employeeId, 2,
                List.of(workspace.teamRoleId(), secondRole))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        JsonNode teamRoles = objectMapper.readTree(body).get("teamRoles");
        assertThat(teamRoles).hasSize(2);
        assertThat(teamRoles).extracting(role -> role.get("teamRoleId").asText())
            .containsExactlyInAnyOrder(
                workspace.teamRoleId().toString(), secondRole.toString());
    }

    @Test
    void commentValidationRules() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Comments"));

        // Comments are optional; a blank value is stored as null.
        Map<String, Object> blankComments = new HashMap<>();
        blankComments.put("employeeId", workspace.employee().userId().toString());
        blankComments.put("workHoursPerDay", 1);
        blankComments.put("teamRoleIds", List.of(workspace.teamRoleId().toString()));
        blankComments.put("comments", "   ");
        String body = proposeAssignmentRaw(workspace.pm().token(), projectId, blankComments)
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        assertThat(objectMapper.readTree(body).get("comments").isNull()).isTrue();

        // Over-length comments are rejected by bean validation.
        Member other = newEmployee(workspace.org(), "emp2");
        addMember(workspace.dm().token(), workspace.departmentId(), other.userId());
        Map<String, Object> tooLong = new HashMap<>(blankComments);
        tooLong.put("employeeId", other.userId().toString());
        tooLong.put("comments", "x".repeat(5001));
        proposeAssignmentRaw(workspace.pm().token(), projectId, tooLong)
            .andExpect(status().isBadRequest());
    }
}
