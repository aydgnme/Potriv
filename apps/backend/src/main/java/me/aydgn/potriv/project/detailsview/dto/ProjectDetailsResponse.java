package me.aydgn.potriv.project.detailsview.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import me.aydgn.potriv.project.entity.ProjectPeriod;
import me.aydgn.potriv.project.entity.ProjectStatus;

/**
 * Project-09 detail page payload: project metadata, description, technology
 * stack, role requirements, and the active/past team. Intentionally excludes
 * status history, proposal queues, and other audit data.
 */
public record ProjectDetailsResponse(
    UUID projectId,
    String projectName,
    ProjectStatus projectStatus,
    ProjectPeriod projectPeriod,
    LocalDate startDate,
    LocalDate deadlineDate,
    String generalDescription,
    ProjectDetailsUserSummary projectManager,
    List<ProjectDetailsTechnologyResponse> technologyStack,
    List<ProjectDetailsTeamRoleRequirementResponse> teamRoleRequirements,
    List<ProjectDetailsActiveMemberResponse> activeMembers,
    List<ProjectDetailsPastMemberResponse> pastMembers,
    OffsetDateTime generatedAt
) {

}
