package me.aydgn.potriv.project.teamview.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * A deallocated allocation shown as a past team member. The deallocation
 * proposal fields are nullable: a deallocated allocation without an approved
 * deallocation proposal (maintenance/imported data) must still render.
 */
public record ProjectPastMemberResponse(
    UUID allocationId,
    UUID assignmentProposalId,
    ProjectTeamUserSummary employee,
    ProjectTeamDepartmentSummary reviewDepartment,
    int workHoursPerDay,
    List<ProjectTeamRoleSummary> roles,
    OffsetDateTime allocatedAt,
    OffsetDateTime deallocatedAt,
    UUID deallocationProposalId,
    String deallocationReason,
    ProjectTeamUserSummary deallocationProposedBy,
    ProjectTeamUserSummary deallocationApprovedBy,
    OffsetDateTime deallocationApprovedAt
) {

}
