package me.aydgn.potriv.project.detailsview.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * One active allocation on the project. Roles are the approved assignment
 * proposal role snapshot; the review department is the proposal-time snapshot,
 * not the employee's current department membership.
 */
public record ProjectDetailsActiveMemberResponse(
    UUID allocationId,
    UUID assignmentProposalId,
    ProjectDetailsUserSummary employee,
    ProjectDetailsDepartmentSummary reviewDepartment,
    int workHoursPerDay,
    List<ProjectDetailsTeamRoleSummary> roles,
    OffsetDateTime allocatedAt
) {

}
