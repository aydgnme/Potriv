package me.aydgn.potriv.organization.controller;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import me.aydgn.potriv.common.config.OpenApiConfig;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.annotation.OrganizationAdminOnly;
import me.aydgn.potriv.organization.dto.AssignDepartmentManagerRequest;
import me.aydgn.potriv.organization.dto.DepartmentResponse;
import me.aydgn.potriv.organization.service.DepartmentManagerAssignmentService;

@RestController
@RequestMapping("/departments/{departmentId}/manager")
@OrganizationAdminOnly
@Tag(name = "Departments", description = "Organization department management")
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class DepartmentManagerController {

    private final DepartmentManagerAssignmentService assignmentService;

    public DepartmentManagerController(DepartmentManagerAssignmentService assignmentService) {
        this.assignmentService = assignmentService;
    }

    @PutMapping
    public DepartmentResponse assignManager(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID departmentId,
        @Valid @RequestBody AssignDepartmentManagerRequest request
    ) {
        return assignmentService.assignManager(authenticatedUser, departmentId, request.userId());
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unassignManager(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID departmentId
    ) {
        assignmentService.unassignManager(authenticatedUser, departmentId);
    }
}
