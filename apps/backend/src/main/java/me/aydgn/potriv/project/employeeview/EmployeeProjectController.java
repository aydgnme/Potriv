package me.aydgn.potriv.project.employeeview;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import me.aydgn.potriv.common.config.OpenApiConfig;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.annotation.EmployeeOnly;
import me.aydgn.potriv.project.employeeview.dto.EmployeeProjectsResponse;

/**
 * Self-service Project-07 view. Returns the authenticated user's assigned
 * projects split into current (active allocations) and past (deallocated
 * allocations) sections. Roles come from the approved assignment proposal role
 * snapshot; the technology stack comes from project technologies. Strictly
 * self-scoped — no user, employee, or organization parameters are accepted.
 */
@RestController
@RequestMapping("/me/projects")
@EmployeeOnly
@Tag(name = "Employee Projects", description = "The authenticated user's assigned projects")
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class EmployeeProjectController {

    private final EmployeeProjectService employeeProjectService;

    public EmployeeProjectController(EmployeeProjectService employeeProjectService) {
        this.employeeProjectService = employeeProjectService;
    }

    @GetMapping
    public EmployeeProjectsResponse getMyProjects(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser
    ) {
        return employeeProjectService.getMyProjects(authenticatedUser);
    }
}
