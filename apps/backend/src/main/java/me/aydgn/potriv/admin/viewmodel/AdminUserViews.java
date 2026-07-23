package me.aydgn.potriv.admin.viewmodel;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * User read models for the admin UI. Security-sensitive fields (password hash,
 * failed-login counters, lock timestamps, tokens) are never included.
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
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {
    }
}
