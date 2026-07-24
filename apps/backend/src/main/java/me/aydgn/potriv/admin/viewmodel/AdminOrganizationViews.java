package me.aydgn.potriv.admin.viewmodel;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class AdminOrganizationViews {

    private AdminOrganizationViews() {
    }

    public record ListItem(
        UUID id,
        String name,
        long usersCount,
        long departmentsCount,
        long projectsCount,
        OffsetDateTime createdAt
    ) {
    }

    public record Details(
        UUID id,
        String name,
        String headquarterAddress,
        long usersCount,
        long departmentsCount,
        long projectsCount,
        List<DepartmentSummary> departments,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {

        public record DepartmentSummary(UUID id, String name, long memberCount) {
        }
    }
}
