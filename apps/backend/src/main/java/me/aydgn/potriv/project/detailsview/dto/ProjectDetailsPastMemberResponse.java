package me.aydgn.potriv.project.detailsview.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * One deallocated allocation episode on the project. Membership details only —
 * the deallocation reason stays on the Project Team View, keeping this detail
 * page free of audit data.
 */
public record ProjectDetailsPastMemberResponse(
    UUID allocationId,
    UUID assignmentProposalId,
    ProjectDetailsUserSummary employee,
    ProjectDetailsDepartmentSummary reviewDepartment,
    int workHoursPerDay,
    List<ProjectDetailsTeamRoleSummary> roles,
    OffsetDateTime allocatedAt,
    OffsetDateTime deallocatedAt
) {

}
