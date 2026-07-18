package me.aydgn.potriv.project.detailsview;

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
import me.aydgn.potriv.project.detailsview.dto.ProjectDetailsResponse;

/**
 * Project-09 detail page. Returns detailed project information for users with
 * a legitimate project relationship: the owning Project Manager, an assigned
 * current/past employee, or an involved Department Manager. The relationship
 * check happens in the service — unrelated users receive an anti-leak 404.
 */
@RestController
@RequestMapping("/projects/{projectId}/details")
@EmployeeOnly
@Tag(name = "Project Details", description = "Read-only single-project detail view")
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class ProjectDetailsController {

    private final ProjectDetailsService projectDetailsService;

    public ProjectDetailsController(ProjectDetailsService projectDetailsService) {
        this.projectDetailsService = projectDetailsService;
    }

    @GetMapping
    public ProjectDetailsResponse getProjectDetails(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID projectId
    ) {
        return projectDetailsService.getProjectDetails(authenticatedUser, projectId);
    }
}
