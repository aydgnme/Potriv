package me.aydgn.potriv.project.teamview.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** An active allocation shown as a current team member. */
public record ProjectActiveMemberResponse(
    UUID allocationId,
    UUID assignmentProposalId,
    ProjectTeamUserSummary employee,
    ProjectTeamDepartmentSummary reviewDepartment,
    int workHoursPerDay,
    List<ProjectTeamRoleSummary> roles,
    OffsetDateTime allocatedAt,
    ProjectTeamUserSummary proposedBy,
    ProjectTeamUserSummary approvedBy,
    OffsetDateTime approvedAt
) {

}
