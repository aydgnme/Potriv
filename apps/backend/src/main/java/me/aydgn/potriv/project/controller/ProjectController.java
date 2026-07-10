package me.aydgn.potriv.project.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import me.aydgn.potriv.common.config.OpenApiConfig;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.annotation.ProjectManagerOnly;
import me.aydgn.potriv.project.dto.CreateProjectRequest;
import me.aydgn.potriv.project.dto.ProjectResponse;
import me.aydgn.potriv.project.dto.UpdateProjectRequest;
import me.aydgn.potriv.project.entity.ProjectStatus;
import me.aydgn.potriv.project.service.ProjectService;

@RestController
@RequestMapping("/projects")
@ProjectManagerOnly
@Tag(name = "Projects", description = "Project aggregate and lifecycle managed by a Project Manager")
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class ProjectController {

    private final ProjectService projectService;

    public ProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProjectResponse create(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @Valid @RequestBody CreateProjectRequest request
    ) {
        return projectService.create(authenticatedUser, request);
    }

    @GetMapping("/managed")
    public List<ProjectResponse> listManaged(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @RequestParam(name = "status", required = false) ProjectStatus status
    ) {
        return projectService.listManaged(authenticatedUser, status);
    }

    @GetMapping("/{projectId}")
    public ProjectResponse get(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID projectId
    ) {
        return projectService.get(authenticatedUser, projectId);
    }

    @PatchMapping("/{projectId}")
    public ProjectResponse update(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID projectId,
        @Valid @RequestBody UpdateProjectRequest request
    ) {
        return projectService.update(authenticatedUser, projectId, request);
    }

    @DeleteMapping("/{projectId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID projectId,
        @RequestParam(name = "confirmed", defaultValue = "false") boolean confirmed
    ) {
        projectService.delete(authenticatedUser, projectId, confirmed);
    }
}
