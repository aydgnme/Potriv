package me.aydgn.potriv.project.detailsview.dto;

import java.util.UUID;

public record ProjectDetailsTeamRoleRequirementResponse(
    UUID requirementId,
    ProjectDetailsTeamRoleSummary teamRole,
    int requiredMembers
) {

}
