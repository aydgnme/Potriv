package me.aydgn.potriv.project.allocation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.allocation.entity.ProjectAllocation;
import me.aydgn.potriv.allocation.entity.ProjectAssignmentProposal;
import me.aydgn.potriv.allocation.entity.ProjectAssignmentProposalRole;
import me.aydgn.potriv.allocation.repository.ProjectAllocationRepository;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRepository;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRoleRepository;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.organization.entity.TeamRole;
import me.aydgn.potriv.organization.repository.TeamRoleRepository;
import me.aydgn.potriv.project.entity.Project;
import me.aydgn.potriv.project.repository.ProjectRepository;

/**
 * Allocation workflow RBAC boundaries, platform/no-org semantics, safe
 * response shape, and database-level allocation invariants.
 */
class ProjectAllocationSecurityIntegrationTest extends AbstractProjectAllocationIntegrationTest {

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TeamRoleRepository teamRoleRepository;

    @Autowired
    private ProjectAssignmentProposalRepository proposalRepository;

    @Autowired
    private ProjectAssignmentProposalRoleRepository proposalRoleRepository;

    @Autowired
    private ProjectAllocationRepository allocationRepository;

    @Test
    void reviewEndpointsRequireDepartmentManagerRole() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Rbac"));
        UUID proposalId = proposeAssignmentId(workspace.pm().token(), projectId,
            workspace.employee().userId(), 2, List.of(workspace.teamRoleId()));

        mockMvc.perform(get("/department/project-proposals"))
            .andExpect(status().isUnauthorized());

        for (String token : new String[] {
            workspace.employee().token(), workspace.pm().token(),
            workspace.org().adminToken()}) {
            mockMvc.perform(get("/department/project-proposals")
                    .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isForbidden());
            acceptAssignment(token, proposalId).andExpect(status().isForbidden());
            rejectAssignment(token, proposalId).andExpect(status().isForbidden());
            acceptDeallocation(token, proposalId).andExpect(status().isForbidden());
        }
    }

    @Test
    void platformSystemAdminWithoutOrganizationGetsControlledError() throws Exception {
        String systemAdminToken = systemAdminAccessToken();

        // The platform admin passes the role annotations but has no organization
        // context, so the resolver answers with a controlled 400.
        mockMvc.perform(get("/department/project-proposals")
                .header(HttpHeaders.AUTHORIZATION, bearer(systemAdminToken)))
            .andExpect(status().isBadRequest());
        proposeAssignment(systemAdminToken, UUID.randomUUID(), UUID.randomUUID(), 1,
                List.of(UUID.randomUUID()))
            .andExpect(status().isBadRequest());
    }

    @Test
    void workflowResponsesExposeOnlySafeFields() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Safe"));
        UUID proposalId = proposeAssignmentId(workspace.pm().token(), projectId,
            workspace.employee().userId(), 4, List.of(workspace.teamRoleId()));

        String acceptBody = acceptAssignment(workspace.dm().token(), proposalId)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        String queueBody = proposalQueue(workspace.dm().token(), "APPROVED")
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        for (String body : List.of(acceptBody, queueBody)) {
            assertThat(body).doesNotContain(
                "passwordHash", "failedLoginAttempts", "lockedUntil", "refreshToken",
                "normalizedName", "hibernateLazyInitializer", "handler");
        }

        // Safe summaries carry exactly the intended fields.
        JsonNode employee = objectMapper.readTree(acceptBody)
            .get("proposal").get("employee");
        List<String> fields = new ArrayList<>();
        employee.fieldNames().forEachRemaining(fields::add);
        assertThat(fields).containsExactlyInAnyOrder("userId", "name", "email");
    }

    @Test
    void databaseEnforcesAllocationWorkflowInvariants() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Invariant"));
        UUID proposalId = proposeAssignmentId(workspace.pm().token(), projectId,
            workspace.employee().userId(), 3, List.of(workspace.teamRoleId()));
        acceptAssignment(workspace.dm().token(), proposalId).andExpect(status().isOk());

        Project project = projectRepository.findById(projectId).orElseThrow();
        User employee = userRepository.findById(workspace.employee().userId()).orElseThrow();
        ProjectAssignmentProposal proposal =
            proposalRepository.findById(proposalId).orElseThrow();
        TeamRole teamRole = teamRoleRepository.findById(workspace.teamRoleId()).orElseThrow();

        // One allocation per assignment proposal is a DB-level invariant.
        assertThatThrownBy(() -> allocationRepository.saveAndFlush(new ProjectAllocation(
                project, employee, proposal, 3, OffsetDateTime.now())))
            .isInstanceOf(DataIntegrityViolationException.class);

        // One row per (proposal, teamRole) is a DB-level invariant.
        assertThatThrownBy(() -> proposalRoleRepository.saveAndFlush(
                new ProjectAssignmentProposalRole(proposal, teamRole)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }
}
