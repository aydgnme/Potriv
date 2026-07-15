package me.aydgn.potriv.allocation.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import me.aydgn.potriv.allocation.dto.AssignmentReviewResponse;
import me.aydgn.potriv.allocation.dto.DepartmentProjectProposalResponse;
import me.aydgn.potriv.allocation.entity.AssignmentProposalStatus;
import me.aydgn.potriv.allocation.service.AssignmentProposalReviewService;
import me.aydgn.potriv.common.config.OpenApiConfig;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.annotation.DepartmentManagerOnly;

/**
 * Department Manager review queue for project assignment proposals. Requires an
 * actual DepartmentManagerAssignment. The list defaults to PENDING with an
 * optional status filter; accept creates an active allocation, reject does not.
 * Deallocation is a later workflow.
 */
@RestController
@RequestMapping("/department/project-proposals")
@DepartmentManagerOnly
@Tag(name = "Project Allocation Reviews", description = "Department Manager review of project "
    + "assignment proposals")
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class AssignmentProposalReviewController {

    private final AssignmentProposalReviewService reviewService;

    public AssignmentProposalReviewController(AssignmentProposalReviewService reviewService) {
        this.reviewService = reviewService;
    }

    @GetMapping
    public List<DepartmentProjectProposalResponse> list(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @RequestParam(name = "status", required = false) AssignmentProposalStatus status
    ) {
        return reviewService.listForManagedDepartment(authenticatedUser, status);
    }

    @PostMapping("/assignments/{proposalId}/accept")
    public AssignmentReviewResponse accept(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID proposalId
    ) {
        return reviewService.accept(authenticatedUser, proposalId);
    }

    @PostMapping("/assignments/{proposalId}/reject")
    public AssignmentReviewResponse reject(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID proposalId
    ) {
        return reviewService.reject(authenticatedUser, proposalId);
    }
}
