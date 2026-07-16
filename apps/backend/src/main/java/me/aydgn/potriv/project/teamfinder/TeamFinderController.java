package me.aydgn.potriv.project.teamfinder;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import me.aydgn.potriv.common.config.OpenApiConfig;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.annotation.ProjectManagerOnly;

/**
 * Deterministic Team Finder for the owning Project Manager. Default criteria
 * return only fully available matching employees; the flags expand the pool
 * with partially available, close-to-finish, or unavailable employees.
 * Candidates must match by skill or past project similarity; the score is
 * deterministic, no AI is involved, and the endpoint persists nothing and
 * creates no assignment proposal.
 */
@RestController
@RequestMapping("/projects/{projectId}/team-finder")
@ProjectManagerOnly
@Tag(name = "Team Finder", description = "Deterministic candidate discovery for a managed project")
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class TeamFinderController {

    private final TeamFinderService teamFinderService;

    public TeamFinderController(TeamFinderService teamFinderService) {
        this.teamFinderService = teamFinderService;
    }

    @PostMapping
    public TeamFinderResponse find(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID projectId,
        @RequestBody(required = false) TeamFinderRequest request
    ) {
        return teamFinderService.find(authenticatedUser, projectId, request);
    }
}
