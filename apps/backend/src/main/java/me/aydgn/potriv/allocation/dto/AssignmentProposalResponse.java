package me.aydgn.potriv.allocation.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import me.aydgn.potriv.allocation.entity.AssignmentProposalStatus;

public record AssignmentProposalResponse(
    UUID proposalId,
    UUID projectId,
    UserSummary employee,
    DepartmentSummary reviewDepartment,
    int workHoursPerDay,
    List<TeamRoleSummary> teamRoles,
    String comments,
    AssignmentProposalStatus status,
    UserSummary proposedBy,
    OffsetDateTime createdAt,
    UserSummary reviewedBy,
    OffsetDateTime reviewedAt,
    /** Why the reviewer declined. Null unless this proposal was rejected with one. */
    String rejectionReason
) {

    /** Safe user projection — never exposes password/session/token internals. */
    public record UserSummary(UUID userId, String name, String email) {
    }

    public record DepartmentSummary(UUID departmentId, String name) {
    }

    public record TeamRoleSummary(UUID teamRoleId, String name) {
    }
}
