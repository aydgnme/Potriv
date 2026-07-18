package me.aydgn.potriv.project.regression;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Project-09 detail page: full metadata payload, relationship-based
 * visibility, snapshot semantics, and anti-leak behavior.
 */
class ProjectDetailsViewIntegrationTest extends AbstractProjectDomainRegressionIntegrationTest {

    @Test
    void ownerSeesTheFullDetailPayload() throws Exception {
        Workspace workspace = newWorkspace();
        Map<String, Object> payload = projectPayload(uniqueName("Apollo"));
        payload.put("status", "STARTING");
        payload.put("generalDescription", "Telemetry platform");
        payload.put("technologyStack", List.of("Java", "angular"));
        payload.put("teamRoles", List.of(
            Map.of("teamRoleId", workspace.teamRoleId().toString(), "requiredMembers", 2)));
        UUID projectId = createProjectId(workspace.pm().token(), payload);
        UUID allocationId = allocate(workspace, projectId, workspace.employee().userId(), 4);

        JsonNode details = projectDetailsJson(workspace.pm().token(), projectId);

        assertThat(details.get("projectId").asText()).isEqualTo(projectId.toString());
        assertThat(details.get("projectName").asText()).isEqualTo(payload.get("name"));
        assertThat(details.get("projectStatus").asText()).isEqualTo("STARTING");
        assertThat(details.get("projectPeriod").asText()).isEqualTo("FIXED");
        assertThat(details.get("startDate").asText()).isEqualTo("2026-08-01");
        assertThat(details.get("deadlineDate").asText()).isEqualTo("2026-12-31");
        assertThat(details.get("generalDescription").asText())
            .isEqualTo("Telemetry platform");
        assertThat(details.get("projectManager").get("userId").asText())
            .isEqualTo(workspace.pm().userId().toString());
        assertThat(details.get("generatedAt").isNull()).isFalse();

        // Name-ordered technology stack and the role requirements.
        assertThat(details.get("technologyStack")).extracting(
                technology -> technology.get("name").asText())
            .containsExactly("angular", "Java");
        assertThat(details.get("teamRoleRequirements")).hasSize(1);
        JsonNode requirement = details.get("teamRoleRequirements").get(0);
        assertThat(requirement.get("teamRole").get("teamRoleId").asText())
            .isEqualTo(workspace.teamRoleId().toString());
        assertThat(requirement.get("requiredMembers").asInt()).isEqualTo(2);

        // The active member with snapshot data; no past members yet.
        assertThat(details.get("activeMembers")).hasSize(1);
        JsonNode member = details.get("activeMembers").get(0);
        assertThat(member.get("allocationId").asText()).isEqualTo(allocationId.toString());
        assertThat(member.get("reviewDepartment").get("departmentId").asText())
            .isEqualTo(workspace.departmentId().toString());
        assertThat(member.get("roles").get(0).get("teamRoleId").asText())
            .isEqualTo(workspace.teamRoleId().toString());
        assertThat(details.get("pastMembers")).isEmpty();
    }

    @Test
    void nullableDeadlineForOngoingProjects() throws Exception {
        Workspace workspace = newWorkspace();
        Map<String, Object> payload = projectPayload(uniqueName("Ongoing"));
        payload.put("status", "STARTING");
        payload.put("period", "ONGOING");
        payload.remove("deadlineDate");
        UUID projectId = createProjectId(workspace.pm().token(), payload);

        JsonNode details = projectDetailsJson(workspace.pm().token(), projectId);
        assertThat(details.get("projectPeriod").asText()).isEqualTo("ONGOING");
        assertThat(details.get("deadlineDate").isNull()).isTrue();
    }

    @Test
    void deallocationMovesMemberToPastWithoutLeakingTheReason() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Past"));
        UUID employeeId = workspace.employee().userId();
        UUID allocationId = allocate(workspace, projectId, employeeId, 4);

        UUID deallocation = proposeDeallocationId(workspace.pm().token(), projectId,
            allocationId, "Confidential rotation reason");
        acceptDeallocation(workspace.dm().token(), deallocation).andExpect(status().isOk());

        // A second, pending proposal must not surface in the detail page either.
        Member proposedOnly = newEmployee(workspace.org(), "proposed");
        addMember(workspace.dm().token(), workspace.departmentId(), proposedOnly.userId());
        proposeAssignmentId(workspace.pm().token(), projectId, proposedOnly.userId(), 2,
            List.of(workspace.teamRoleId()));

        String body = getProjectDetails(workspace.employee().token(), projectId)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JsonNode details = objectMapper.readTree(body);

        assertThat(details.get("activeMembers")).isEmpty();
        assertThat(details.get("pastMembers")).hasSize(1);
        JsonNode pastMember = details.get("pastMembers").get(0);
        assertThat(pastMember.get("allocationId").asText()).isEqualTo(allocationId.toString());
        assertThat(pastMember.get("deallocatedAt").isNull()).isFalse();

        // Membership details only: no deallocation audit data, no proposal
        // queues, and the proposed-only employee is absent from the payload.
        assertThat(body).doesNotContain("Confidential rotation reason",
            "deallocationReason", "proposedMembers", proposedOnly.userId().toString());
    }

    @Test
    void visibilityMatrix() throws Exception {
        Workspace workspace = newWorkspace();
        Org orgB = newOrg();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Vis"));
        List<UUID> roles = List.of(workspace.teamRoleId());

        UUID activeAllocation = allocate(workspace, projectId, workspace.employee().userId(), 2);
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

        getProjectDetails(workspace.pm().token(), projectId).andExpect(status().isOk());
        getProjectDetails(workspace.employee().token(), projectId).andExpect(status().isOk());
        getProjectDetails(pastEmployee.token(), projectId).andExpect(status().isOk());
        getProjectDetails(workspace.dm().token(), projectId).andExpect(status().isOk());
        getProjectDetails(proposedOnly.token(), projectId).andExpect(status().isNotFound());
        getProjectDetails(unassignedDm.token(), projectId).andExpect(status().isForbidden());
        getProjectDetails(unrelated.token(), projectId).andExpect(status().isNotFound());
        getProjectDetails(otherPm.token(), projectId).andExpect(status().isNotFound());
        getProjectDetails(foreign.token(), projectId).andExpect(status().isNotFound());
        getProjectDetails(workspace.pm().token(), UUID.randomUUID())
            .andExpect(status().isNotFound());
        mockMvc.perform(get("/projects/" + projectId + "/details"))
            .andExpect(status().isUnauthorized());

        // The active member set is untouched by the probes.
        JsonNode details = projectDetailsJson(workspace.pm().token(), projectId);
        assertThat(memberOf(details.get("activeMembers"), workspace.employee().userId())
            .get("allocationId").asText()).isEqualTo(activeAllocation.toString());
    }

    @Test
    void snapshotsSurviveLaterRequirementAndMembershipChanges() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Snapshot"));
        UUID employeeId = workspace.employee().userId();
        allocate(workspace, projectId, employeeId, 4);

        // Replace requirements and move the employee to another department.
        UUID newRole = createTeamRoleId(workspace.org().adminToken(), uniqueName("Replaced"));
        patchProjectExpectOk(workspace.pm().token(), projectId, Map.of("teamRoles",
            List.of(Map.of("teamRoleId", newRole.toString(), "requiredMembers", 1))));
        Member otherDm = newDepartmentManager(workspace.org(), "dm2");
        UUID otherDept = createDepartment(workspace.org().adminToken(), uniqueName("Design"));
        assignManager(workspace.org().adminToken(), otherDept, otherDm.userId());
        removeMember(workspace.dm().token(), workspace.departmentId(), employeeId);
        addMember(otherDm.token(), otherDept, employeeId);

        JsonNode details = projectDetailsJson(workspace.pm().token(), projectId);

        // Requirements reflect the current project configuration…
        assertThat(details.get("teamRoleRequirements").get(0).get("teamRole")
            .get("teamRoleId").asText()).isEqualTo(newRole.toString());
        // …while the member keeps the proposal-time role and review department.
        JsonNode member = details.get("activeMembers").get(0);
        assertThat(member.get("roles").get(0).get("teamRoleId").asText())
            .isEqualTo(workspace.teamRoleId().toString());
        assertThat(member.get("reviewDepartment").get("departmentId").asText())
            .isEqualTo(workspace.departmentId().toString());
    }
}
