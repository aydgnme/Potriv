package me.aydgn.potriv.project.teamfinder;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Availability semantics: capacity-consuming statuses, availability buckets,
 * and close-to-finish detection with its score floor.
 */
class TeamFinderAvailabilityIntegrationTest extends AbstractTeamFinderIntegrationTest {

    private record SkillSetup(UUID javaSkill) {
    }

    private SkillSetup javaSkill(Workspace workspace) throws Exception {
        UUID categoryId = createSkillCategoryId(workspace.dm().token(), uniqueName("Lang"));
        return new SkillSetup(createSkillId(workspace.dm().token(), categoryId, "Java"));
    }

    private Member javaEmployee(Workspace workspace, SkillSetup skills, String prefix)
        throws Exception {
        Member member = newEmployee(workspace.org(), prefix);
        addMember(workspace.dm().token(), workspace.departmentId(), member.userId());
        selfAssignSkill(member.token(), skills.javaSkill());
        return member;
    }

    /** A FIXED, STARTING project with an explicit past start and deadline. */
    private UUID fixedConsumingProject(Workspace workspace, String name, LocalDate startDate,
        LocalDate deadline) throws Exception {
        Map<String, Object> payload = projectPayload(name);
        payload.put("status", "STARTING");
        payload.put("startDate", startDate.toString());
        payload.put("deadlineDate", deadline.toString());
        return createProjectId(workspace.pm().token(), payload);
    }

    @Test
    void nonConsumingStatusesDoNotReduceAvailableHours() throws Exception {
        Workspace workspace = newWorkspace();
        SkillSetup skills = javaSkill(workspace);
        Member dan = javaEmployee(workspace, skills, "dan");

        // 8h on a NOT_STARTED project consumes nothing; 4h on STARTING does.
        UUID dormant = createProjectId(workspace.pm().token(),
            projectPayload(uniqueName("Dormant")));
        allocate(workspace, dormant, dan.userId(), 8);
        UUID running = createConsumingProject(workspace.pm().token(), uniqueName("Running"));
        allocate(workspace, running, dan.userId(), 4);

        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java"), List.of(workspace.teamRoleId()));
        JsonNode response = teamFinderJson(workspace.pm().token(), target,
            Map.of("includePartiallyAvailable", true));

        JsonNode availability = candidateOf(response, dan.userId()).get("availability");
        assertThat(availability.get("allocatedHours").asInt()).isEqualTo(4);
        assertThat(availability.get("availableHours").asInt()).isEqualTo(4);
        assertThat(availability.get("activeAllocationCount").asInt()).isEqualTo(2);
        assertThat(availability.get("fullyAvailable").asBoolean()).isFalse();
        assertThat(availability.get("partiallyAvailable").asBoolean()).isTrue();
        assertThat(availability.get("unavailable").asBoolean()).isFalse();
    }

    @Test
    void availabilityBucketsAndScores() throws Exception {
        Workspace workspace = newWorkspace();
        SkillSetup skills = javaSkill(workspace);
        Member alice = javaEmployee(workspace, skills, "alice");
        Member dan = javaEmployee(workspace, skills, "dan");
        Member eve = javaEmployee(workspace, skills, "eve");

        UUID partialLoad = createConsumingProject(workspace.pm().token(), uniqueName("Half"));
        allocate(workspace, partialLoad, dan.userId(), 4);
        UUID fullLoad = createConsumingProject(workspace.pm().token(), uniqueName("Full"));
        allocate(workspace, fullLoad, eve.userId(), 8);

        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java"), List.of(workspace.teamRoleId()));
        JsonNode response = teamFinderJson(workspace.pm().token(), target,
            Map.of("includePartiallyAvailable", true, "includeUnavailable", true));

        JsonNode aliceRow = candidateOf(response, alice.userId());
        assertThat(aliceRow.get("availability").get("fullyAvailable").asBoolean()).isTrue();
        assertThat(aliceRow.get("availability").get("availableHours").asInt()).isEqualTo(8);
        assertThat(aliceRow.get("score").get("availabilityScore").asInt()).isEqualTo(20);

        JsonNode danRow = candidateOf(response, dan.userId());
        assertThat(danRow.get("availability").get("partiallyAvailable").asBoolean()).isTrue();
        assertThat(danRow.get("availability").get("availableHours").asInt()).isEqualTo(4);
        assertThat(danRow.get("score").get("availabilityScore").asInt()).isEqualTo(10);

        JsonNode eveRow = candidateOf(response, eve.userId());
        assertThat(eveRow.get("availability").get("unavailable").asBoolean()).isTrue();
        assertThat(eveRow.get("availability").get("availableHours").asInt()).isZero();
        assertThat(eveRow.get("score").get("availabilityScore").asInt()).isZero();
    }

    @Test
    void closeToFinishDetectionAndAvailabilityFloor() throws Exception {
        Workspace workspace = newWorkspace();
        SkillSetup skills = javaSkill(workspace);
        Member frank = javaEmployee(workspace, skills, "frank");

        LocalDate today = LocalDate.now();
        UUID endingSoon = fixedConsumingProject(workspace, uniqueName("EndingSoon"),
            today.minusDays(30), today.plusDays(7));
        allocate(workspace, endingSoon, frank.userId(), 8);

        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java"), List.of(workspace.teamRoleId()));

        // Invisible without the flag (fully allocated, no other bucket).
        JsonNode withoutFlag = teamFinderJson(workspace.pm().token(), target, Map.of());
        assertThat(candidateOf(withoutFlag, frank.userId())).isNull();

        // With the flag: detected, and the availability score gets the floor 10
        // even though 0 hours remain — 60 + 0 + 10 = 70 in total.
        JsonNode withFlag = teamFinderJson(workspace.pm().token(), target,
            Map.of("includeCloseToFinish", true));
        JsonNode frankRow = candidateOf(withFlag, frank.userId());
        assertThat(frankRow).isNotNull();
        JsonNode availability = frankRow.get("availability");
        assertThat(availability.get("closeToFinish").asBoolean()).isTrue();
        assertThat(availability.get("availableHours").asInt()).isZero();
        assertThat(availability.get("closeToFinishProjects")).hasSize(1);
        assertThat(availability.get("closeToFinishProjects").get(0).get("projectId").asText())
            .isEqualTo(endingSoon.toString());
        assertThat(frankRow.get("score").get("availabilityScore").asInt()).isEqualTo(10);
        assertThat(frankRow.get("score").get("totalScore").asInt()).isEqualTo(70);
    }

    @Test
    void closeToFinishIgnoresFarPastOngoingAndNonConsumingDeadlines() throws Exception {
        Workspace workspace = newWorkspace();
        SkillSetup skills = javaSkill(workspace);
        LocalDate today = LocalDate.now();

        // Deadline outside the 2-week window.
        Member far = javaEmployee(workspace, skills, "far");
        UUID farProject = fixedConsumingProject(workspace, uniqueName("Far"),
            today.minusDays(30), today.plusDays(15));
        allocate(workspace, farProject, far.userId(), 8);

        // Deadline already passed.
        Member overdue = javaEmployee(workspace, skills, "overdue");
        UUID overdueProject = fixedConsumingProject(workspace, uniqueName("Overdue"),
            today.minusDays(30), today.minusDays(1));
        allocate(workspace, overdueProject, overdue.userId(), 8);

        // ONGOING projects have no deadline and never qualify.
        Member ongoing = javaEmployee(workspace, skills, "ongoing");
        Map<String, Object> ongoingPayload = projectPayload(uniqueName("Ongoing"));
        ongoingPayload.put("status", "STARTING");
        ongoingPayload.put("period", "ONGOING");
        ongoingPayload.remove("deadlineDate");
        UUID ongoingProject = createProjectId(workspace.pm().token(), ongoingPayload);
        allocate(workspace, ongoingProject, ongoing.userId(), 8);

        // NOT_STARTED fixed project inside the window does not consume capacity
        // and therefore does not qualify; the candidate also is not unavailable.
        Member dormant = javaEmployee(workspace, skills, "dormant");
        Map<String, Object> dormantPayload = projectPayload(uniqueName("DormantSoon"));
        dormantPayload.put("startDate", today.minusDays(30).toString());
        dormantPayload.put("deadlineDate", today.plusDays(5).toString());
        UUID dormantProject = createProjectId(workspace.pm().token(), dormantPayload);
        allocate(workspace, dormantProject, dormant.userId(), 8);

        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java"), List.of(workspace.teamRoleId()));
        JsonNode response = teamFinderJson(workspace.pm().token(), target,
            Map.of("includeCloseToFinish", true));

        // None of the fully-allocated candidates qualifies as close-to-finish.
        assertThat(candidateOf(response, far.userId())).isNull();
        assertThat(candidateOf(response, overdue.userId())).isNull();
        assertThat(candidateOf(response, ongoing.userId())).isNull();
        // The dormant-project candidate has an allocation but zero consumed
        // hours: not fully available, not partial, not unavailable — excluded.
        assertThat(candidateOf(response, dormant.userId())).isNull();
    }
}
