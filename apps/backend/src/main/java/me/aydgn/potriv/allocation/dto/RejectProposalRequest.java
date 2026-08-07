package me.aydgn.potriv.allocation.dto;

import jakarta.validation.constraints.Size;

/**
 * Why a reviewer declined a staffing request.
 *
 * <p>The body is optional and so is the field: rejecting without explaining
 * stays valid, which keeps every existing client working. A blank or
 * whitespace-only reason is stored as none rather than as an empty string, so
 * "no reason given" has exactly one representation.
 *
 * <p>Distinct from a deallocation proposal's own {@code reason}, which says why
 * the removal was proposed. That is a different statement by a different person
 * and the two are never merged.
 */
public record RejectProposalRequest(
    @Size(max = 5000)
    String reason
) {

    /** Trimmed text, or null when nothing usable was supplied. */
    public static String normalizedReason(RejectProposalRequest request) {
        if (request == null || request.reason() == null) {
            return null;
        }
        String trimmed = request.reason().trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
