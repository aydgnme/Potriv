package me.aydgn.potriv.project.departmentview.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import me.aydgn.potriv.project.entity.ProjectPeriod;
import me.aydgn.potriv.project.entity.ProjectStatus;

/**
 * One project in the department portfolio. {@code teamMembers} holds only the
 * managed department's active allocations, never the full cross-department
 * team. Project description and other Project-09 details are intentionally
 * excluded.
 */
public record DepartmentProjectSummaryResponse(
    UUID projectId,
    String projectName,
    ProjectStatus status,
    ProjectPeriod period,
    LocalDate startDate,
    LocalDate deadlineDate,
    List<DepartmentProjectTeamMemberResponse> teamMembers
) {

}
