package me.aydgn.potriv.common.security;

import java.util.UUID;

import org.springframework.stereotype.Component;

import me.aydgn.potriv.common.exception.BadRequestException;

/**
 * Resolves the current organization scope from the authenticated principal.
 * A platform user (for example a SYSTEM_ADMIN with {@code organizationId == null})
 * has no current organization and receives a controlled error rather than
 * accidental cross-tenant access.
 */
@Component
public class CurrentOrganizationResolver {

    public UUID requireOrganizationId(AuthenticatedUser currentUser) {
        if (currentUser.organizationId() == null) {
            throw new BadRequestException(
                "Authenticated user does not belong to an organization."
            );
        }

        return currentUser.organizationId();
    }
}
