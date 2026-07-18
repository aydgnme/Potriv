package me.aydgn.potriv.project.departmentview.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * One active allocation of a managed-department member on a project. Roles are
 * the approved assignment proposal role snapshot, not current membership data.
 */
public record DepartmentProjectTeamMemberResponse(
    UUID allocationId,
    UUID assignmentProposalId,
    DepartmentProjectUserSummary employee,
    int workHoursPerDay,
    List<DepartmentProjectRoleSummary> roles,
    OffsetDateTime allocatedAt
) {

}
