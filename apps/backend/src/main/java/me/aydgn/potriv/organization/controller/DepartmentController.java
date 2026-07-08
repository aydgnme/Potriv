package me.aydgn.potriv.organization.controller;

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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import me.aydgn.potriv.common.config.OpenApiConfig;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.annotation.OrganizationAdminOnly;
import me.aydgn.potriv.organization.dto.CreateDepartmentRequest;
import me.aydgn.potriv.organization.dto.DepartmentResponse;
import me.aydgn.potriv.organization.dto.UpdateDepartmentRequest;
import me.aydgn.potriv.organization.service.DepartmentService;

@RestController
@RequestMapping("/departments")
@Tag(name = "Departments", description = "Organization department management")
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class DepartmentController {

    private final DepartmentService departmentService;

    public DepartmentController(DepartmentService departmentService) {
        this.departmentService = departmentService;
    }

    @PostMapping
    @OrganizationAdminOnly
    @ResponseStatus(HttpStatus.CREATED)
    public DepartmentResponse create(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @Valid @RequestBody CreateDepartmentRequest request
    ) {
        return departmentService.create(authenticatedUser, request);
    }

    @GetMapping
    @OrganizationAdminOnly
    public List<DepartmentResponse> list(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser
    ) {
        return departmentService.list(authenticatedUser);
    }

    @GetMapping("/{departmentId}")
    @OrganizationAdminOnly
    public DepartmentResponse get(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID departmentId
    ) {
        return departmentService.get(authenticatedUser, departmentId);
    }

    @PatchMapping("/{departmentId}")
    @OrganizationAdminOnly
    public DepartmentResponse update(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID departmentId,
        @Valid @RequestBody UpdateDepartmentRequest request
    ) {
        return departmentService.update(authenticatedUser, departmentId, request);
    }

    @DeleteMapping("/{departmentId}")
    @OrganizationAdminOnly
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID departmentId
    ) {
        departmentService.delete(authenticatedUser, departmentId);
    }
}
