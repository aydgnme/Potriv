package me.aydgn.potriv.allocation.controller;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import me.aydgn.potriv.allocation.dto.DeallocationReviewResponse;
import me.aydgn.potriv.allocation.service.DeallocationProposalService;
import me.aydgn.potriv.common.config.OpenApiConfig;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.annotation.DepartmentManagerOnly;

/**
 * Department Manager review of deallocation proposals. Requires an actual
 * DepartmentManagerAssignment. Accept ends the allocation (sets deallocatedAt,
 * releasing the employee's capacity); reject records the decision and leaves
 * the allocation active.
 */
@RestController
@RequestMapping("/department/project-proposals/deallocations")
@DepartmentManagerOnly
@Tag(name = "Project Allocation Reviews", description = "Department Manager review of project "
    + "deallocation proposals")
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class DeallocationProposalReviewController {

    private final DeallocationProposalService deallocationProposalService;

    public DeallocationProposalReviewController(
        DeallocationProposalService deallocationProposalService
    ) {
        this.deallocationProposalService = deallocationProposalService;
    }

    @PostMapping("/{proposalId}/accept")
    public DeallocationReviewResponse accept(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID proposalId
    ) {
        return deallocationProposalService.accept(authenticatedUser, proposalId);
    }

    @PostMapping("/{proposalId}/reject")
    public DeallocationReviewResponse reject(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID proposalId
    ) {
        return deallocationProposalService.reject(authenticatedUser, proposalId);
    }
}
