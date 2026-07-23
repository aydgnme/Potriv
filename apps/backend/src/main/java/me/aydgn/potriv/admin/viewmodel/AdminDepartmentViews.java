package me.aydgn.potriv.admin.viewmodel;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class AdminDepartmentViews {

    private AdminDepartmentViews() {
    }

    public record ListItem(
        UUID id,
        String name,
        String organizationName,
        String managerName,
        long membersCount,
        OffsetDateTime createdAt
    ) {
    }

    public record Details(
        UUID id,
        String name,
        String organizationName,
        UUID organizationId,
        String managerName,
        UUID managerId,
        long membersCount,
        List<MemberSummary> members,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {

        public record MemberSummary(UUID id, String name, String email) {
        }
    }
}
