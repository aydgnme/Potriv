package me.aydgn.potriv.allocation.entity;

/**
 * Lifecycle status of a project deallocation proposal. Persisted as a string.
 * Proposals are always created as PENDING; the client never chooses the status.
 */
public enum DeallocationProposalStatus {
    PENDING,
    APPROVED,
    REJECTED
}
