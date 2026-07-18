package me.aydgn.potriv.project.detailsview.dto;

import java.util.UUID;

public record ProjectDetailsTeamRoleSummary(
    UUID teamRoleId,
    String name,
    boolean active
) {

}
