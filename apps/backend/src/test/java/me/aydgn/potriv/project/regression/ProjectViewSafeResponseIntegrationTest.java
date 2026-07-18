package me.aydgn.potriv.project.regression;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.allocation.repository.ProjectAllocationRepository;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRepository;
import me.aydgn.potriv.allocation.repository.ProjectDeallocationProposalRepository;
import me.aydgn.potriv.project.repository.ProjectStatusHistoryRepository;

/**
 * Safe response shape and read-only behavior across all four project view
 * endpoints.
 */
class ProjectViewSafeResponseIntegrationTest
    extends AbstractProjectDomainRegressionIntegrationTest {

    @Autowired
    private ProjectAssignmentProposalRepository assignmentProposalRepository;

    @Autowired
    private ProjectAllocationRepository allocationRepository;

    @Autowired
    private ProjectDeallocationProposalRepository deallocationProposalRepository;

    @Autowired
    private ProjectStatusHistoryRepository statusHistoryRepository;

    /** One project with an active and a past allocation, ready for all views. */
    private record ViewFixture(Workspace workspace, UUID projectId) {
    }

    private ViewFixture newViewFixture() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Views"));
        allocate(workspace, projectId, workspace.employee().userId(), 4);
        Member past = newEmployee(workspace.org(), "past");
        addMember(workspace.dm().token(), workspace.departmentId(), past.userId());
        UUID pastAllocation = allocate(workspace, projectId, past.userId(), 2);
        deallocate(workspace, projectId, pastAllocation);
        return new ViewFixture(workspace, projectId);
    }

    @Test
    void viewPayloadsExposeOnlySafeFields() throws Exception {
        ViewFixture fixture = newViewFixture();
        Workspace workspace = fixture.workspace();

        String teamBody = getTeamView(workspace.pm().token(), fixture.projectId())
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String historyBody = getMyProjects(workspace.employee().token())
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String portfolioBody = getDepartmentProjects(workspace.dm().token(), null)
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String detailsBody = getProjectDetails(workspace.pm().token(), fixture.projectId())
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        for (String body : List.of(teamBody, historyBody, portfolioBody, detailsBody)) {
            assertThat(body).doesNotContain(
                "password", "refreshToken", "session", "lockout", "failedLogin",
                "normalizedName", "normalizedEmail", "authorities", "credentials",
                "hibernateLazyInitializer");
        }

        // User summaries carry exactly the safe fields.
        JsonNode teamEmployee = objectMapper.readTree(teamBody)
            .get("activeMembers").get(0).get("employee");
        JsonNode detailsManager = objectMapper.readTree(detailsBody).get("projectManager");
        for (JsonNode summary : List.of(teamEmployee, detailsManager)) {
            List<String> fields = new ArrayList<>();
            summary.fieldNames().forEachRemaining(fields::add);
            assertThat(fields).containsExactlyInAnyOrder("userId", "name", "email");
        }
    }

    @Test
    void viewsAreReadOnlyAndStable() throws Exception {
        ViewFixture fixture = newViewFixture();
        Workspace workspace = fixture.workspace();

        long proposals = assignmentProposalRepository.count();
        long allocations = allocationRepository.count();
        long deallocations = deallocationProposalRepository.count();
        long historyRows = statusHistoryRepository.count();

        JsonNode teamFirst = teamViewJson(workspace.pm().token(), fixture.projectId());
        JsonNode teamSecond = teamViewJson(workspace.pm().token(), fixture.projectId());
        JsonNode historyFirst = myProjectsJson(workspace.employee().token());
        JsonNode historySecond = myProjectsJson(workspace.employee().token());
        JsonNode portfolioFirst = departmentProjectsJson(workspace.dm().token(), null);
        JsonNode portfolioSecond = departmentProjectsJson(workspace.dm().token(), null);
        JsonNode detailsFirst = projectDetailsJson(workspace.pm().token(), fixture.projectId());
        JsonNode detailsSecond = projectDetailsJson(workspace.pm().token(), fixture.projectId());

        // No workflow rows created or mutated by any of the calls.
        assertThat(assignmentProposalRepository.count()).isEqualTo(proposals);
        assertThat(allocationRepository.count()).isEqualTo(allocations);
        assertThat(deallocationProposalRepository.count()).isEqualTo(deallocations);
        assertThat(statusHistoryRepository.count()).isEqualTo(historyRows);

        // Repeated calls are equivalent apart from the dynamic generatedAt.
        assertThat(teamSecond.get("activeMembers"))
            .isEqualTo(teamFirst.get("activeMembers"));
        assertThat(teamSecond.get("pastMembers")).isEqualTo(teamFirst.get("pastMembers"));
        assertThat(historySecond.get("currentProjects"))
            .isEqualTo(historyFirst.get("currentProjects"));
        assertThat(historySecond.get("pastProjects"))
            .isEqualTo(historyFirst.get("pastProjects"));
        assertThat(portfolioSecond.get("projects")).isEqualTo(portfolioFirst.get("projects"));
        assertThat(detailsSecond.get("activeMembers"))
            .isEqualTo(detailsFirst.get("activeMembers"));
        assertThat(detailsSecond.get("pastMembers"))
            .isEqualTo(detailsFirst.get("pastMembers"));
    }
}
