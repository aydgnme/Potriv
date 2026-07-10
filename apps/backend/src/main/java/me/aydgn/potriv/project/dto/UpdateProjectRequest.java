package me.aydgn.potriv.project.dto;

import java.time.LocalDate;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import me.aydgn.potriv.project.entity.ProjectPeriod;
import me.aydgn.potriv.project.entity.ProjectStatus;

/**
 * Partial update. A {@code null} scalar field means "leave unchanged". A
 * {@code null} list means "leave unchanged"; a present empty list clears the
 * collection.
 */
public record UpdateProjectRequest(
    @Size(max = 200)
    String name,

    ProjectPeriod period,

    LocalDate startDate,

    LocalDate deadlineDate,

    ProjectStatus status,

    @Size(max = 10000)
    String generalDescription,

    List<@Size(max = 160) String> technologyStack,

    @Valid List<TeamRoleRequirementInput> teamRoles
) {

}
