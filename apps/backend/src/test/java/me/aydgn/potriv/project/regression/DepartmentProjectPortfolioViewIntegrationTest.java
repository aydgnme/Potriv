package me.aydgn.potriv.project.regression;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Project-08 department portfolio: active-allocation-based inclusion limited to
 * the managed department's members, derived from review-department snapshots.
 */
class DepartmentProjectPortfolioViewIntegrationTest
    extends AbstractProjectDomainRegressionIntegrationTest {

    @Test
    void portfolioFollowsActiveAllocations() throws Exception {
        Workspace workspace = newWorkspace();

        // Empty portfolio: 200 with the department summary and no projects.
        JsonNode empty = departmentProjectsJson(workspace.dm().token(), null);
        assertThat(empty.get("department").get("departmentId").asText())
            .isEqualTo(workspace.departmentId().toString());
        assertThat(empty.get("projects")).isEmpty();
        assertThat(empty.get("generatedAt").isNull()).isFalse();

        // An active allocation pulls the project in with the member.
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Active"));
        UUID allocationId = allocate(workspace, projectId, workspace.employee().userId(), 4);
        JsonNode active = departmentProjectsJson(workspace.dm().token(), null);
        assertThat(active.get("projects")).hasSize(1);
        JsonNode project = active.get("projects").get(0);
        assertThat(project.get("projectId").asText()).isEqualTo(projectId.toString());
        assertThat(project.get("teamMembers")).hasSize(1);
        assertThat(project.get("teamMembers").get(0).get("allocationId").asText())
            .isEqualTo(allocationId.toString());
        assertThat(project.get("teamMembers").get(0).get("roles").get(0)
            .get("teamRoleId").asText()).isEqualTo(workspace.teamRoleId().toString());

        // Only past allocations left: the project drops out again.
        deallocate(workspace, projectId, allocationId);
        JsonNode afterDeallocation = departmentProjectsJson(workspace.dm().token(), null);
        assertThat(afterDeallocation.get("projects")).isEmpty();
    }

    @Test
    void managersSeeOnlyTheirOwnDepartmentMembers() throws Exception {
        Workspace workspace = newWorkspace();

        // A second department with its own manager and member, allocated to the
        // same project.
        Member otherDm = newDepartmentManager(workspace.org(), "dmB");
        UUID otherDept = createDepartment(workspace.org().adminToken(), uniqueName("Design"));
        assignManager(workspace.org().adminToken(), otherDept, otherDm.userId());
        Member otherEmployee = newEmployee(workspace.org(), "empB");
        addMember(otherDm.token(), otherDept, otherEmployee.userId());

        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Shared"));
        allocate(workspace, projectId, workspace.employee().userId(), 4);
        UUID proposalB = proposeAssignmentId(workspace.pm().token(), projectId,
            otherEmployee.userId(), 4, java.util.List.of(workspace.teamRoleId()));
        acceptAssignmentForAllocationId(otherDm.token(), proposalB);

        JsonNode viewA = departmentProjectsJson(workspace.dm().token(), null);
        assertThat(viewA.get("projects")).hasSize(1);
        assertThat(memberOf(viewA.get("projects").get(0).get("teamMembers"),
            workspace.employee().userId())).isNotNull();
        assertThat(memberOf(viewA.get("projects").get(0).get("teamMembers"),
            otherEmployee.userId())).isNull();

        JsonNode viewB = departmentProjectsJson(otherDm.token(), null);
        assertThat(memberOf(viewB.get("projects").get(0).get("teamMembers"),
            otherEmployee.userId())).isNotNull();
        assertThat(memberOf(viewB.get("projects").get(0).get("teamMembers"),
            workspace.employee().userId())).isNull();
    }

    @Test
    void reviewDepartmentSnapshotSurvivesMembershipMove() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Moved"));
        UUID employeeId = workspace.employee().userId();
        allocate(workspace, projectId, employeeId, 4);

        // Move the employee to a different department after the allocation.
        Member otherDm = newDepartmentManager(workspace.org(), "dm2");
        UUID otherDept = createDepartment(workspace.org().adminToken(), uniqueName("Design"));
        assignManager(workspace.org().adminToken(), otherDept, otherDm.userId());
        removeMember(workspace.dm().token(), workspace.departmentId(), employeeId);
        addMember(otherDm.token(), otherDept, employeeId);

        // Visibility stays with the review-department snapshot.
        JsonNode original = departmentProjectsJson(workspace.dm().token(), null);
        assertThat(original.get("projects")).hasSize(1);
        JsonNode moved = departmentProjectsJson(otherDm.token(), null);
        assertThat(moved.get("projects")).isEmpty();
    }

    @Test
    void statusFilterAndOrderingAndNoDetailLeak() throws Exception {
        Workspace workspace = newWorkspace();
        Member second = newEmployee(workspace.org(), "emp2");
        addMember(workspace.dm().token(), workspace.departmentId(), second.userId());

        // Earlier deadline first; the ONGOING project (null deadline) last.
        Map<String, Object> late = projectPayload(uniqueName("LateDeadline"));
        late.put("status", "STARTING");
        late.put("deadlineDate", "2027-06-30");
        UUID lateProject = createProjectId(workspace.pm().token(), late);
        Map<String, Object> ongoing = projectPayload(uniqueName("Ongoing"));
        ongoing.put("status", "STARTING");
        ongoing.put("period", "ONGOING");
        ongoing.remove("deadlineDate");
        UUID ongoingProject = createProjectId(workspace.pm().token(), ongoing);
        // Projects can only be created in planning statuses; advance afterwards.
        patchProjectExpectOk(workspace.pm().token(), ongoingProject,
            Map.of("status", "IN_PROGRESS"));
        UUID earlyProject = createConsumingProject(workspace.pm().token(), uniqueName("Early"));

        allocate(workspace, lateProject, workspace.employee().userId(), 2);
        allocate(workspace, ongoingProject, second.userId(), 2);
        allocate(workspace, earlyProject, workspace.employee().userId(), 2);

        String body = getDepartmentProjects(workspace.dm().token(), null)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JsonNode all = objectMapper.readTree(body);
        assertThat(all.get("projects")).extracting(
                project -> project.get("projectId").asText())
            .containsExactly(earlyProject.toString(), lateProject.toString(),
                ongoingProject.toString());

        // Portfolio rows never carry Project-09 detail payloads.
        assertThat(body).doesNotContain("generalDescription", "teamRoleRequirements");

        JsonNode filtered = departmentProjectsJson(workspace.dm().token(), "IN_PROGRESS");
        assertThat(filtered.get("projects")).hasSize(1);
        assertThat(filtered.get("projects").get(0).get("projectId").asText())
            .isEqualTo(ongoingProject.toString());
        assertThat(departmentProjectsJson(workspace.dm().token(), "CLOSED").get("projects"))
            .isEmpty();
        getDepartmentProjects(workspace.dm().token(), "BANANA")
            .andExpect(status().isBadRequest());
    }

    @Test
    void securityMatrix() throws Exception {
        Workspace workspace = newWorkspace();
        Org orgB = newOrg();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Sec"));
        allocate(workspace, projectId, workspace.employee().userId(), 4);

        mockMvc.perform(get("/department/projects")).andExpect(status().isUnauthorized());
        getDepartmentProjects(workspace.employee().token(), null)
            .andExpect(status().isForbidden());
        getDepartmentProjects(workspace.pm().token(), null).andExpect(status().isForbidden());
        getDepartmentProjects(workspace.org().adminToken(), null)
            .andExpect(status().isForbidden());
        Member unassignedDm = newDepartmentManager(workspace.org(), "nodept");
        getDepartmentProjects(unassignedDm.token(), null).andExpect(status().isForbidden());

        // A cross-org DM sees only their own empty portfolio, never org A data.
        Member foreignDm = newDepartmentManager(orgB, "fdm");
        UUID foreignDept = createDepartment(orgB.adminToken(), uniqueName("Foreign"));
        assignManager(orgB.adminToken(), foreignDept, foreignDm.userId());
        JsonNode foreignView = departmentProjectsJson(foreignDm.token(), null);
        assertThat(foreignView.get("department").get("departmentId").asText())
            .isEqualTo(foreignDept.toString());
        assertThat(foreignView.get("projects")).isEmpty();
    }
}
