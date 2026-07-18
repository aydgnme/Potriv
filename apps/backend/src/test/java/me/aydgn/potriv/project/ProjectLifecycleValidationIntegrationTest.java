package me.aydgn.potriv.project;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Project-01 create/update validation: schedule rules, allowed creation
 * statuses, technology cleaning, and team role requirement rules.
 */
class ProjectLifecycleValidationIntegrationTest extends AbstractProjectLifecycleIntegrationTest {

    @Test
    void createRejectsInvalidNames() throws Exception {
        Org org = newOrg();
        Member pm = newProjectManager(org, "pm");

        Map<String, Object> blank = projectPayload("   ");
        createProject(pm.token(), blank).andExpect(status().isBadRequest());

        Map<String, Object> tooLong = projectPayload("x".repeat(201));
        createProject(pm.token(), tooLong).andExpect(status().isBadRequest());
    }

    @Test
    void createEnforcesPeriodAndDateRules() throws Exception {
        Org org = newOrg();
        Member pm = newProjectManager(org, "pm");

        // FIXED requires a deadline.
        Map<String, Object> noDeadline = projectPayload(uniqueName("NoDeadline"));
        noDeadline.remove("deadlineDate");
        createProject(pm.token(), noDeadline).andExpect(status().isBadRequest());

        // FIXED deadline must not precede the start date.
        Map<String, Object> reversed = projectPayload(uniqueName("Reversed"));
        reversed.put("deadlineDate", "2026-07-01");
        createProject(pm.token(), reversed).andExpect(status().isBadRequest());

        // ONGOING must not carry a deadline.
        Map<String, Object> ongoingWithDeadline = projectPayload(uniqueName("Ongoing"));
        ongoingWithDeadline.put("period", "ONGOING");
        createProject(pm.token(), ongoingWithDeadline).andExpect(status().isBadRequest());
    }

    @Test
    void createAllowsOnlyPlanningStatuses() throws Exception {
        Org org = newOrg();
        Member pm = newProjectManager(org, "pm");

        for (String status : List.of("IN_PROGRESS", "CLOSING", "CLOSED")) {
            Map<String, Object> payload = projectPayload(uniqueName("Status"));
            payload.put("status", status);
            createProject(pm.token(), payload).andExpect(status().isBadRequest());
        }
    }

    @Test
    void createRejectsBlankAndDuplicateTechnologies() throws Exception {
        Org org = newOrg();
        Member pm = newProjectManager(org, "pm");

        Map<String, Object> blankItem = projectPayload(uniqueName("BlankTech"));
        blankItem.put("technologyStack", List.of("Java", "   "));
        createProject(pm.token(), blankItem).andExpect(status().isBadRequest());

        // Duplicates are detected on the trimmed, case-insensitive value.
        Map<String, Object> duplicated = projectPayload(uniqueName("DupTech"));
        duplicated.put("technologyStack", List.of("Java", " java "));
        createProject(pm.token(), duplicated).andExpect(status().isBadRequest());
    }

    @Test
    void createRejectsInvalidTeamRoleRequirements() throws Exception {
        Org org = newOrg();
        Member pm = newProjectManager(org, "pm");
        UUID roleId = createTeamRoleId(org.adminToken(), uniqueName("Backend"));

        Map<String, Object> zeroMembers = projectPayload(uniqueName("Zero"));
        zeroMembers.put("teamRoles", List.of(
            Map.of("teamRoleId", roleId.toString(), "requiredMembers", 0)));
        createProject(pm.token(), zeroMembers).andExpect(status().isBadRequest());

        Map<String, Object> duplicatedRole = projectPayload(uniqueName("DupRole"));
        duplicatedRole.put("teamRoles", List.of(
            Map.of("teamRoleId", roleId.toString(), "requiredMembers", 1),
            Map.of("teamRoleId", roleId.toString(), "requiredMembers", 2)));
        createProject(pm.token(), duplicatedRole).andExpect(status().isBadRequest());
    }

    @Test
    void createRejectsUnknownCrossOrgAndInactiveTeamRoles() throws Exception {
        Org orgA = newOrg();
        Org orgB = newOrg();
        Member pm = newProjectManager(orgA, "pm");
        UUID foreignRole = createTeamRoleId(orgB.adminToken(), uniqueName("Foreign"));
        UUID inactiveRole = createTeamRoleId(orgA.adminToken(), uniqueName("Legacy"));
        deactivateTeamRole(orgA.adminToken(), inactiveRole);

        // Unknown and cross-org roles are indistinguishable: controlled 400.
        Map<String, Object> unknown = projectPayload(uniqueName("Unknown"));
        unknown.put("teamRoles", List.of(
            Map.of("teamRoleId", UUID.randomUUID().toString(), "requiredMembers", 1)));
        createProject(pm.token(), unknown).andExpect(status().isBadRequest());

        Map<String, Object> crossOrg = projectPayload(uniqueName("CrossOrg"));
        crossOrg.put("teamRoles", List.of(
            Map.of("teamRoleId", foreignRole.toString(), "requiredMembers", 1)));
        createProject(pm.token(), crossOrg).andExpect(status().isBadRequest());

        // An inactive role cannot be newly selected.
        Map<String, Object> inactive = projectPayload(uniqueName("Inactive"));
        inactive.put("teamRoles", List.of(
            Map.of("teamRoleId", inactiveRole.toString(), "requiredMembers", 1)));
        createProject(pm.token(), inactive).andExpect(status().isBadRequest());
    }

    @Test
    void updatePreservesAlreadyAttachedInactiveTeamRole() throws Exception {
        Org org = newOrg();
        Member pm = newProjectManager(org, "pm");
        UUID roleId = createTeamRoleId(org.adminToken(), uniqueName("Backend"));

        Map<String, Object> payload = projectPayload(uniqueName("Preserve"));
        payload.put("teamRoles", List.of(
            Map.of("teamRoleId", roleId.toString(), "requiredMembers", 1)));
        UUID projectId = createProjectId(pm.token(), payload);

        deactivateTeamRole(org.adminToken(), roleId);

        // The already-attached role survives an update; only new selections of
        // inactive roles are blocked.
        JsonNode updated = patchProjectExpectOk(pm.token(), projectId,
            Map.of("teamRoles", List.of(
                Map.of("teamRoleId", roleId.toString(), "requiredMembers", 3))));
        JsonNode requirement = updated.get("teamRoles").get(0);
        assertThat(requirement.get("teamRoleId").asText()).isEqualTo(roleId.toString());
        assertThat(requirement.get("requiredMembers").asInt()).isEqualTo(3);
        assertThat(requirement.get("active").asBoolean()).isFalse();

        // But a different project cannot newly add the now-inactive role.
        Map<String, Object> fresh = projectPayload(uniqueName("Fresh"));
        fresh.put("teamRoles", List.of(
            Map.of("teamRoleId", roleId.toString(), "requiredMembers", 1)));
        createProject(pm.token(), fresh).andExpect(status().isBadRequest());
    }
}
