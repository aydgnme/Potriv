package me.aydgn.potriv.allocation.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse.DepartmentSummary;
import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse.UserSummary;
import me.aydgn.potriv.allocation.dto.DepartmentProjectProposalResponse.ProjectSummary;
import me.aydgn.potriv.allocation.entity.DeallocationProposalStatus;

public record DeallocationProposalResponse(
    UUID proposalId,
    UUID allocationId,
    ProjectSummary project,
    UserSummary employee,
    DepartmentSummary reviewDepartment,
    String reason,
    DeallocationProposalStatus status,
    UserSummary proposedBy,
    OffsetDateTime createdAt,
    UserSummary reviewedBy,
    OffsetDateTime reviewedAt
) {

}
