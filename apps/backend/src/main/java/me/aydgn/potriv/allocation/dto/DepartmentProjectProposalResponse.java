package me.aydgn.potriv.allocation.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse.DepartmentSummary;
import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse.TeamRoleSummary;
import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse.UserSummary;
import me.aydgn.potriv.project.entity.ProjectStatus;

/**
 * A Department Manager review-queue item covering both proposal types.
 * {@code proposalType} is {@code ASSIGNMENT} or {@code DEALLOCATION}.
 * Assignment-specific fields ({@code comments}) and deallocation-specific
 * fields ({@code allocationId}, {@code reason}) are null on the other type;
 * {@code workHoursPerDay} and {@code teamRoles} are populated for both (for
 * deallocation rows they come from the allocation and its approved assignment
 * proposal's role snapshot).
 */
public record DepartmentProjectProposalResponse(
    String proposalType,
    UUID proposalId,
    ProjectSummary project,
    UserSummary employee,
    DepartmentSummary reviewDepartment,
    Integer workHoursPerDay,
    List<TeamRoleSummary> teamRoles,
    String comments,
    UUID allocationId,
    String reason,
    ProjectProposalStatusFilter status,
    UserSummary proposedBy,
    OffsetDateTime createdAt,
    UserSummary reviewedBy,
    OffsetDateTime reviewedAt
) {

    public static final String TYPE_ASSIGNMENT = "ASSIGNMENT";
    public static final String TYPE_DEALLOCATION = "DEALLOCATION";

    public record ProjectSummary(UUID projectId, String name, ProjectStatus status) {
    }
}
