package me.aydgn.potriv.allocation.entity;

/**
 * Lifecycle status of a project assignment proposal. Persisted as a string.
 * Proposals are always created as PENDING; APPROVED and REJECTED are handled by
 * the later review workflow (PROJECT-ALLOC-02).
 */
public enum AssignmentProposalStatus {
    PENDING,
    APPROVED,
    REJECTED
}
