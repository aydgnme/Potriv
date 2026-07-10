package me.aydgn.potriv.project.dto;

import java.time.LocalDate;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import me.aydgn.potriv.project.entity.ProjectPeriod;
import me.aydgn.potriv.project.entity.ProjectStatus;

public record CreateProjectRequest(
    @NotBlank
    @Size(max = 200)
    String name,

    @NotNull ProjectPeriod period,

    @NotNull LocalDate startDate,

    LocalDate deadlineDate,

    @NotNull ProjectStatus status,

    @Size(max = 10000)
    String generalDescription,

    List<@NotBlank @Size(max = 160) String> technologyStack,

    @Valid List<TeamRoleRequirementInput> teamRoles
) {

}
