package me.aydgn.potriv.admin.viewmodel;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class AdminSkillViews {

    private AdminSkillViews() {
    }

    public record ListItem(
        UUID id,
        String name,
        String categoryName,
        String organizationName,
        String authorName,
        boolean active,
        long linkedDepartments,
        OffsetDateTime createdAt
    ) {
    }

    public record Details(
        UUID id,
        String name,
        UUID organizationId,
        String organizationName,
        UUID categoryId,
        String categoryName,
        String description,
        UUID authorId,
        String authorName,
        boolean active,
        List<DepartmentRef> departments,
        long employeeAssignments,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {

        public record DepartmentRef(UUID id, String name) {
        }
    }
}
