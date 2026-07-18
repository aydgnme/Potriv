package me.aydgn.potriv.project.teamfinder;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * The 60/20/20 score composition, rounding, and the deterministic candidate
 * ordering with its tie-breakers.
 */
class TeamFinderScoringOrderingIntegrationTest extends AbstractTeamFinderIntegrationTest {

    @Test
    void scoreCompositionExamples() throws Exception {
        Workspace workspace = newWorkspace();
        UUID categoryId = createSkillCategoryId(workspace.dm().token(), uniqueName("Lang"));
        UUID javaSkill = createSkillId(workspace.dm().token(), categoryId, "Java");
        UUID postgresSkill =
            createSkillId(workspace.dm().token(), categoryId, "PostgreSQL");

        // Alice: full skill match, fully available -> 60 + 0 + 20 = 80.
        Member alice = newEmployee(workspace.org(), "alice");
        addMember(workspace.dm().token(), workspace.departmentId(), alice.userId());
        selfAssignSkill(alice.token(), javaSkill);
        selfAssignSkill(alice.token(), postgresSkill);

        // Bob: half skill match, fully available -> 30 + 0 + 20 = 50.
        Member bob = newEmployee(workspace.org(), "bob");
        addMember(workspace.dm().token(), workspace.departmentId(), bob.userId());
        selfAssignSkill(bob.token(), javaSkill);

        // Carla: no skills, valid past similarity, fully available
        // -> 0 + 20 + 20 = 40.
        Member carla = newEmployee(workspace.org(), "carla");
        addMember(workspace.dm().token(), workspace.departmentId(), carla.userId());
        UUID past = createTargetProject(workspace.pm().token(), uniqueName("Past"),
            List.of("Java"), List.of(workspace.teamRoleId()));
        UUID pastEpisode = allocate(workspace, past, carla.userId(), 4);
        deallocate(workspace, past, pastEpisode);

        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java", "PostgreSQL"), List.of(workspace.teamRoleId()));
        JsonNode response = teamFinderJson(workspace.pm().token(), target, Map.of());

        JsonNode aliceScore = candidateOf(response, alice.userId()).get("score");
        assertThat(aliceScore.get("skillScore").asInt()).isEqualTo(60);
        assertThat(aliceScore.get("pastProjectScore").asInt()).isZero();
        assertThat(aliceScore.get("availabilityScore").asInt()).isEqualTo(20);
        assertThat(aliceScore.get("totalScore").asInt()).isEqualTo(80);

        JsonNode bobScore = candidateOf(response, bob.userId()).get("score");
        assertThat(bobScore.get("skillScore").asInt()).isEqualTo(30);
        assertThat(bobScore.get("totalScore").asInt()).isEqualTo(50);

        JsonNode carlaScore = candidateOf(response, carla.userId()).get("score");
        assertThat(carlaScore.get("skillScore").asInt()).isZero();
        assertThat(carlaScore.get("pastProjectScore").asInt()).isEqualTo(20);
        assertThat(carlaScore.get("totalScore").asInt()).isEqualTo(40);

        // Ranked strictly by total score here.
        assertThat(candidateUserIds(response)).containsExactly(
            alice.userId().toString(), bob.userId().toString(), carla.userId().toString());
    }

    @Test
    void skillScoreRoundsAgainstTechnologyCount() throws Exception {
        Workspace workspace = newWorkspace();
        UUID categoryId = createSkillCategoryId(workspace.dm().token(), uniqueName("Lang"));
        UUID javaSkill = createSkillId(workspace.dm().token(), categoryId, "Java");
        UUID postgresSkill =
            createSkillId(workspace.dm().token(), categoryId, "PostgreSQL");

        // One of three technologies -> round(60/3) = 20; two of three -> 40.
        Member oneOfThree = newEmployee(workspace.org(), "onethree");
        addMember(workspace.dm().token(), workspace.departmentId(), oneOfThree.userId());
        selfAssignSkill(oneOfThree.token(), javaSkill);
        Member twoOfThree = newEmployee(workspace.org(), "twothree");
        addMember(workspace.dm().token(), workspace.departmentId(), twoOfThree.userId());
        selfAssignSkill(twoOfThree.token(), javaSkill);
        selfAssignSkill(twoOfThree.token(), postgresSkill);

        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java", "PostgreSQL", "React"), List.of(workspace.teamRoleId()));
        JsonNode response = teamFinderJson(workspace.pm().token(), target, Map.of());

        assertThat(candidateOf(response, oneOfThree.userId())
            .get("score").get("skillScore").asInt()).isEqualTo(20);
        assertThat(candidateOf(response, twoOfThree.userId())
            .get("score").get("skillScore").asInt()).isEqualTo(40);
    }

    @Test
    void equalTotalsAreOrderedBySkillScoreFirst() throws Exception {
        Workspace workspace = newWorkspace();
        UUID categoryId = createSkillCategoryId(workspace.dm().token(), uniqueName("Lang"));
        UUID javaSkill = createSkillId(workspace.dm().token(), categoryId, "Java");
        UUID postgresSkill =
            createSkillId(workspace.dm().token(), categoryId, "PostgreSQL");

        // fullSkill: 60 skill + 0 past + 10 availability (4h allocated) = 70.
        Member fullSkill = newEmployee(workspace.org(), "fullskill");
        addMember(workspace.dm().token(), workspace.departmentId(), fullSkill.userId());
        selfAssignSkill(fullSkill.token(), javaSkill);
        selfAssignSkill(fullSkill.token(), postgresSkill);
        UUID load = createConsumingProject(workspace.pm().token(), uniqueName("Load"));
        allocate(workspace, load, fullSkill.userId(), 4);

        // halfSkillPast: 30 skill + 20 past + 20 availability = 70 as well.
        Member halfSkillPast = newEmployee(workspace.org(), "halfpast");
        addMember(workspace.dm().token(), workspace.departmentId(), halfSkillPast.userId());
        selfAssignSkill(halfSkillPast.token(), javaSkill);
        UUID past = createTargetProject(workspace.pm().token(), uniqueName("Past"),
            List.of("Java"), List.of(workspace.teamRoleId()));
        UUID pastEpisode = allocate(workspace, past, halfSkillPast.userId(), 4);
        deallocate(workspace, past, pastEpisode);

        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java", "PostgreSQL"), List.of(workspace.teamRoleId()));
        JsonNode response = teamFinderJson(workspace.pm().token(), target,
            Map.of("includePartiallyAvailable", true));

        // Same 70 total; the higher skill score wins the tie.
        assertThat(candidateOf(response, fullSkill.userId())
            .get("score").get("totalScore").asInt()).isEqualTo(70);
        assertThat(candidateOf(response, halfSkillPast.userId())
            .get("score").get("totalScore").asInt()).isEqualTo(70);
        assertThat(candidateUserIds(response)).containsExactly(
            fullSkill.userId().toString(), halfSkillPast.userId().toString());
    }

    @Test
    void repeatedCallsAreDeterministic() throws Exception {
        Workspace workspace = newWorkspace();
        UUID categoryId = createSkillCategoryId(workspace.dm().token(), uniqueName("Lang"));
        UUID javaSkill = createSkillId(workspace.dm().token(), categoryId, "Java");

        for (String prefix : List.of("emp1", "emp2", "emp3", "emp4")) {
            Member member = newEmployee(workspace.org(), prefix);
            addMember(workspace.dm().token(), workspace.departmentId(), member.userId());
            selfAssignSkill(member.token(), javaSkill);
        }

        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java"), List.of(workspace.teamRoleId()));

        JsonNode first = teamFinderJson(workspace.pm().token(), target, Map.of());
        JsonNode second = teamFinderJson(workspace.pm().token(), target, Map.of());

        assertThat(first.get("candidateCount").asInt()).isEqualTo(4);
        assertThat(candidateUserIds(second)).isEqualTo(candidateUserIds(first));
        assertThat(second.get("candidates").toString())
            .isEqualTo(first.get("candidates").toString());
    }
}
