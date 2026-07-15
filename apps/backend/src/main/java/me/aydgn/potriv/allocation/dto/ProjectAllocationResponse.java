package me.aydgn.potriv.allocation.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse.UserSummary;
import me.aydgn.potriv.allocation.entity.AssignmentProposalStatus;

public record ProjectAllocationResponse(
    UUID allocationId,
    UUID projectId,
    UserSummary employee,
    UUID assignmentProposalId,
    int workHoursPerDay,
    OffsetDateTime allocatedAt,
    OffsetDateTime deallocatedAt,
    AssignmentProposalStatus proposalStatus
) {

}
