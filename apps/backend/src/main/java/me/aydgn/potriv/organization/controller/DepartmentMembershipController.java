package me.aydgn.potriv.organization.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import me.aydgn.potriv.common.config.OpenApiConfig;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.annotation.DepartmentManagerOnly;
import me.aydgn.potriv.organization.dto.DepartmentUserResponse;
import me.aydgn.potriv.organization.service.DepartmentMembershipService;

/**
 * Manager-scoped department membership flow. The authenticated user must be the
 * assigned manager of the exact target department; holding the DEPARTMENT_MANAGER
 * access role alone is not sufficient.
 */
@RestController
@RequestMapping("/departments")
@DepartmentManagerOnly
@Tag(name = "Departments", description = "Organization department management")
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class DepartmentMembershipController {

    private final DepartmentMembershipService membershipService;

    public DepartmentMembershipController(DepartmentMembershipService membershipService) {
        this.membershipService = membershipService;
    }

    @GetMapping("/unassigned-employees")
    public List<DepartmentUserResponse> listUnassignedEmployees(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser
    ) {
        return membershipService.listUnassignedEmployees(authenticatedUser);
    }

    @GetMapping("/{departmentId}/members")
    public List<DepartmentUserResponse> listMembers(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID departmentId
    ) {
        return membershipService.listMembers(authenticatedUser, departmentId);
    }

    @PostMapping("/{departmentId}/members/{userId}")
    public DepartmentUserResponse addMember(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID departmentId,
        @PathVariable UUID userId
    ) {
        return membershipService.addMember(authenticatedUser, departmentId, userId);
    }

    @DeleteMapping("/{departmentId}/members/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeMember(
        @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
        @PathVariable UUID departmentId,
        @PathVariable UUID userId
    ) {
        membershipService.removeMember(authenticatedUser, departmentId, userId);
    }
}
