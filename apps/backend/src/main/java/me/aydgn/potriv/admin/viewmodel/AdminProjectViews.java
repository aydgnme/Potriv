package me.aydgn.potriv.admin.viewmodel;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class AdminProjectViews {

    private AdminProjectViews() {
    }

    public record ListItem(
        UUID id,
        String name,
        String status,
        String period,
        String projectManagerName,
        long technologyCount,
        long activeAllocationCount,
        LocalDate deadlineDate,
        OffsetDateTime updatedAt
    ) {
    }

    public record Details(
        UUID id,
        String name,
        String status,
        String period,
        LocalDate startDate,
        LocalDate deadlineDate,
        String generalDescription,
        String projectManagerName,
        UUID projectManagerId,
        String organizationName,
        List<String> technologyStack,
        List<RoleRequirement> teamRoleRequirements,
        List<Member> activeMembers,
        List<Member> pastMembers,
        long pendingAssignmentProposals,
        long pendingDeallocationProposals,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {

        public record RoleRequirement(String roleName, int requiredMembers, boolean active) {
        }

        public record Member(
            UUID allocationId,
            String employeeName,
            String reviewDepartmentName,
            int workHoursPerDay,
            OffsetDateTime allocatedAt,
            OffsetDateTime deallocatedAt
        ) {
        }
    }
}
