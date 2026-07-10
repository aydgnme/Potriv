package me.aydgn.potriv.allocation.controller;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import me.aydgn.potriv.allocation.dto.AssignmentProposalResponse;
import me.aydgn.potriv.allocation.dto.CreateAssignmentProposalRequest;
import me.aydgn.potriv.allocation.service.AssignmentProposalService;
import me.aydgn.potriv.common.config.OpenApiConfig;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.annotation.ProjectManagerOnly;

@RestController
@RequestMapping("/projects/{projectId}/assignment-proposals")
@ProjectManagerOnly
@Tag(
    name = "Project Allocations",
    description = "The owning Project Manager proposes an employee for a project. Proposals start "
        + "PENDING; the employee must have a department membership; workHoursPerDay must fit the "
        + "employee's current capacity; at most one pending proposal per project + employee; the "
        + "selected team roles are a proposal-time snapshot. Department Manager confirmation is a "
        + "later workflow."
)
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class AssignmentProposalController {

    private final AssignmentProposalService assignmentProposalService;

    public AssignmentProposalController(AssignmentProposalService assignmentProposalService) {
        this.assignmentProposalService = assignmentProposalService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AssignmentProposalResponse create(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID projectId,
        @Valid @RequestBody CreateAssignmentProposalRequest request
    ) {
        return assignmentProposalService.create(authenticatedUser, projectId, request);
    }
}
