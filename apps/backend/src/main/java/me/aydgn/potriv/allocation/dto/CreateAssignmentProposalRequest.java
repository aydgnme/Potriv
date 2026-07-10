package me.aydgn.potriv.allocation.dto;

import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateAssignmentProposalRequest(
    @NotNull UUID employeeId,

    @Min(1) int workHoursPerDay,

    @NotEmpty List<@NotNull UUID> teamRoleIds,

    @Size(max = 5000) String comments
) {

}
