package me.aydgn.potriv.common.security;

import java.util.List;
import java.util.UUID;

import me.aydgn.potriv.identity.entity.AccessRole;

public record AuthenticatedUser(
    UUID userId,
    UUID sessionId,
    UUID organizationId,
    String email,
    List<AccessRole> roles
) {
    public boolean hasRole(AccessRole role) {
        return roles.contains(role);
    }

    public boolean hasAnyRole(AccessRole... requiredRoles) {
        for (AccessRole requiredRole : requiredRoles) {
            if (roles.contains(requiredRole)) {
                return true;
            }
        }
        return false;
    }

    public boolean isSystemAdmin() {
        return hasRole(AccessRole.SYSTEM_ADMIN);
    }

    public boolean belongsToOrganization(UUID targetOrganizationId) {
        if (isSystemAdmin()) {
            return true;
        }
        
        return organizationId != null && organizationId.equals(targetOrganizationId);
    }
}
