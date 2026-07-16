package me.aydgn.potriv.allocation.dto;

/**
 * Result of reviewing a deallocation proposal. The allocation is included in
 * both outcomes: after accept its {@code deallocatedAt} is populated; after
 * reject it remains null (the allocation stays active).
 */
public record DeallocationReviewResponse(
    DeallocationProposalResponse proposal,
    ProjectAllocationResponse allocation
) {

}
