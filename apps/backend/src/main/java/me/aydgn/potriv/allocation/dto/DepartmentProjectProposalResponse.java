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
 *
 * <p>{@code capacity} carries the reviewer's decision context and is present only
 * where it means something — see {@link ProposalCapacityContext}.
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
    OffsetDateTime reviewedAt,
    /**
     * Current capacity context for the employee, on pending assignment rows only.
     * Null for deallocation rows, which free capacity rather than consume it, and
     * for rows that have already been decided.
     */
    ProposalCapacityContext capacity,
    /**
     * Why this proposal was declined. Null while pending, null when approved, and
     * null for a rejection made without one.
     */
    String rejectionReason
) {

    public static final String TYPE_ASSIGNMENT = "ASSIGNMENT";
    public static final String TYPE_DEALLOCATION = "DEALLOCATION";

    public record ProjectSummary(UUID projectId, String name, ProjectStatus status) {
    }
}
