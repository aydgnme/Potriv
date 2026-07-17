package me.aydgn.potriv.project.employeeview.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import me.aydgn.potriv.project.entity.ProjectPeriod;
import me.aydgn.potriv.project.entity.ProjectStatus;

/**
 * One allocation episode of the authenticated user. Episodes are intentionally
 * not collapsed per project: a user deallocated and later reassigned to the
 * same project appears once per episode, with the roles and hours of that
 * episode. {@code deallocatedAt} is null for current projects and set for past
 * ones.
 */
public record EmployeeProjectItemResponse(
    UUID projectId,
    String projectName,
    ProjectStatus projectStatus,
    ProjectPeriod projectPeriod,
    LocalDate startDate,
    LocalDate deadlineDate,
    UUID allocationId,
    int workHoursPerDay,
    List<EmployeeProjectRoleSummary> roles,
    List<EmployeeProjectTechnologySummary> technologyStack,
    OffsetDateTime allocatedAt,
    OffsetDateTime deallocatedAt
) {

}
