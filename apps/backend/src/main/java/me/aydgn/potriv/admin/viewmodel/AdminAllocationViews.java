package me.aydgn.potriv.admin.viewmodel;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class AdminAllocationViews {

    private AdminAllocationViews() {
    }

    public record ListItem(
        UUID id,
        String employeeName,
        String projectName,
        String reviewDepartmentName,
        int workHoursPerDay,
        String status,
        OffsetDateTime allocatedAt,
        OffsetDateTime deallocatedAt
    ) {
    }

    public record Details(
        UUID id,
        String employeeName,
        UUID employeeId,
        String projectName,
        UUID projectId,
        String reviewDepartmentName,
        int workHoursPerDay,
        List<String> roles,
        String status,
        UUID assignmentProposalId,
        OffsetDateTime allocatedAt,
        OffsetDateTime deallocatedAt,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {
    }
}
