package me.aydgn.potriv.project.teamfinder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.allocation.repository.ProjectAllocationRepository;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRepository;
import me.aydgn.potriv.allocation.repository.ProjectDeallocationProposalRepository;
import me.aydgn.potriv.skill.repository.EmployeeSkillRepository;

/**
 * Team Finder access control, tenant anti-leak, safe response shape, and the
 * strictly read-only (no side effects) contract.
 */
class TeamFinderSecurityIntegrationTest extends AbstractTeamFinderIntegrationTest {

    @Autowired
    private ProjectAssignmentProposalRepository assignmentProposalRepository;

    @Autowired
    private ProjectAllocationRepository allocationRepository;

    @Autowired
    private ProjectDeallocationProposalRepository deallocationProposalRepository;

    @Autowired
    private EmployeeSkillRepository employeeSkillRepository;

    @Test
    void accessControlAndAntiLeakMatrix() throws Exception {
        Workspace workspace = newWorkspace();
        Org orgB = newOrg();
        Member otherPm = newProjectManager(workspace.org(), "otherpm");
        Member foreignPm = newProjectManager(orgB, "fpm");
        String projectName = uniqueName("Target");
        UUID target = createTargetProject(workspace.pm().token(), projectName,
            List.of("Java"), List.of(workspace.teamRoleId()));

        mockMvc.perform(post("/projects/" + target + "/team-finder")
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnauthorized());
        runTeamFinder(workspace.employee().token(), target, Map.of())
            .andExpect(status().isForbidden());
        runTeamFinder(workspace.dm().token(), target, Map.of())
            .andExpect(status().isForbidden());

        // Non-owner and cross-org PMs get an anti-leak 404 without project data.
        for (Member intruder : new Member[] {otherPm, foreignPm}) {
            String body = runTeamFinder(intruder.token(), target, Map.of())
                .andExpect(status().isNotFound())
                .andReturn().getResponse().getContentAsString();
            assertThat(body).doesNotContain(projectName, "Java",
                workspace.employee().email());
        }

        runTeamFinder(workspace.pm().token(), UUID.randomUUID(), Map.of())
            .andExpect(status().isNotFound());
        runTeamFinder(workspace.pm().token(), target, Map.of())
            .andExpect(status().isOk());
    }

    @Test
    void candidateExclusionsForIneligibleUsers() throws Exception {
        Workspace workspace = newWorkspace();
        UUID categoryId = createSkillCategoryId(workspace.dm().token(), uniqueName("Lang"));
        UUID javaSkill = createSkillId(workspace.dm().token(), categoryId, "Java");
        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java"), List.of(workspace.teamRoleId()));

        // Grace: skilled but no department membership.
        Member grace = newEmployee(workspace.org(), "grace");
        selfAssignSkill(grace.token(), javaSkill);

        // Ivy: skilled but with a PENDING proposal for the target project.
        Member ivy = newEmployee(workspace.org(), "ivy");
        addMember(workspace.dm().token(), workspace.departmentId(), ivy.userId());
        selfAssignSkill(ivy.token(), javaSkill);
        proposeAssignmentId(workspace.pm().token(), target, ivy.userId(), 2,
            List.of(workspace.teamRoleId()));

        // Jack: skilled but actively allocated to the target project itself.
        Member jack = newEmployee(workspace.org(), "jack");
        addMember(workspace.dm().token(), workspace.departmentId(), jack.userId());
        selfAssignSkill(jack.token(), javaSkill);
        allocate(workspace, target, jack.userId(), 2);

        // Rita: skilled, previously rejected for the target — still eligible.
        Member rita = newEmployee(workspace.org(), "rita");
        addMember(workspace.dm().token(), workspace.departmentId(), rita.userId());
        selfAssignSkill(rita.token(), javaSkill);
        UUID rejected = proposeAssignmentId(workspace.pm().token(), target, rita.userId(), 2,
            List.of(workspace.teamRoleId()));
        rejectAssignment(workspace.dm().token(), rejected).andExpect(status().isOk());

        JsonNode response = teamFinderJson(workspace.pm().token(), target, Map.of());
        assertThat(candidateOf(response, grace.userId())).isNull();
        assertThat(candidateOf(response, ivy.userId())).isNull();
        assertThat(candidateOf(response, jack.userId())).isNull();
        assertThat(candidateOf(response, rita.userId())).isNotNull();
    }

    @Test
    void responseExposesOnlySafeFields() throws Exception {
        Workspace workspace = newWorkspace();
        UUID categoryId = createSkillCategoryId(workspace.dm().token(), uniqueName("Lang"));
        UUID javaSkill = createSkillId(workspace.dm().token(), categoryId, "Java");
        Member alice = newEmployee(workspace.org(), "alice");
        addMember(workspace.dm().token(), workspace.departmentId(), alice.userId());
        selfAssignSkill(alice.token(), javaSkill);
        UUID target = createTargetProject(workspace.pm().token(), uniqueName("Target"),
            List.of("Java"), List.of(workspace.teamRoleId()));

        String body = runTeamFinder(workspace.pm().token(), target, Map.of())
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain(
            "passwordHash", "normalizedName", "failedLoginAttempts", "lockedUntil",
            "refreshToken", "hibernateLazyInitializer");

        JsonNode employee = candidateOf(objectMapper.readTree(body), alice.userId())
            .get("employee");
        List<String> fields = new java.util.ArrayList<>();
        employee.fieldNames().forEachRemaining(fields::add);
        assertThat(fields).containsExactlyInAnyOrder("userId", "name", "email");
    }

    @Test
    void teamFinderHasNoSideEffects() throws Exception {
        Workspace workspace = newWorkspace();
        UUID categoryId = createSkillCategoryId(workspace.dm().token(), uniqueName("Lang"));
        UUID javaSkill = createSkillId(workspace.dm().token(), categoryId, "Java");
        Member alice = newEmployee(workspace.org(), "alice");
        addMember(workspace.dm().token(), workspace.departmentId(), alice.userId());
        selfAssignSkill(alice.token(), javaSkill);
        String projectName = uniqueName("Target");
        UUID target = createTargetProject(workspace.pm().token(), projectName,
            List.of("Java"), List.of(workspace.teamRoleId()));

        long proposalsBefore = assignmentProposalRepository.count();
        long allocationsBefore = allocationRepository.count();
        long deallocationsBefore = deallocationProposalRepository.count();
        long skillsBefore = employeeSkillRepository.count();

        teamFinderJson(workspace.pm().token(), target,
            Map.of("includePartiallyAvailable", true, "includeUnavailable", true,
                "includeCloseToFinish", true));

        // Strictly read-only: no workflow rows, no skill rows, no project change.
        assertThat(assignmentProposalRepository.count()).isEqualTo(proposalsBefore);
        assertThat(allocationRepository.count()).isEqualTo(allocationsBefore);
        assertThat(deallocationProposalRepository.count()).isEqualTo(deallocationsBefore);
        assertThat(employeeSkillRepository.count()).isEqualTo(skillsBefore);
        getProject(workspace.pm().token(), target)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value(projectName));
    }
}
