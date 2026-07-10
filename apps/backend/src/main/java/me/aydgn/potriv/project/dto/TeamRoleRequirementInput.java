package me.aydgn.potriv.project.dto;

import java.util.UUID;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record TeamRoleRequirementInput(
    @NotNull UUID teamRoleId,
    @Min(1) int requiredMembers
) {

}
