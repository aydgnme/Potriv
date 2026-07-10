package me.aydgn.potriv.project.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import me.aydgn.potriv.project.entity.ProjectPeriod;
import me.aydgn.potriv.project.entity.ProjectStatus;

public record ProjectResponse(
    UUID projectId,
    ProjectManagerSummary projectManager,
    String name,
    ProjectPeriod period,
    LocalDate startDate,
    LocalDate deadlineDate,
    ProjectStatus status,
    String generalDescription,
    List<String> technologyStack,
    List<ProjectTeamRoleView> teamRoles,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {

}
