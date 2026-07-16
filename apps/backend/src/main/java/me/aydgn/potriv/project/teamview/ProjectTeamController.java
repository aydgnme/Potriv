package me.aydgn.potriv.project.teamview;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import me.aydgn.potriv.common.config.OpenApiConfig;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.annotation.EmployeeOnly;
import me.aydgn.potriv.project.teamview.dto.ProjectTeamResponse;

/**
 * Returns proposed, active, and past project team members. Visible to the
 * owning Project Manager, an involved Department Manager, and employees
 * assigned to the project even after deallocation. Proposed members are pending
 * assignment proposals; active members are active allocations; past members are
 * deallocated allocations. The relationship check happens in the service —
 * unrelated users receive an anti-leak 404.
 */
@RestController
@RequestMapping("/projects/{projectId}/team")
@EmployeeOnly
@Tag(name = "Project Teams", description = "Read-only project team view")
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class ProjectTeamController {

    private final ProjectTeamService projectTeamService;

    public ProjectTeamController(ProjectTeamService projectTeamService) {
        this.projectTeamService = projectTeamService;
    }

    @GetMapping
    public ProjectTeamResponse getProjectTeam(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID projectId
    ) {
        return projectTeamService.getProjectTeam(authenticatedUser, projectId);
    }
}
