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
import me.aydgn.potriv.allocation.dto.CreateDeallocationProposalRequest;
import me.aydgn.potriv.allocation.dto.DeallocationProposalResponse;
import me.aydgn.potriv.allocation.service.DeallocationProposalService;
import me.aydgn.potriv.common.config.OpenApiConfig;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.annotation.ProjectManagerOnly;

@RestController
@RequestMapping("/projects/{projectId}/allocations/{allocationId}/deallocation-proposals")
@ProjectManagerOnly
@Tag(
    name = "Project Allocations",
    description = "The owning Project Manager proposes ending an active allocation. The "
        + "allocation must be active, a reason is required, the review department is captured "
        + "from the employee's current membership, and at most one pending deallocation "
        + "proposal per active allocation is allowed."
)
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class DeallocationProposalController {

    private final DeallocationProposalService deallocationProposalService;

    public DeallocationProposalController(DeallocationProposalService deallocationProposalService) {
        this.deallocationProposalService = deallocationProposalService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DeallocationProposalResponse create(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID projectId,
        @PathVariable UUID allocationId,
        @Valid @RequestBody CreateDeallocationProposalRequest request
    ) {
        return deallocationProposalService.create(
            authenticatedUser, projectId, allocationId, request);
    }
}
