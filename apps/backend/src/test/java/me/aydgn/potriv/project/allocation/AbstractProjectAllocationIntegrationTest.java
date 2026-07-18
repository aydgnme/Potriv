package me.aydgn.potriv.project.allocation;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.JsonNode;

import me.aydgn.potriv.project.AbstractProjectLifecycleIntegrationTest;

/**
 * Shared HTTP helpers for allocation-workflow integration tests: departments,
 * memberships, assignment/deallocation proposals, and the review queue.
 */
abstract class AbstractProjectAllocationIntegrationTest
    extends AbstractProjectLifecycleIntegrationTest {

    /**
     * One fully wired org: an owning PM, a Department Manager with an assigned
     * department, and one employee who is a member of that department.
     */
    protected record Workspace(
        Org org, Member pm, Member dm, UUID departmentId, Member employee, UUID teamRoleId) {
    }

    protected Workspace newWorkspace() throws Exception {
        Org org = newOrg();
        Member pm = newProjectManager(org, "pm");
        Member dm = newDepartmentManager(org, "dm");
        UUID departmentId = createDepartment(org.adminToken(), uniqueName("Engineering"));
        assignManager(org.adminToken(), departmentId, dm.userId());
        Member employee = newEmployee(org, "emp");
        addMember(dm.token(), departmentId, employee.userId());
        UUID teamRoleId = createTeamRoleId(org.adminToken(), uniqueName("Backend"));
        return new Workspace(org, pm, dm, departmentId, employee, teamRoleId);
    }

    protected UUID createDepartment(String adminToken, String name) throws Exception {
        String body = mockMvc.perform(post("/departments")
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", name))))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("departmentId").asText());
    }

    protected void assignManager(String adminToken, UUID departmentId, UUID userId)
        throws Exception {
        mockMvc.perform(put("/departments/" + departmentId + "/manager")
                .header(HttpHeaders.AUTHORIZATION, bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("userId", userId.toString()))))
            .andExpect(status().isOk());
    }

    protected void addMember(String managerToken, UUID departmentId, UUID userId)
        throws Exception {
        mockMvc.perform(post("/departments/" + departmentId + "/members/" + userId)
                .header(HttpHeaders.AUTHORIZATION, bearer(managerToken)))
            .andExpect(status().isOk());
    }

    /** A project in a capacity-consuming status, owned by the given PM. */
    protected UUID createConsumingProject(String pmToken, String name) throws Exception {
        Map<String, Object> payload = projectPayload(name);
        payload.put("status", "STARTING");
        return createProjectId(pmToken, payload);
    }

    protected ResultActions proposeAssignment(String pmToken, UUID projectId,
        UUID employeeId, int hours, List<UUID> teamRoleIds) throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("employeeId", employeeId.toString());
        payload.put("workHoursPerDay", hours);
        payload.put("teamRoleIds", teamRoleIds.stream().map(UUID::toString).toList());
        return proposeAssignmentRaw(pmToken, projectId, payload);
    }

    protected ResultActions proposeAssignmentRaw(String pmToken, UUID projectId,
        Map<String, Object> payload) throws Exception {
        return mockMvc.perform(post("/projects/" + projectId + "/assignment-proposals")
            .header(HttpHeaders.AUTHORIZATION, bearer(pmToken))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(payload)));
    }

    protected UUID proposeAssignmentId(String pmToken, UUID projectId,
        UUID employeeId, int hours, List<UUID> teamRoleIds) throws Exception {
        String body = proposeAssignment(pmToken, projectId, employeeId, hours, teamRoleIds)
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("proposalId").asText());
    }

    protected ResultActions acceptAssignment(String dmToken, UUID proposalId) throws Exception {
        return mockMvc.perform(
            post("/department/project-proposals/assignments/" + proposalId + "/accept")
                .header(HttpHeaders.AUTHORIZATION, bearer(dmToken)));
    }

    protected ResultActions rejectAssignment(String dmToken, UUID proposalId) throws Exception {
        return mockMvc.perform(
            post("/department/project-proposals/assignments/" + proposalId + "/reject")
                .header(HttpHeaders.AUTHORIZATION, bearer(dmToken)));
    }

    /** Accepts the proposal and returns the created allocation id. */
    protected UUID acceptAssignmentForAllocationId(String dmToken, UUID proposalId)
        throws Exception {
        String body = acceptAssignment(dmToken, proposalId)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body)
            .get("allocation").get("allocationId").asText());
    }

    /** Propose + accept in one step; returns the active allocation id. */
    protected UUID allocate(Workspace workspace, UUID projectId, UUID employeeId, int hours)
        throws Exception {
        UUID proposalId = proposeAssignmentId(
            workspace.pm().token(), projectId, employeeId, hours,
            List.of(workspace.teamRoleId()));
        return acceptAssignmentForAllocationId(workspace.dm().token(), proposalId);
    }

    protected ResultActions proposeDeallocation(String pmToken, UUID projectId,
        UUID allocationId, String reason) throws Exception {
        return mockMvc.perform(post("/projects/" + projectId + "/allocations/" + allocationId
                + "/deallocation-proposals")
            .header(HttpHeaders.AUTHORIZATION, bearer(pmToken))
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("reason", reason))));
    }

    protected UUID proposeDeallocationId(String pmToken, UUID projectId, UUID allocationId,
        String reason) throws Exception {
        String body = proposeDeallocation(pmToken, projectId, allocationId, reason)
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("proposalId").asText());
    }

    protected ResultActions acceptDeallocation(String dmToken, UUID proposalId) throws Exception {
        return mockMvc.perform(
            post("/department/project-proposals/deallocations/" + proposalId + "/accept")
                .header(HttpHeaders.AUTHORIZATION, bearer(dmToken)));
    }

    protected ResultActions rejectDeallocation(String dmToken, UUID proposalId) throws Exception {
        return mockMvc.perform(
            post("/department/project-proposals/deallocations/" + proposalId + "/reject")
                .header(HttpHeaders.AUTHORIZATION, bearer(dmToken)));
    }

    /** Ends the allocation through the real proposal + review flow. */
    protected void deallocate(Workspace workspace, UUID projectId, UUID allocationId)
        throws Exception {
        UUID proposalId = proposeDeallocationId(
            workspace.pm().token(), projectId, allocationId, "Test deallocation");
        acceptDeallocation(workspace.dm().token(), proposalId).andExpect(status().isOk());
    }

    protected ResultActions proposalQueue(String dmToken, String statusOrNull) throws Exception {
        var request = get("/department/project-proposals")
            .header(HttpHeaders.AUTHORIZATION, bearer(dmToken));
        if (statusOrNull != null) {
            request = request.param("status", statusOrNull);
        }
        return mockMvc.perform(request);
    }

    protected JsonNode proposalQueueJson(String dmToken, String statusOrNull) throws Exception {
        String body = proposalQueue(dmToken, statusOrNull)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }
}
