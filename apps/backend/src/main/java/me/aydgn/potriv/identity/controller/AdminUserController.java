package me.aydgn.potriv.identity.controller;

import java.util.UUID;

import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import me.aydgn.potriv.common.config.OpenApiConfig;
import me.aydgn.potriv.common.security.annotation.SystemAdminOnly;
import me.aydgn.potriv.identity.dto.UpdateUserStatusRequest;
import me.aydgn.potriv.identity.dto.UserStatusResponse;
import me.aydgn.potriv.identity.service.UserAccountStatusService;

@RestController
@RequestMapping("/admin/users")
@SystemAdminOnly
@Tag(name = "System Administration", description = "Platform-level user administration")
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class AdminUserController {

    private final UserAccountStatusService userAccountStatusService;

    public AdminUserController(UserAccountStatusService userAccountStatusService) {
        this.userAccountStatusService = userAccountStatusService;
    }

    @PatchMapping("/{userId}/status")
    public UserStatusResponse updateUserStatus(
        @PathVariable UUID userId,
        @Valid @RequestBody UpdateUserStatusRequest request
    ) {
        return userAccountStatusService.changeStatus(userId, request.status());
    }
}
