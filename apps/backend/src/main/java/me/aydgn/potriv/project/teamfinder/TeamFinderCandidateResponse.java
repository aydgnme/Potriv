package me.aydgn.potriv.project.teamfinder;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import me.aydgn.potriv.skill.dto.EmployeeSkillResponse.ExperienceView;
import me.aydgn.potriv.skill.dto.EmployeeSkillResponse.LevelView;

/**
 * One ranked Team Finder candidate. Only safe summaries are exposed — never
 * password, account-status, session or token internals.
 */
public record TeamFinderCandidateResponse(
    EmployeeSummary employee,
    DepartmentSummary department,
    AvailabilityView availability,
    List<SkillMatchView> skillMatches,
    List<PastProjectMatchView> pastProjectMatches,
    TeamFinderScore score
) {

    public record EmployeeSummary(UUID userId, String name, String email) {
    }

    public record DepartmentSummary(UUID departmentId, String name) {
    }

    public record AvailabilityView(
        int allocatedHours,
        int availableHours,
        int activeAllocationCount,
        boolean fullyAvailable,
        boolean partiallyAvailable,
        boolean unavailable,
        boolean closeToFinish,
        List<CloseToFinishProjectView> closeToFinishProjects
    ) {
    }

    public record CloseToFinishProjectView(
        UUID projectId,
        String projectName,
        LocalDate deadlineDate,
        int workHoursPerDay
    ) {
    }

    public record SkillMatchView(
        String technologyName,
        UUID skillId,
        String skillName,
        String categoryName,
        LevelView level,
        ExperienceView experience
    ) {
    }

    public record PastProjectMatchView(
        UUID projectId,
        String projectName,
        List<String> matchedTechnologies,
        List<String> matchedTeamRoles,
        OffsetDateTime deallocatedAt
    ) {
    }
}
