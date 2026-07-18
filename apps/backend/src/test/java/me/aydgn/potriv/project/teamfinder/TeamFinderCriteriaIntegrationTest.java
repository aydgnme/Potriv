package me.aydgn.potriv.project.teamfinder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Team Finder criteria defaults, normalization, and validation.
 */
class TeamFinderCriteriaIntegrationTest extends AbstractTeamFinderIntegrationTest {

    @Test
    void defaultRequestReturnsFullyAvailableOnlyAndEchoesCriteria() throws Exception {
        Workspace workspace = newWorkspace();
        UUID categoryId = createSkillCategoryId(workspace.dm().token(), uniqueName("Lang"));
        UUID javaSkill = createSkillId(workspace.dm().token(), categoryId, "Java");

        // Alice: fully available; Dan: 4h active on a consuming project.
        Member alice = newEmployee(workspace.org(), "alice");
        addMember(workspace.dm().token(), workspace.departmentId(), alice.userId());
        selfAssignSkill(alice.token(), javaSkill);
        Member dan = newEmployee(workspace.org(), "dan");
        addMember(workspace.dm().token(), workspace.departmentId(), dan.userId());
        selfAssignSkill(dan.token(), javaSkill);
        UUID busyProject = createConsumingProject(workspace.pm().token(), uniqueName("Busy"));
        allocate(workspace, busyProject, dan.userId(), 4);

        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java"), List.of(workspace.teamRoleId()));
        JsonNode response = teamFinderJson(workspace.pm().token(), target, Map.of());

        assertThat(response.get("projectId").asText()).isEqualTo(target.toString());
        assertThat(response.get("generatedAt").isNull()).isFalse();
        JsonNode criteria = response.get("criteria");
        assertThat(criteria.get("includePartiallyAvailable").asBoolean()).isFalse();
        assertThat(criteria.get("includeCloseToFinish").asBoolean()).isFalse();
        assertThat(criteria.get("closeToFinishWeeks").isNull()).isTrue();
        assertThat(criteria.get("includeUnavailable").asBoolean()).isFalse();
        assertThat(criteria.get("limit").asInt()).isEqualTo(50);

        // Only the fully available candidate is in the default pool.
        assertThat(response.get("candidateCount").asInt()).isEqualTo(1);
        assertThat(candidateOf(response, alice.userId())).isNotNull();
        assertThat(candidateOf(response, dan.userId())).isNull();
    }

    @Test
    void availabilityFlagsExpandTheCandidatePool() throws Exception {
        Workspace workspace = newWorkspace();
        UUID categoryId = createSkillCategoryId(workspace.dm().token(), uniqueName("Lang"));
        UUID javaSkill = createSkillId(workspace.dm().token(), categoryId, "Java");

        Member dan = newEmployee(workspace.org(), "dan");
        addMember(workspace.dm().token(), workspace.departmentId(), dan.userId());
        selfAssignSkill(dan.token(), javaSkill);
        Member eve = newEmployee(workspace.org(), "eve");
        addMember(workspace.dm().token(), workspace.departmentId(), eve.userId());
        selfAssignSkill(eve.token(), javaSkill);

        UUID partialLoad = createConsumingProject(workspace.pm().token(), uniqueName("Partial"));
        allocate(workspace, partialLoad, dan.userId(), 4);
        UUID fullLoad = createConsumingProject(workspace.pm().token(), uniqueName("Full"));
        allocate(workspace, fullLoad, eve.userId(), 8);

        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java"), List.of(workspace.teamRoleId()));

        JsonNode defaults = teamFinderJson(workspace.pm().token(), target, Map.of());
        assertThat(defaults.get("candidateCount").asInt()).isZero();

        JsonNode partial = teamFinderJson(workspace.pm().token(), target,
            Map.of("includePartiallyAvailable", true));
        assertThat(candidateOf(partial, dan.userId())).isNotNull();
        assertThat(candidateOf(partial, eve.userId())).isNull();

        JsonNode all = teamFinderJson(workspace.pm().token(), target,
            Map.of("includePartiallyAvailable", true, "includeUnavailable", true));
        assertThat(candidateOf(all, dan.userId())).isNotNull();
        assertThat(candidateOf(all, eve.userId())).isNotNull();
    }

    @Test
    void closeToFinishWeeksAreValidatedAndDefaulted() throws Exception {
        Workspace workspace = newWorkspace();
        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java"), List.of(workspace.teamRoleId()));

        runTeamFinder(workspace.pm().token(), target,
            Map.of("includeCloseToFinish", true, "closeToFinishWeeks", 1))
            .andExpect(status().isBadRequest());
        runTeamFinder(workspace.pm().token(), target,
            Map.of("includeCloseToFinish", true, "closeToFinishWeeks", 7))
            .andExpect(status().isBadRequest());

        // Supplied weeks are validated even when the flag is off.
        runTeamFinder(workspace.pm().token(), target,
            Map.of("includeCloseToFinish", false, "closeToFinishWeeks", 7))
            .andExpect(status().isBadRequest());

        // The flag alone defaults the window to 2 weeks; 6 is the upper bound.
        JsonNode defaulted = teamFinderJson(workspace.pm().token(), target,
            Map.of("includeCloseToFinish", true));
        assertThat(defaulted.get("criteria").get("closeToFinishWeeks").asInt()).isEqualTo(2);
        JsonNode upper = teamFinderJson(workspace.pm().token(), target,
            Map.of("includeCloseToFinish", true, "closeToFinishWeeks", 6));
        assertThat(upper.get("criteria").get("closeToFinishWeeks").asInt()).isEqualTo(6);
    }

    @Test
    void limitIsValidated() throws Exception {
        Workspace workspace = newWorkspace();
        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java"), List.of(workspace.teamRoleId()));

        runTeamFinder(workspace.pm().token(), target, Map.of("limit", 0))
            .andExpect(status().isBadRequest());
        runTeamFinder(workspace.pm().token(), target, Map.of("limit", -1))
            .andExpect(status().isBadRequest());
        runTeamFinder(workspace.pm().token(), target, Map.of("limit", 101))
            .andExpect(status().isBadRequest());

        JsonNode maxLimit = teamFinderJson(workspace.pm().token(), target, Map.of("limit", 100));
        assertThat(maxLimit.get("criteria").get("limit").asInt()).isEqualTo(100);
    }

    @Test
    void limitTruncatesAfterDeterministicSorting() throws Exception {
        Workspace workspace = newWorkspace();
        UUID categoryId = createSkillCategoryId(workspace.dm().token(), uniqueName("Lang"));
        UUID javaSkill = createSkillId(workspace.dm().token(), categoryId, "Java");
        UUID postgresSkill =
            createSkillId(workspace.dm().token(), categoryId, "PostgreSQL");

        // Alice matches both technologies (score 80), Bob only one (score 50).
        Member alice = newEmployee(workspace.org(), "alice");
        addMember(workspace.dm().token(), workspace.departmentId(), alice.userId());
        selfAssignSkill(alice.token(), javaSkill);
        selfAssignSkill(alice.token(), postgresSkill);
        Member bob = newEmployee(workspace.org(), "bob");
        addMember(workspace.dm().token(), workspace.departmentId(), bob.userId());
        selfAssignSkill(bob.token(), javaSkill);

        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java", "PostgreSQL"), List.of(workspace.teamRoleId()));

        JsonNode top = teamFinderJson(workspace.pm().token(), target, Map.of("limit", 1));
        assertThat(top.get("candidateCount").asInt()).isEqualTo(1);
        assertThat(candidateOf(top, alice.userId())).isNotNull();

        JsonNode both = teamFinderJson(workspace.pm().token(), target, Map.of("limit", 2));
        assertThat(candidateUserIds(both))
            .containsExactly(alice.userId().toString(), bob.userId().toString());
    }

    @Test
    void targetWithoutTechnologiesReturnsEmptyCandidates() throws Exception {
        Workspace workspace = newWorkspace();
        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Empty"),
            List.of(), List.of(workspace.teamRoleId()));

        JsonNode response = teamFinderJson(workspace.pm().token(), target, Map.of());
        assertThat(response.get("candidateCount").asInt()).isZero();
        assertThat(response.get("candidates")).isEmpty();
    }
}
