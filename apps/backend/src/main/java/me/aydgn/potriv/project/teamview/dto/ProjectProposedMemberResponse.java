package me.aydgn.potriv.project.teamview.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** A pending assignment proposal shown as a proposed team member. */
public record ProjectProposedMemberResponse(
    UUID proposalId,
    ProjectTeamUserSummary employee,
    ProjectTeamDepartmentSummary reviewDepartment,
    int workHoursPerDay,
    List<ProjectTeamRoleSummary> roles,
    String comments,
    ProjectTeamUserSummary proposedBy,
    OffsetDateTime proposedAt
) {

}
