package me.aydgn.potriv.admin.viewmodel;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * User read models for the admin UI. The password hash and any tokens are never
 * included. Account-operations metadata (status, failed-login count, lock state)
 * is exposed on the detail view so an admin can safely run account actions.
 */
public final class AdminUserViews {

    private AdminUserViews() {
    }

    public record ListItem(
        UUID id,
        String name,
        String email,
        String organizationName,
        List<String> roles,
        String status,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {
    }

    public record Details(
        UUID id,
        String name,
        String email,
        String organizationName,
        UUID organizationId,
        List<String> roles,
        String status,
        boolean platformUser,
        boolean systemAdmin,
        int failedLoginAttempts,
        OffsetDateTime lockedUntil,
        boolean loginLocked,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {
    }
}
