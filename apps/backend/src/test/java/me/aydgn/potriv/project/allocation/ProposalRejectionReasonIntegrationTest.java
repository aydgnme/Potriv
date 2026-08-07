package me.aydgn.potriv.project.allocation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

/**
 * A project manager whose request is declined can now read why.
 *
 * <p>The reason is optional, so every one of these also pins the compatibility
 * half: rejecting with no body at all remains valid, and a blank string means the
 * same as no reason rather than becoming an empty one.
 *
 * <p>It belongs to the rejection transition and nothing else — a pending or
 * approved proposal never carries one, and a terminal proposal cannot be
 * re-rejected to rewrite it.
 */
class ProposalRejectionReasonIntegrationTest extends AbstractProjectAllocationIntegrationTest {

    private static final String REASON = "Requested hours exceed current team capacity.";

    // ---- assignment proposals ----

    @Test
    void rejectingAnAssignmentWithAReasonPersistsItTrimmed() throws Exception {
        Workspace workspace = newWorkspace();
        UUID proposalId = pendingAssignment(workspace, 4);

        JsonNode response = readJson(
            rejectAssignmentWithBody(workspace, proposalId, "{\"reason\":\"  " + REASON + "  \"}")
                .andExpect(status().isOk()));

        assertThat(response.get("proposal").get("rejectionReason").asText()).isEqualTo(REASON);
        assertThat(queueReason(workspace, proposalId, "REJECTED")).isEqualTo(REASON);
    }

    @Test
    void rejectingAnAssignmentWithNoBodyStaysValid() throws Exception {
        Workspace workspace = newWorkspace();
        UUID proposalId = pendingAssignment(workspace, 4);

        JsonNode response = readJson(
            rejectAssignment(workspace.dm().token(), proposalId).andExpect(status().isOk()));

        assertThat(response.get("proposal").get("status").asText()).isEqualTo("REJECTED");
        assertThat(response.get("proposal").get("rejectionReason").isNull()).isTrue();
    }

    @Test
    void blankReasonIsStoredAsNoReason() throws Exception {
        Workspace workspace = newWorkspace();
        UUID proposalId = pendingAssignment(workspace, 4);

        JsonNode response = readJson(
            rejectAssignmentWithBody(workspace, proposalId, "{\"reason\":\"   \"}")
                .andExpect(status().isOk()));

        assertThat(response.get("proposal").get("rejectionReason").isNull())
            .as("a whitespace-only reason must not become an empty string")
            .isTrue();
    }

    @Test
    void aReasonAtTheLengthLimitIsAccepted() throws Exception {
        Workspace workspace = newWorkspace();
        UUID proposalId = pendingAssignment(workspace, 4);

        String atLimit = "x".repeat(5000);
        JsonNode response = readJson(
            rejectAssignmentWithBody(workspace, proposalId, "{\"reason\":\"" + atLimit + "\"}")
                .andExpect(status().isOk()));

        assertThat(response.get("proposal").get("rejectionReason").asText()).hasSize(5000);
    }

    @Test
    void anOverlongReasonIsRejectedByValidation() throws Exception {
        Workspace workspace = newWorkspace();
        UUID proposalId = pendingAssignment(workspace, 4);

        String tooLong = "x".repeat(5001);
        rejectAssignmentWithBody(workspace, proposalId, "{\"reason\":\"" + tooLong + "\"}")
            .andExpect(status().isBadRequest());

        // The proposal is untouched by a request that never passed validation.
        assertThat(queueStatus(workspace, proposalId, "PENDING")).isEqualTo("PENDING");
    }

    @Test
    void aPendingAssignmentHasNoRejectionReason() throws Exception {
        Workspace workspace = newWorkspace();
        UUID proposalId = pendingAssignment(workspace, 4);

        assertThat(queueNode(workspace, proposalId, "PENDING").get("rejectionReason").isNull())
            .isTrue();
    }

    @Test
    void anAcceptedAssignmentHasNoRejectionReason() throws Exception {
        Workspace workspace = newWorkspace();
        UUID proposalId = pendingAssignment(workspace, 4);

        JsonNode response = readJson(
            acceptAssignment(workspace.dm().token(), proposalId).andExpect(status().isOk()));

        assertThat(response.get("proposal").get("rejectionReason").isNull()).isTrue();
        assertThat(queueNode(workspace, proposalId, "APPROVED").get("rejectionReason").isNull())
            .isTrue();
    }

    @Test
    void aRejectedAssignmentCannotBeRejectedAgainToRewriteTheReason() throws Exception {
        Workspace workspace = newWorkspace();
        UUID proposalId = pendingAssignment(workspace, 4);

        rejectAssignmentWithBody(workspace, proposalId, "{\"reason\":\"" + REASON + "\"}")
            .andExpect(status().isOk());

        rejectAssignmentWithBody(workspace, proposalId, "{\"reason\":\"Something else.\"}")
            .andExpect(status().isConflict());

        assertThat(queueReason(workspace, proposalId, "REJECTED"))
            .as("the first decision stands")
            .isEqualTo(REASON);
    }

    @Test
    void anotherDepartmentsManagerCannotRejectOrSeeTheReason() throws Exception {
        Workspace mine = newWorkspace();
        Workspace theirs = newWorkspace();
        UUID proposalId = pendingAssignment(mine, 4);

        mockMvc.perform(post("/department/project-proposals/assignments/" + proposalId + "/reject")
                .header(HttpHeaders.AUTHORIZATION, bearer(theirs.dm().token()))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"" + REASON + "\"}"))
            .andExpect(status().isNotFound());

        // And their queue never shows the row at all.
        assertThat(proposalQueueJson(theirs.dm().token(), "PENDING")).isEmpty();
    }

    // ---- deallocation proposals ----

    @Test
    void rejectingADeallocationWithAReasonPersistsIt() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Apollo"));
        UUID allocationId = allocate(workspace, projectId, workspace.employee().userId(), 4);
        UUID proposalId = proposeDeallocationId(
            workspace.pm().token(), projectId, allocationId, "Workstream closed.");

        JsonNode response = readJson(
            mockMvc.perform(
                post("/department/project-proposals/deallocations/" + proposalId + "/reject")
                    .header(HttpHeaders.AUTHORIZATION, bearer(workspace.dm().token()))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"reason\":\"" + REASON + "\"}"))
                .andExpect(status().isOk()));

        JsonNode proposal = response.get("proposal");
        assertThat(proposal.get("rejectionReason").asText()).isEqualTo(REASON);
        assertThat(proposal.get("reason").asText())
            .as("the proposer's reason for asking must survive untouched")
            .isEqualTo("Workstream closed.");
    }

    @Test
    void rejectingADeallocationWithNoBodyStaysValid() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Apollo"));
        UUID allocationId = allocate(workspace, projectId, workspace.employee().userId(), 4);
        UUID proposalId = proposeDeallocationId(
            workspace.pm().token(), projectId, allocationId, "Workstream closed.");

        JsonNode response = readJson(
            rejectDeallocation(workspace.dm().token(), proposalId).andExpect(status().isOk()));

        assertThat(response.get("proposal").get("status").asText()).isEqualTo("REJECTED");
        assertThat(response.get("proposal").get("rejectionReason").isNull()).isTrue();
        assertThat(response.get("proposal").get("reason").asText()).isEqualTo("Workstream closed.");
    }

    @Test
    void acceptingADeallocationLeavesNoRejectionReason() throws Exception {
        Workspace workspace = newWorkspace();
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Apollo"));
        UUID allocationId = allocate(workspace, projectId, workspace.employee().userId(), 4);
        UUID proposalId = proposeDeallocationId(
            workspace.pm().token(), projectId, allocationId, "Workstream closed.");

        JsonNode response = readJson(
            acceptDeallocation(workspace.dm().token(), proposalId).andExpect(status().isOk()));

        assertThat(response.get("proposal").get("rejectionReason").isNull()).isTrue();
    }

    // ---- helpers ----

    private UUID pendingAssignment(Workspace workspace, int hours) throws Exception {
        UUID projectId = createConsumingProject(workspace.pm().token(), uniqueName("Apollo"));
        return proposeAssignmentId(
            workspace.pm().token(), projectId, workspace.employee().userId(), hours,
            List.of(workspace.teamRoleId()));
    }

    private ResultActions rejectAssignmentWithBody(
        Workspace workspace, UUID proposalId, String body) throws Exception {
        return mockMvc.perform(
            post("/department/project-proposals/assignments/" + proposalId + "/reject")
                .header(HttpHeaders.AUTHORIZATION, bearer(workspace.dm().token()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private JsonNode readJson(ResultActions actions) throws Exception {
        return objectMapper.readTree(actions.andReturn().getResponse().getContentAsString());
    }

    private JsonNode queueNode(Workspace workspace, UUID proposalId, String status)
        throws Exception {
        for (JsonNode row : proposalQueueJson(workspace.dm().token(), status)) {
            if (proposalId.toString().equals(row.get("proposalId").asText())) {
                return row;
            }
        }
        throw new AssertionError("proposal " + proposalId + " not in the " + status + " queue");
    }

    private String queueReason(Workspace workspace, UUID proposalId, String status)
        throws Exception {
        return queueNode(workspace, proposalId, status).get("rejectionReason").asText();
    }

    private String queueStatus(Workspace workspace, UUID proposalId, String status)
        throws Exception {
        return queueNode(workspace, proposalId, status).get("status").asText();
    }
}
