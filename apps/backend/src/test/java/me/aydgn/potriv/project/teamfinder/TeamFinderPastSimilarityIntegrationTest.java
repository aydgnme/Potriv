package me.aydgn.potriv.project.teamfinder;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Past project similarity: a deallocated allocation on another same-org
 * project with both technology and team-role overlap.
 */
class TeamFinderPastSimilarityIntegrationTest extends AbstractTeamFinderIntegrationTest {

    /** Allocates the employee to the given project and immediately deallocates. */
    private void completePastEpisode(Workspace workspace, UUID projectId, UUID employeeId)
        throws Exception {
        UUID allocationId = allocate(workspace, projectId, employeeId, 4);
        deallocate(workspace, projectId, allocationId);
    }

    @Test
    void validPastSimilarityQualifiesWithoutSkillMatchAndIsCappedAtTwenty() throws Exception {
        Workspace workspace = newWorkspace();
        Member carla = newEmployee(workspace.org(), "carla");
        addMember(workspace.dm().token(), workspace.departmentId(), carla.userId());

        // Two past Java projects where Carla worked with the same team role that
        // the target requires. No EmployeeSkill rows at all.
        UUID pastOne = createTargetProject(workspace.pm().token(), uniqueName("PastOne"),
            List.of("Java"), List.of(workspace.teamRoleId()));
        completePastEpisode(workspace, pastOne, carla.userId());
        UUID pastTwo = createTargetProject(workspace.pm().token(), uniqueName("PastTwo"),
            List.of("Java"), List.of(workspace.teamRoleId()));
        completePastEpisode(workspace, pastTwo, carla.userId());

        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java"), List.of(workspace.teamRoleId()));
        JsonNode response = teamFinderJson(workspace.pm().token(), target, Map.of());

        JsonNode candidate = candidateOf(response, carla.userId());
        assertThat(candidate).isNotNull();
        assertThat(candidate.get("skillMatches")).isEmpty();
        assertThat(candidate.get("pastProjectMatches")).hasSize(2);

        JsonNode match = candidate.get("pastProjectMatches").get(0);
        assertThat(match.get("projectId").isNull()).isFalse();
        assertThat(match.get("projectName").isNull()).isFalse();
        assertThat(match.get("matchedTechnologies")).extracting(JsonNode::asText)
            .containsExactly("Java");
        assertThat(match.get("matchedTeamRoles")).hasSize(1);
        assertThat(match.get("deallocatedAt").isNull()).isFalse();

        // Multiple past matches never exceed the 20-point cap: 0 + 20 + 20.
        assertThat(candidate.get("score").get("pastProjectScore").asInt()).isEqualTo(20);
        assertThat(candidate.get("score").get("skillScore").asInt()).isZero();
        assertThat(candidate.get("score").get("totalScore").asInt()).isEqualTo(40);
    }

    @Test
    void overlapOnOnlyOneDimensionIsNotSimilarity() throws Exception {
        Workspace workspace = newWorkspace();
        UUID otherRole = createTeamRoleId(workspace.org().adminToken(), uniqueName("Frontend"));

        // Tech overlap but the past role differs from the target requirement.
        Member techOnly = newEmployee(workspace.org(), "techonly");
        addMember(workspace.dm().token(), workspace.departmentId(), techOnly.userId());
        UUID pastWrongRole = createTargetProject(workspace.pm().token(), uniqueName("WrongRole"),
            List.of("Java"), List.of(otherRole));
        UUID allocationA = proposeAndAcceptWithRole(
            workspace, pastWrongRole, techOnly.userId(), otherRole);
        deallocate(workspace, pastWrongRole, allocationA);

        // Role overlap but no shared technology.
        Member roleOnly = newEmployee(workspace.org(), "roleonly");
        addMember(workspace.dm().token(), workspace.departmentId(), roleOnly.userId());
        UUID pastWrongTech = createTargetProject(workspace.pm().token(), uniqueName("WrongTech"),
            List.of("React"), List.of(workspace.teamRoleId()));
        completePastEpisode(workspace, pastWrongTech, roleOnly.userId());

        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java"), List.of(workspace.teamRoleId()));
        JsonNode response = teamFinderJson(workspace.pm().token(), target, Map.of());

        assertThat(candidateOf(response, techOnly.userId())).isNull();
        assertThat(candidateOf(response, roleOnly.userId())).isNull();
    }

    private UUID proposeAndAcceptWithRole(Workspace workspace, UUID projectId, UUID employeeId,
        UUID teamRoleId) throws Exception {
        UUID proposalId = proposeAssignmentId(
            workspace.pm().token(), projectId, employeeId, 4, List.of(teamRoleId));
        return acceptAssignmentForAllocationId(workspace.dm().token(), proposalId);
    }

    @Test
    void activeAllocationsAndTargetEpisodesAreNotPastSimilarity() throws Exception {
        Workspace workspace = newWorkspace();

        // Still active on a similar project: not a past source, and with no
        // skills the candidate is excluded (partial pool enabled to rule out
        // availability as the reason).
        Member active = newEmployee(workspace.org(), "active");
        addMember(workspace.dm().token(), workspace.departmentId(), active.userId());
        UUID similar = createTargetProject(workspace.pm().token(), uniqueName("Similar"),
            List.of("Java"), List.of(workspace.teamRoleId()));
        allocate(workspace, similar, active.userId(), 4);

        // A past episode on the target project itself is ignored as a source.
        Member returning = newEmployee(workspace.org(), "returning");
        addMember(workspace.dm().token(), workspace.departmentId(), returning.userId());

        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java"), List.of(workspace.teamRoleId()));
        UUID targetEpisode = allocate(workspace, target, returning.userId(), 4);
        deallocate(workspace, target, targetEpisode);

        JsonNode response = teamFinderJson(workspace.pm().token(), target,
            Map.of("includePartiallyAvailable", true));
        assertThat(candidateOf(response, active.userId())).isNull();
        assertThat(candidateOf(response, returning.userId())).isNull();
    }

    @Test
    void targetWithoutRoleRequirementsDisablesPastSimilarity() throws Exception {
        Workspace workspace = newWorkspace();
        UUID categoryId = createSkillCategoryId(workspace.dm().token(), uniqueName("Lang"));
        UUID javaSkill = createSkillId(workspace.dm().token(), categoryId, "Java");

        // Carla only has past similarity; Alice has a real skill match.
        Member carla = newEmployee(workspace.org(), "carla");
        addMember(workspace.dm().token(), workspace.departmentId(), carla.userId());
        UUID past = createTargetProject(workspace.pm().token(), uniqueName("Past"),
            List.of("Java"), List.of(workspace.teamRoleId()));
        completePastEpisode(workspace, past, carla.userId());
        Member alice = newEmployee(workspace.org(), "alice");
        addMember(workspace.dm().token(), workspace.departmentId(), alice.userId());
        selfAssignSkill(alice.token(), javaSkill);

        // The target has technologies but no team-role requirements.
        UUID target = createTargetProject(workspace.pm().token(), uniqueName("NoRoles"),
            List.of("Java"), List.of());
        JsonNode response = teamFinderJson(workspace.pm().token(), target, Map.of());

        assertThat(candidateOf(response, carla.userId())).isNull();
        JsonNode aliceRow = candidateOf(response, alice.userId());
        assertThat(aliceRow).isNotNull();
        assertThat(aliceRow.get("pastProjectMatches")).isEmpty();
        assertThat(aliceRow.get("score").get("pastProjectScore").asInt()).isZero();
    }
}
