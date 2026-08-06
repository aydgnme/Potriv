package me.aydgn.potriv.admin.viewmodel;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

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

    /**
     * Raw allocation filter inputs, echoed back into the filter form so a
     * submitted value survives paging. Parsing is lenient: a mistyped id or date
     * is dropped and the remaining filters still apply.
     */
    public record Filter(
        String q,
        String status,
        String organizationId,
        String projectId,
        String employeeId,
        String departmentId,
        String from,
        String to
    ) {

        public static final Filter EMPTY =
            new Filter(null, null, null, null, null, null, null, null);

        public boolean active() {
            return Stream.of(q, status, organizationId, projectId, employeeId, departmentId,
                    from, to)
                .anyMatch(value -> value != null && !value.isBlank());
        }
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
        String organizationName,
        UUID organizationId,
        UUID departmentId,
        UUID assignmentProposalId,
        String proposalStatus,
        String proposedByName,
        UUID proposedById,
        String reviewedByName,
        UUID reviewedById,
        OffsetDateTime reviewedAt,
        OffsetDateTime allocatedAt,
        OffsetDateTime deallocatedAt,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {
    }
}
