package me.aydgn.potriv.project.teamfinder;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Exact-normalized skill matching against the target project's technologies.
 */
class TeamFinderSkillMatchIntegrationTest extends AbstractTeamFinderIntegrationTest {

    @Test
    void exactNormalizedMatchIgnoresCaseAndWhitespace() throws Exception {
        Workspace workspace = newWorkspace();
        UUID categoryId = createSkillCategoryId(workspace.dm().token(), uniqueName("Lang"));
        UUID javaSkill = createSkillId(workspace.dm().token(), categoryId, "Java");
        Member alice = newEmployee(workspace.org(), "alice");
        addMember(workspace.dm().token(), workspace.departmentId(), alice.userId());
        selfAssignSkill(alice.token(), javaSkill);

        // The technology is stored with odd casing/whitespace; normalization
        // still produces an exact match with the "Java" skill. No department
        // link is required for the skill.
        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("  jAvA "), List.of(workspace.teamRoleId()));

        JsonNode response = teamFinderJson(workspace.pm().token(), target, Map.of());
        JsonNode candidate = candidateOf(response, alice.userId());
        assertThat(candidate).isNotNull();
        assertThat(candidate.get("skillMatches")).hasSize(1);
        JsonNode match = candidate.get("skillMatches").get(0);
        assertThat(match.get("technologyName").asText()).isEqualTo("jAvA");
        assertThat(match.get("skillId").asText()).isEqualTo(javaSkill.toString());
        assertThat(match.get("skillName").asText()).isEqualTo("Java");
        assertThat(candidate.get("score").get("skillScore").asInt()).isEqualTo(60);
    }

    @Test
    void javaDoesNotMatchJavaScript() throws Exception {
        Workspace workspace = newWorkspace();
        UUID categoryId = createSkillCategoryId(workspace.dm().token(), uniqueName("Lang"));
        UUID javaScriptSkill =
            createSkillId(workspace.dm().token(), categoryId, "JavaScript");
        Member kara = newEmployee(workspace.org(), "kara");
        addMember(workspace.dm().token(), workspace.departmentId(), kara.userId());
        selfAssignSkill(kara.token(), javaScriptSkill);

        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java"), List.of(workspace.teamRoleId()));

        // Exact matching only — a JavaScript-skilled candidate with no other
        // match source is not a candidate for a Java project at all.
        JsonNode response = teamFinderJson(workspace.pm().token(), target, Map.of());
        assertThat(candidateOf(response, kara.userId())).isNull();
    }

    @Test
    void inactiveSkillsStopMatching() throws Exception {
        Workspace workspace = newWorkspace();
        UUID categoryId = createSkillCategoryId(workspace.dm().token(), uniqueName("Lang"));
        UUID javaSkill = createSkillId(workspace.dm().token(), categoryId, "Java");
        Member bob = newEmployee(workspace.org(), "bob");
        addMember(workspace.dm().token(), workspace.departmentId(), bob.userId());
        selfAssignSkill(bob.token(), javaSkill);

        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java"), List.of(workspace.teamRoleId()));
        assertThat(candidateOf(
            teamFinderJson(workspace.pm().token(), target, Map.of()), bob.userId()))
            .isNotNull();

        // Deactivating the catalog skill removes the match source.
        deactivateSkill(workspace.dm().token(), javaSkill);
        assertThat(candidateOf(
            teamFinderJson(workspace.pm().token(), target, Map.of()), bob.userId()))
            .isNull();
    }

    @Test
    void multipleTechnologiesScoreProportionally() throws Exception {
        Workspace workspace = newWorkspace();
        UUID categoryId = createSkillCategoryId(workspace.dm().token(), uniqueName("Lang"));
        UUID javaSkill = createSkillId(workspace.dm().token(), categoryId, "Java");
        UUID postgresSkill =
            createSkillId(workspace.dm().token(), categoryId, "PostgreSQL");

        Member alice = newEmployee(workspace.org(), "alice");
        addMember(workspace.dm().token(), workspace.departmentId(), alice.userId());
        selfAssignSkill(alice.token(), javaSkill);
        selfAssignSkill(alice.token(), postgresSkill);
        Member bob = newEmployee(workspace.org(), "bob");
        addMember(workspace.dm().token(), workspace.departmentId(), bob.userId());
        selfAssignSkill(bob.token(), javaSkill);

        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java", "PostgreSQL"), List.of(workspace.teamRoleId()));
        JsonNode response = teamFinderJson(workspace.pm().token(), target, Map.of());

        JsonNode aliceRow = candidateOf(response, alice.userId());
        assertThat(aliceRow.get("skillMatches")).hasSize(2);
        assertThat(aliceRow.get("score").get("skillScore").asInt()).isEqualTo(60);

        JsonNode bobRow = candidateOf(response, bob.userId());
        assertThat(bobRow.get("skillMatches")).hasSize(1);
        assertThat(bobRow.get("score").get("skillScore").asInt()).isEqualTo(30);
    }
}
