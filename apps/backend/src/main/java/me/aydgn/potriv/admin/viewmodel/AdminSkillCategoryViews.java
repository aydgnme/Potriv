package me.aydgn.potriv.admin.viewmodel;

import java.time.OffsetDateTime;
import java.util.UUID;

public final class AdminSkillCategoryViews {

    private AdminSkillCategoryViews() {
    }

    public record ListItem(
        UUID id,
        String name,
        String organizationName,
        boolean active,
        long skillCount,
        OffsetDateTime createdAt
    ) {
    }

    public record Details(
        UUID id,
        String name,
        UUID organizationId,
        String organizationName,
        boolean active,
        long skillCount,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {
    }
}
