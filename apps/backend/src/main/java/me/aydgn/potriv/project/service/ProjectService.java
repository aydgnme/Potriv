package me.aydgn.potriv.project.service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.exception.ConflictException;
import me.aydgn.potriv.common.exception.ForbiddenException;
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.CurrentOrganizationResolver;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.entity.TeamRole;
import me.aydgn.potriv.organization.repository.OrganizationRepository;
import me.aydgn.potriv.organization.repository.TeamRoleRepository;
import me.aydgn.potriv.project.dto.CreateProjectRequest;
import me.aydgn.potriv.project.dto.ProjectManagerSummary;
import me.aydgn.potriv.project.dto.ProjectResponse;
import me.aydgn.potriv.project.dto.ProjectTeamRoleView;
import me.aydgn.potriv.project.dto.TeamRoleRequirementInput;
import me.aydgn.potriv.project.dto.UpdateProjectRequest;
import me.aydgn.potriv.project.entity.Project;
import me.aydgn.potriv.project.entity.ProjectPeriod;
import me.aydgn.potriv.project.entity.ProjectStatus;
import me.aydgn.potriv.project.entity.ProjectStatusHistory;
import me.aydgn.potriv.project.entity.ProjectTeamRoleRequirement;
import me.aydgn.potriv.project.entity.ProjectTechnology;
import me.aydgn.potriv.project.repository.ProjectRepository;
import me.aydgn.potriv.project.repository.ProjectStatusHistoryRepository;
import me.aydgn.potriv.project.repository.ProjectTeamRoleRequirementRepository;
import me.aydgn.potriv.project.repository.ProjectTechnologyRepository;

@Service
public class ProjectService {

    private static final Set<ProjectStatus> DELETION_BLOCKING_STATUSES = Set.of(
        ProjectStatus.IN_PROGRESS, ProjectStatus.CLOSING, ProjectStatus.CLOSED);

    private final ProjectRepository projectRepository;
    private final ProjectTechnologyRepository technologyRepository;
    private final ProjectTeamRoleRequirementRepository requirementRepository;
    private final ProjectStatusHistoryRepository statusHistoryRepository;
    private final TeamRoleRepository teamRoleRepository;
    private final OrganizationRepository organizationRepository;
    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final CurrentOrganizationResolver currentOrganizationResolver;
    private final List<ProjectDeletionContributor> deletionContributors;
    private final List<ProjectStatusChangeGuard> statusChangeGuards;

    public ProjectService(
        ProjectRepository projectRepository,
        ProjectTechnologyRepository technologyRepository,
        ProjectTeamRoleRequirementRepository requirementRepository,
        ProjectStatusHistoryRepository statusHistoryRepository,
        TeamRoleRepository teamRoleRepository,
        OrganizationRepository organizationRepository,
        UserRepository userRepository,
        UserRoleRepository userRoleRepository,
        CurrentOrganizationResolver currentOrganizationResolver,
        List<ProjectDeletionContributor> deletionContributors,
        List<ProjectStatusChangeGuard> statusChangeGuards
    ) {
        this.projectRepository = projectRepository;
        this.technologyRepository = technologyRepository;
        this.requirementRepository = requirementRepository;
        this.statusHistoryRepository = statusHistoryRepository;
        this.teamRoleRepository = teamRoleRepository;
        this.organizationRepository = organizationRepository;
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.currentOrganizationResolver = currentOrganizationResolver;
        this.deletionContributors = deletionContributors;
        this.statusChangeGuards = statusChangeGuards;
    }

    @Transactional
    public ProjectResponse create(AuthenticatedUser currentUser, CreateProjectRequest request) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);

        User projectManager = userRepository.findById(currentUser.userId())
            .orElseThrow(() -> new NotFoundException("Authenticated user was not found."));
        if (!userRoleRepository.existsByUserAndRole(projectManager, AccessRole.PROJECT_MANAGER)) {
            throw new ForbiddenException("Only a project manager can create projects.");
        }

        String name = request.name().trim();
        if (name.isEmpty()) {
            throw new BadRequestException("name must not be blank.");
        }

        validateSchedule(request.period(), request.startDate(), request.deadlineDate());

        if (request.status() != ProjectStatus.NOT_STARTED
            && request.status() != ProjectStatus.STARTING) {
            throw new BadRequestException(
                "A new project can only be created with status NOT_STARTED or STARTING.");
        }

        Organization organization = organizationRepository.findById(organizationId)
            .orElseThrow(() -> new NotFoundException("Organization was not found."));

        Project project = projectRepository.save(new Project(
            organization,
            projectManager,
            name,
            request.period(),
            request.startDate(),
            request.deadlineDate(),
            request.status(),
            trimToNull(request.generalDescription())));

        persistTechnologies(project, buildTechnologies(project, request.technologyStack()));
        persistRequirements(project,
            buildRequirements(project, organizationId, request.teamRoles(), Set.of()));

        statusHistoryRepository.save(
            new ProjectStatusHistory(project, null, project.getStatus(), projectManager));

        return toResponse(project);
    }

    @Transactional(readOnly = true)
    public List<ProjectResponse> listManaged(AuthenticatedUser currentUser, ProjectStatus status) {
        currentOrganizationResolver.requireOrganizationId(currentUser);

        List<Project> projects = status == null
            ? projectRepository.findByProjectManager_IdOrderByCreatedAtDesc(currentUser.userId())
            : projectRepository.findByProjectManager_IdAndStatusOrderByCreatedAtDesc(
                currentUser.userId(), status);

        return toResponses(projects);
    }

    @Transactional(readOnly = true)
    public ProjectResponse get(AuthenticatedUser currentUser, UUID projectId) {
        return toResponse(requireOwnedProject(currentUser, projectId));
    }

    @Transactional
    public ProjectResponse update(
        AuthenticatedUser currentUser,
        UUID projectId,
        UpdateProjectRequest request
    ) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);
        Project project = requireOwnedProject(organizationId, currentUser, projectId);

        if (request.name() != null) {
            String name = request.name().trim();
            if (name.isEmpty()) {
                throw new BadRequestException("name must not be blank.");
            }
            project.rename(name);
        }

        applySchedule(project, request);

        if (request.generalDescription() != null) {
            project.changeGeneralDescription(trimToNull(request.generalDescription()));
        }

        // Validate the full replacement lists before deleting any current rows.
        List<ProjectTechnology> newTechnologies = request.technologyStack() == null
            ? null
            : buildTechnologies(project, request.technologyStack());
        List<ProjectTeamRoleRequirement> newRequirements = request.teamRoles() == null
            ? null
            : buildRequirements(project, organizationId, request.teamRoles(),
                existingTeamRoleIds(project));

        // Status change (and its history) only when the value actually differs.
        if (request.status() != null && request.status() != project.getStatus()) {
            // Other modules may veto the transition (for example activation that
            // would over-allocate an employee). A veto throws before any change,
            // so status and history stay untouched.
            statusChangeGuards.forEach(
                guard -> guard.beforeStatusChange(project, request.status()));

            User actor = userRepository.findById(currentUser.userId())
                .orElseThrow(() -> new NotFoundException("Authenticated user was not found."));
            ProjectStatus previous = project.getStatus();
            project.changeStatus(request.status());
            statusHistoryRepository.save(
                new ProjectStatusHistory(project, previous, request.status(), actor));
        }

        if (newTechnologies != null) {
            technologyRepository.deleteByProject_Id(project.getId());
            technologyRepository.flush();
            persistTechnologies(project, newTechnologies);
        }
        if (newRequirements != null) {
            requirementRepository.deleteByProject_Id(project.getId());
            requirementRepository.flush();
            persistRequirements(project, newRequirements);
        }

        return toResponse(project);
    }

    @Transactional
    public void delete(AuthenticatedUser currentUser, UUID projectId, boolean confirmed) {
        if (!confirmed) {
            throw new BadRequestException("Deletion must be explicitly confirmed with confirmed=true.");
        }

        Project project = requireOwnedProject(currentUser, projectId);

        // The historical rule cannot be bypassed by the current status.
        if (statusHistoryRepository.existsByProject_IdAndToStatusIn(
            project.getId(), DELETION_BLOCKING_STATUSES)) {
            throw new ConflictException(
                "This project has progressed beyond planning and can no longer be deleted.");
        }

        // Let other modules clean up their project-scoped data first (for example
        // assignment proposals), without the project module depending on them.
        deletionContributors.forEach(contributor -> contributor.beforeProjectDelete(project.getId()));

        // Explicit, bounded deletion: never a broad cascade onto users/allocations.
        technologyRepository.deleteByProject_Id(project.getId());
        requirementRepository.deleteByProject_Id(project.getId());
        statusHistoryRepository.deleteByProject_Id(project.getId());
        projectRepository.delete(project);
    }

    /**
     * Resolves a project the current user owns, reusing the single ownership
     * architecture. Cross-org or non-owning access resolves to 404.
     */
    @Transactional(readOnly = true)
    public Project requireManagedProject(AuthenticatedUser currentUser, UUID projectId) {
        return requireOwnedProject(currentUser, projectId);
    }

    // ---- validation / building ----

    private void validateSchedule(ProjectPeriod period, LocalDate startDate, LocalDate deadline) {
        if (period == ProjectPeriod.FIXED) {
            if (deadline == null) {
                throw new BadRequestException("A FIXED project requires a deadline date.");
            }
            if (deadline.isBefore(startDate)) {
                throw new BadRequestException("Deadline date must be on or after the start date.");
            }
        } else {
            if (deadline != null) {
                throw new BadRequestException("An ONGOING project must not have a deadline date.");
            }
        }
    }

    private void applySchedule(Project project, UpdateProjectRequest request) {
        ProjectPeriod finalPeriod = request.period() != null ? request.period() : project.getPeriod();
        LocalDate finalStart = request.startDate() != null
            ? request.startDate() : project.getStartDate();

        LocalDate finalDeadline;
        if (finalPeriod == ProjectPeriod.ONGOING) {
            if (request.deadlineDate() != null) {
                throw new BadRequestException("An ONGOING project must not have a deadline date.");
            }
            finalDeadline = null;
        } else {
            finalDeadline = request.deadlineDate() != null
                ? request.deadlineDate() : project.getDeadlineDate();
        }

        validateSchedule(finalPeriod, finalStart, finalDeadline);
        project.changeSchedule(finalPeriod, finalStart, finalDeadline);
    }

    private List<ProjectTechnology> buildTechnologies(Project project, List<String> rawValues) {
        List<ProjectTechnology> technologies = new ArrayList<>();
        if (rawValues == null) {
            return technologies;
        }

        Set<String> seenNormalized = new HashSet<>();
        for (String raw : rawValues) {
            if (raw == null || raw.trim().isEmpty()) {
                throw new BadRequestException("Technology values must not be blank.");
            }
            String display = raw.trim().replaceAll("\\s+", " ");
            if (display.length() > 160) {
                throw new BadRequestException("Technology values must be at most 160 characters.");
            }
            String normalized = display.toLowerCase(Locale.ROOT);
            if (!seenNormalized.add(normalized)) {
                throw new BadRequestException("Duplicate technology: " + display);
            }
            technologies.add(new ProjectTechnology(project, display, normalized));
        }
        return technologies;
    }

    private List<ProjectTeamRoleRequirement> buildRequirements(
        Project project,
        UUID organizationId,
        List<TeamRoleRequirementInput> inputs,
        Set<UUID> preservableInactiveRoleIds
    ) {
        List<ProjectTeamRoleRequirement> requirements = new ArrayList<>();
        if (inputs == null) {
            return requirements;
        }

        Set<UUID> seenRoleIds = new HashSet<>();
        for (TeamRoleRequirementInput input : inputs) {
            if (input.requiredMembers() < 1) {
                throw new BadRequestException("requiredMembers must be at least 1.");
            }
            if (!seenRoleIds.add(input.teamRoleId())) {
                throw new BadRequestException("Duplicate team role in the request.");
            }
            TeamRole teamRole = teamRoleRepository
                .findByIdAndOrganization_Id(input.teamRoleId(), organizationId)
                .orElseThrow(() -> new BadRequestException(
                    "Team role was not found in your organization."));
            // Inactive roles cannot be newly added, but an already-present
            // requirement may be preserved.
            if (!teamRole.isActive() && !preservableInactiveRoleIds.contains(teamRole.getId())) {
                throw new BadRequestException("Team role is inactive: " + teamRole.getName());
            }
            requirements.add(
                new ProjectTeamRoleRequirement(project, teamRole, input.requiredMembers()));
        }
        return requirements;
    }

    private void persistTechnologies(Project project, List<ProjectTechnology> technologies) {
        if (!technologies.isEmpty()) {
            technologyRepository.saveAll(technologies);
        }
    }

    private void persistRequirements(
        Project project, List<ProjectTeamRoleRequirement> requirements) {
        if (!requirements.isEmpty()) {
            requirementRepository.saveAll(requirements);
        }
    }

    private Set<UUID> existingTeamRoleIds(Project project) {
        return requirementRepository.findByProjectIdWithTeamRole(project.getId()).stream()
            .map(requirement -> requirement.getTeamRole().getId())
            .collect(Collectors.toSet());
    }

    private Project requireOwnedProject(AuthenticatedUser currentUser, UUID projectId) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);
        return requireOwnedProject(organizationId, currentUser, projectId);
    }

    private Project requireOwnedProject(
        UUID organizationId, AuthenticatedUser currentUser, UUID projectId) {
        // Cross-org or non-owning access resolves to 404 (anti-leak).
        return projectRepository.findByIdAndOrganization_Id(projectId, organizationId)
            .filter(project -> project.getProjectManager().getId().equals(currentUser.userId()))
            .orElseThrow(() -> new NotFoundException("Project was not found."));
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return StringUtils.hasText(trimmed) ? trimmed : null;
    }

    // ---- response mapping ----

    private ProjectResponse toResponse(Project project) {
        List<String> technologies = technologyRepository
            .findByProject_IdOrderByNameAsc(project.getId()).stream()
            .map(ProjectTechnology::getName)
            .toList();
        List<ProjectTeamRoleView> teamRoles = requirementRepository
            .findByProjectIdWithTeamRole(project.getId()).stream()
            .map(ProjectService::teamRoleView)
            .toList();
        return buildResponse(project, technologies, teamRoles);
    }

    private List<ProjectResponse> toResponses(List<Project> projects) {
        if (projects.isEmpty()) {
            return List.of();
        }

        List<UUID> ids = projects.stream().map(Project::getId).toList();
        Map<UUID, List<String>> technologiesByProject = technologyRepository.findByProjectIds(ids)
            .stream()
            .collect(Collectors.groupingBy(
                technology -> technology.getProject().getId(),
                Collectors.mapping(ProjectTechnology::getName, Collectors.toList())));
        Map<UUID, List<ProjectTeamRoleView>> teamRolesByProject = requirementRepository
            .findByProjectIdsWithTeamRole(ids).stream()
            .collect(Collectors.groupingBy(
                requirement -> requirement.getProject().getId(),
                Collectors.mapping(ProjectService::teamRoleView, Collectors.toList())));

        return projects.stream()
            .map(project -> buildResponse(
                project,
                technologiesByProject.getOrDefault(project.getId(), List.of()),
                teamRolesByProject.getOrDefault(project.getId(), List.of())))
            .toList();
    }

    private static ProjectResponse buildResponse(
        Project project, List<String> technologies, List<ProjectTeamRoleView> teamRoles) {
        User manager = project.getProjectManager();
        return new ProjectResponse(
            project.getId(),
            new ProjectManagerSummary(manager.getId(), manager.getName(), manager.getEmail()),
            project.getName(),
            project.getPeriod(),
            project.getStartDate(),
            project.getDeadlineDate(),
            project.getStatus(),
            project.getGeneralDescription(),
            technologies,
            teamRoles,
            project.getCreatedAt(),
            project.getUpdatedAt());
    }

    private static ProjectTeamRoleView teamRoleView(ProjectTeamRoleRequirement requirement) {
        TeamRole teamRole = requirement.getTeamRole();
        return new ProjectTeamRoleView(
            requirement.getId(),
            teamRole.getId(),
            teamRole.getName(),
            teamRole.isActive(),
            requirement.getRequiredMembers());
    }
}
