package me.aydgn.potriv.identity.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import me.aydgn.potriv.common.config.OpenApiConfig;
import me.aydgn.potriv.common.security.annotation.OrganizationAdminOnly;
import me.aydgn.potriv.identity.dto.UpdateUserRolesRequest;
import me.aydgn.potriv.identity.dto.UserDetailResponse;
import me.aydgn.potriv.identity.dto.UserSummaryResponse;
import me.aydgn.potriv.identity.service.UserRoleManagementService;

@RestController
@RequestMapping("/users")
@OrganizationAdminOnly
@Tag(name = "User Management", description = "User listing, detail, and role management")
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class UserManagementController {

    private final UserRoleManagementService userRoleManagementService;

    public UserManagementController(UserRoleManagementService userRoleManagementService) {
        this.userRoleManagementService = userRoleManagementService;
    }

    @GetMapping
    public List<UserSummaryResponse> listUsers() {
        return userRoleManagementService.listUsers();
    }

    @GetMapping("/{userId}")
    public UserDetailResponse getUser(@PathVariable UUID userId) {
        return userRoleManagementService.getUser(userId);
    }

    @PatchMapping("/{userId}/roles")
    public UserDetailResponse updateUserRoles(
        @PathVariable UUID userId,
        @Valid @RequestBody UpdateUserRolesRequest request
    ) {
        return userRoleManagementService.updateUserRoles(userId, request);
    }
}
