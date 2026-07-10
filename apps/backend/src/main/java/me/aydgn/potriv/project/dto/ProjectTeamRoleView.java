package me.aydgn.potriv.project.dto;

import java.util.UUID;

public record ProjectTeamRoleView(
    UUID requirementId,
    UUID teamRoleId,
    String name,
    boolean active,
    int requiredMembers
) {

}
