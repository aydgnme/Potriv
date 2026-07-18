package me.aydgn.potriv.project.departmentview;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import me.aydgn.potriv.common.config.OpenApiConfig;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.annotation.DepartmentManagerOnly;
import me.aydgn.potriv.project.departmentview.dto.DepartmentProjectsResponse;
import me.aydgn.potriv.project.entity.ProjectStatus;

/**
 * Project-08 department portfolio view. Returns projects where the
 * authenticated Department Manager's managed department has active assigned
 * members, with an optional project status filter. The managed department is
 * always derived from the authenticated user — no department, manager, or
 * organization parameters are accepted.
 */
@RestController
@RequestMapping("/department/projects")
@DepartmentManagerOnly
@Tag(name = "Department Projects",
    description = "Projects with active members from the managed department")
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class DepartmentProjectsController {

    private final DepartmentProjectsService departmentProjectsService;

    public DepartmentProjectsController(DepartmentProjectsService departmentProjectsService) {
        this.departmentProjectsService = departmentProjectsService;
    }

    @GetMapping
    public DepartmentProjectsResponse getDepartmentProjects(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @Parameter(description = "Optional project status filter")
        @RequestParam(required = false) ProjectStatus status
    ) {
        return departmentProjectsService.getDepartmentProjects(authenticatedUser, status);
    }
}
