package me.aydgn.potriv.common.security;

import java.util.List;
import java.util.UUID;

import me.aydgn.potriv.identity.entity.AccessRole;

public record AuthenticatedUser(
    UUID userId,
    UUID organizationId,
    String email,
    List<AccessRole> roles
) {
    public boolean hasRole(AccessRole role) {
        return roles.contains(role);
    }

    public boolean isSystemAdmin() {
        return hasRole(AccessRole.SYSTEM_ADMIN);
    }
}
