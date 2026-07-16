package me.aydgn.potriv.project.teamview.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import me.aydgn.potriv.project.entity.ProjectPeriod;
import me.aydgn.potriv.project.entity.ProjectStatus;

public record ProjectTeamResponse(
    UUID projectId,
    String projectName,
    ProjectStatus projectStatus,
    ProjectPeriod projectPeriod,
    LocalDate startDate,
    LocalDate deadlineDate,
    List<ProjectProposedMemberResponse> proposedMembers,
    List<ProjectActiveMemberResponse> activeMembers,
    List<ProjectPastMemberResponse> pastMembers,
    OffsetDateTime generatedAt
) {

}
