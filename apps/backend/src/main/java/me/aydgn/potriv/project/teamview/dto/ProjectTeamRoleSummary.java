package me.aydgn.potriv.project.teamview.dto;

import java.util.UUID;

public record ProjectTeamRoleSummary(
    UUID teamRoleId,
    String name,
    boolean active
) {

}
