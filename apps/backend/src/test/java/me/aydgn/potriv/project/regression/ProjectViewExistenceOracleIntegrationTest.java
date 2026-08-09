package me.aydgn.potriv.project.regression;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * A project you cannot see must look exactly like a project that is not there.
 *
 * {@code GET /projects/{id}/details} and {@code /team} are relationship-protected
 * object reads. If a refusal for an existing project differs in any observable
 * way from the answer for an id that was never issued, a caller can ask about any
 * id and learn whether it exists — which is an object-existence oracle even when
 * no field of the object is ever returned.
 *
 * The case that opened one: a caller holding {@code DEPARTMENT_MANAGER} while
 * managing no department used to receive 403 for a real project and 404 for a
 * random UUID. These tests compare the two answers directly — status **and**
 * public message — rather than asserting each in isolation, because the defect
 * was never in either answer alone.
 */
class ProjectViewExistenceOracleIntegrationTest
    extends AbstractProjectDomainRegressionIntegrationTest {

    private record Answer(int status, String message) {
    }

    private Answer answerFor(ResultActions actions) throws Exception {
        String body = actions.andReturn().getResponse().getContentAsString();
        int status = actions.andReturn().getResponse().getStatus();
        JsonNode json = body.isEmpty() ? null : objectMapper.readTree(body);
        return new Answer(status, json == null || json.get("message") == null
            ? null
            : json.get("message").asText());
    }

    @Test
    void detailsCannotBeUsedToDiscoverThatAProjectExists() throws Exception {
        Workspace workspace = newWorkspace();
        UUID realProject = createConsumingProject(workspace.pm().token(), uniqueName("Oracle"));
        Member unassignedDm = newDepartmentManager(workspace.org(), "nodept");

        Answer existing = answerFor(getProjectDetails(unassignedDm.token(), realProject));
        Answer missing = answerFor(getProjectDetails(unassignedDm.token(), UUID.randomUUID()));

        assertThat(existing.status()).isEqualTo(404);
        assertThat(missing.status()).isEqualTo(404);
        assertThat(existing.message()).isEqualTo("Project was not found.");
        // The whole point: indistinguishable, not merely both refused.
        assertThat(existing).isEqualTo(missing);
    }

    @Test
    void teamCannotBeUsedToDiscoverThatAProjectExists() throws Exception {
        Workspace workspace = newWorkspace();
        UUID realProject = createConsumingProject(workspace.pm().token(), uniqueName("Oracle"));
        Member unassignedDm = newDepartmentManager(workspace.org(), "nodept");

        Answer existing = answerFor(getTeamView(unassignedDm.token(), realProject));
        Answer missing = answerFor(getTeamView(unassignedDm.token(), UUID.randomUUID()));

        assertThat(existing.status()).isEqualTo(404);
        assertThat(existing.message()).isEqualTo("Project was not found.");
        assertThat(existing).isEqualTo(missing);
    }

    @Test
    void holdingTheDepartmentManagerRoleChangesNothingForAnUnrelatedCaller() throws Exception {
        // The regression that closes the oracle: an ordinary employee and a
        // department-manager role holder with no assignment are told the same
        // thing about the same project.
        Workspace workspace = newWorkspace();
        UUID realProject = createConsumingProject(workspace.pm().token(), uniqueName("Oracle"));

        Member employee = newEmployee(workspace.org(), "plain");
        Member unassignedDm = newDepartmentManager(workspace.org(), "nodept");

        assertThat(answerFor(getProjectDetails(unassignedDm.token(), realProject)))
            .isEqualTo(answerFor(getProjectDetails(employee.token(), realProject)));
        assertThat(answerFor(getTeamView(unassignedDm.token(), realProject)))
            .isEqualTo(answerFor(getTeamView(employee.token(), realProject)));
    }

    @Test
    void managingTheWrongDepartmentIsAlsoIndistinguishable() throws Exception {
        // A real manager of a department this project never involved learns no
        // more than someone with no department at all.
        Workspace workspace = newWorkspace();
        UUID realProject = createConsumingProject(workspace.pm().token(), uniqueName("Oracle"));

        Member otherDm = newDepartmentManager(workspace.org(), "otherdm");
        UUID otherDepartment = createDepartment(workspace.org().adminToken(), uniqueName("Other"));
        assignManager(workspace.org().adminToken(), otherDepartment, otherDm.userId());

        Answer existing = answerFor(getProjectDetails(otherDm.token(), realProject));

        assertThat(existing.status()).isEqualTo(404);
        assertThat(existing)
            .isEqualTo(answerFor(getProjectDetails(otherDm.token(), UUID.randomUUID())));
        assertThat(answerFor(getTeamView(otherDm.token(), realProject)).status()).isEqualTo(404);
    }

    @Test
    void aForeignTenantLearnsNothingAboutTheIdItWasGiven() throws Exception {
        Workspace workspace = newWorkspace();
        Org orgB = newOrg();
        UUID realProject = createConsumingProject(workspace.pm().token(), uniqueName("Oracle"));

        // Both an ordinary member and a manager of the other organization.
        Member foreignEmployee = newEmployee(orgB, "foreign");
        Member foreignDm = newDepartmentManager(orgB, "foreigndm");

        for (Member caller : List.of(foreignEmployee, foreignDm)) {
            assertThat(answerFor(getProjectDetails(caller.token(), realProject)))
                .isEqualTo(answerFor(getProjectDetails(caller.token(), UUID.randomUUID())));
            assertThat(answerFor(getTeamView(caller.token(), realProject)))
                .isEqualTo(answerFor(getTeamView(caller.token(), UUID.randomUUID())));
        }
    }

    @Test
    void everyLegitimateRelationshipStillSeesTheProject() throws Exception {
        // Closing the oracle must not have closed the door on real viewers.
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Oracle"));
        List<UUID> roles = List.of(workspace.teamRoleId());

        allocate(workspace, projectId, workspace.employee().userId(), 2);

        Member pastEmployee = newEmployee(workspace.org(), "past");
        addMember(workspace.dm().token(), workspace.departmentId(), pastEmployee.userId());
        UUID pastAllocation = allocate(workspace, projectId, pastEmployee.userId(), 2);
        deallocate(workspace, projectId, pastAllocation);

        Member proposedOnly = newEmployee(workspace.org(), "proposed");
        addMember(workspace.dm().token(), workspace.departmentId(), proposedOnly.userId());
        proposeAssignmentId(workspace.pm().token(), projectId, proposedOnly.userId(), 2, roles);

        for (String token : List.of(
            workspace.pm().token(),
            workspace.employee().token(),
            pastEmployee.token(),
            workspace.dm().token())) {
            getProjectDetails(token, projectId).andExpect(status().isOk());
            getTeamView(token, projectId).andExpect(status().isOk());
        }

        // A pending proposal is not a relationship: nobody is on the project yet.
        getProjectDetails(proposedOnly.token(), projectId).andExpect(status().isNotFound());
        getTeamView(proposedOnly.token(), projectId).andExpect(status().isNotFound());
    }
}
