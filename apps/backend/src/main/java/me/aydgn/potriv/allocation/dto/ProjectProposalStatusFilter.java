package me.aydgn.potriv.allocation.dto;

import me.aydgn.potriv.allocation.entity.AssignmentProposalStatus;
import me.aydgn.potriv.allocation.entity.DeallocationProposalStatus;

/**
 * Shared status vocabulary for the combined department review queue. Assignment
 * and deallocation proposals use separate persistence enums with identical
 * values; this filter maps one requested value onto both, keeping the existing
 * request values stable.
 */
public enum ProjectProposalStatusFilter {
    PENDING,
    APPROVED,
    REJECTED;

    public AssignmentProposalStatus toAssignmentStatus() {
        return AssignmentProposalStatus.valueOf(name());
    }

    public DeallocationProposalStatus toDeallocationStatus() {
        return DeallocationProposalStatus.valueOf(name());
    }

    public static ProjectProposalStatusFilter of(AssignmentProposalStatus status) {
        return valueOf(status.name());
    }

    public static ProjectProposalStatusFilter of(DeallocationProposalStatus status) {
        return valueOf(status.name());
    }
}
