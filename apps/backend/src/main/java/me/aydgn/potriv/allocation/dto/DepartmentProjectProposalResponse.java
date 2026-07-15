package me.aydgn.potriv.allocation.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse.DepartmentSummary;
import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse.TeamRoleSummary;
import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse.UserSummary;
import me.aydgn.potriv.allocation.entity.AssignmentProposalStatus;
import me.aydgn.potriv.project.entity.ProjectStatus;

/**
 * A Department Manager review-queue item. {@code proposalType} is currently
 * always {@code ASSIGNMENT}; the shape is intentionally stable so PROJECT-ALLOC-03
 * can add a deallocation proposal type without breaking the endpoint.
 */
public record DepartmentProjectProposalResponse(
    String proposalType,
    UUID proposalId,
    ProjectSummary project,
    UserSummary employee,
    DepartmentSummary reviewDepartment,
    int workHoursPerDay,
    List<TeamRoleSummary> teamRoles,
    String comments,
    AssignmentProposalStatus status,
    UserSummary proposedBy,
    OffsetDateTime createdAt,
    UserSummary reviewedBy,
    OffsetDateTime reviewedAt
) {

    public static final String TYPE_ASSIGNMENT = "ASSIGNMENT";

    public record ProjectSummary(UUID projectId, String name, ProjectStatus status) {
    }
}
