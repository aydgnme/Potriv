package me.aydgn.potriv.allocation.dto;

/**
 * Result of reviewing an assignment proposal. On accept, {@code allocation} is
 * populated; on reject it is {@code null}.
 */
public record AssignmentReviewResponse(
    AssignmentProposalResponse proposal,
    ProjectAllocationResponse allocation
) {

}
