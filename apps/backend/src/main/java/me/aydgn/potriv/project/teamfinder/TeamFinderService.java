package me.aydgn.potriv.project.teamfinder;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.allocation.entity.AssignmentProposalStatus;
import me.aydgn.potriv.allocation.entity.ProjectAllocation;
import me.aydgn.potriv.allocation.entity.ProjectAssignmentProposalRole;
import me.aydgn.potriv.allocation.repository.ProjectAllocationRepository;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRepository;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRoleRepository;
import me.aydgn.potriv.allocation.service.EmployeeCapacityService;
import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.CurrentOrganizationResolver;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.repository.DepartmentMembershipRepository;
import me.aydgn.potriv.project.entity.Project;
import me.aydgn.potriv.project.entity.ProjectPeriod;
import me.aydgn.potriv.project.entity.ProjectTechnology;
import me.aydgn.potriv.project.repository.ProjectTechnologyRepository;
import me.aydgn.potriv.project.repository.ProjectTeamRoleRequirementRepository;
import me.aydgn.potriv.project.service.ProjectService;
import me.aydgn.potriv.project.teamfinder.TeamFinderCandidateResponse.AvailabilityView;
import me.aydgn.potriv.project.teamfinder.TeamFinderCandidateResponse.CloseToFinishProjectView;
import me.aydgn.potriv.project.teamfinder.TeamFinderCandidateResponse.DepartmentSummary;
import me.aydgn.potriv.project.teamfinder.TeamFinderCandidateResponse.EmployeeSummary;
import me.aydgn.potriv.project.teamfinder.TeamFinderCandidateResponse.PastProjectMatchView;
import me.aydgn.potriv.project.teamfinder.TeamFinderCandidateResponse.SkillMatchView;
import me.aydgn.potriv.skill.dto.EmployeeSkillResponse.ExperienceView;
import me.aydgn.potriv.skill.dto.EmployeeSkillResponse.LevelView;
import me.aydgn.potriv.skill.entity.EmployeeSkill;
import me.aydgn.potriv.skill.entity.Skill;
import me.aydgn.potriv.skill.repository.EmployeeSkillRepository;

/**
 * Deterministic Team Finder. Ranks same-organization employee candidates for a
 * project by availability, exact-normalized skill matches against the project's
 * technologies, and past project similarity. No AI, no fuzzy matching, no
 * persisted state — computed on demand with batch queries (no N+1).
 */
@Service
public class TeamFinderService {

    private static final int DEFAULT_LIMIT = 50;
    private static final int MIN_LIMIT = 1;
    private static final int MAX_LIMIT = 100;
    private static final int MIN_CLOSE_TO_FINISH_WEEKS = 2;
    private static final int MAX_CLOSE_TO_FINISH_WEEKS = 6;
    private static final int DEFAULT_CLOSE_TO_FINISH_WEEKS = 2;

    private final ProjectService projectService;
    private final ProjectTechnologyRepository technologyRepository;
    private final ProjectTeamRoleRequirementRepository requirementRepository;
    private final UserRoleRepository userRoleRepository;
    private final DepartmentMembershipRepository departmentMembershipRepository;
    private final EmployeeSkillRepository employeeSkillRepository;
    private final ProjectAllocationRepository allocationRepository;
    private final ProjectAssignmentProposalRepository assignmentProposalRepository;
    private final ProjectAssignmentProposalRoleRepository proposalRoleRepository;
    private final CurrentOrganizationResolver currentOrganizationResolver;
    private final Clock clock;

    public TeamFinderService(
        ProjectService projectService,
        ProjectTechnologyRepository technologyRepository,
        ProjectTeamRoleRequirementRepository requirementRepository,
        UserRoleRepository userRoleRepository,
        DepartmentMembershipRepository departmentMembershipRepository,
        EmployeeSkillRepository employeeSkillRepository,
        ProjectAllocationRepository allocationRepository,
        ProjectAssignmentProposalRepository assignmentProposalRepository,
        ProjectAssignmentProposalRoleRepository proposalRoleRepository,
        CurrentOrganizationResolver currentOrganizationResolver,
        Clock clock
    ) {
        this.projectService = projectService;
        this.technologyRepository = technologyRepository;
        this.requirementRepository = requirementRepository;
        this.userRoleRepository = userRoleRepository;
        this.departmentMembershipRepository = departmentMembershipRepository;
        this.employeeSkillRepository = employeeSkillRepository;
        this.allocationRepository = allocationRepository;
        this.assignmentProposalRepository = assignmentProposalRepository;
        this.proposalRoleRepository = proposalRoleRepository;
        this.currentOrganizationResolver = currentOrganizationResolver;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public TeamFinderResponse find(
        AuthenticatedUser currentUser,
        UUID projectId,
        TeamFinderRequest request
    ) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);

        // Owner-scoped project resolution (cross-org / non-owner -> 404).
        Project project = projectService.requireManagedProject(currentUser, projectId);

        TeamFinderCriteria criteria = normalizeCriteria(request);
        OffsetDateTime generatedAt = OffsetDateTime.now(clock);

        // Without technologies there is no deterministic matching basis.
        Map<String, String> targetTechnologies = new LinkedHashMap<>();
        technologyRepository.findByProject_IdOrderByNameAsc(project.getId())
            .forEach(technology ->
                targetTechnologies.putIfAbsent(technology.getNormalizedName(), technology.getName()));
        if (targetTechnologies.isEmpty()) {
            return new TeamFinderResponse(project.getId(), generatedAt, criteria, 0, List.of());
        }

        Set<UUID> targetRoleIds = requirementRepository
            .findByProjectIdWithTeamRole(project.getId()).stream()
            .map(requirement -> requirement.getTeamRole().getId())
            .collect(Collectors.toSet());

        // Candidate source: same-org users currently holding the EMPLOYEE role
        // (multi-role users included), de-duplicated deterministically.
        Map<UUID, User> candidateById = new LinkedHashMap<>();
        userRoleRepository.findUsersByOrganizationIdAndRole(organizationId, AccessRole.EMPLOYEE)
            .forEach(user -> candidateById.putIfAbsent(user.getId(), user));
        if (candidateById.isEmpty()) {
            return new TeamFinderResponse(project.getId(), generatedAt, criteria, 0, List.of());
        }
        Set<UUID> candidateIds = candidateById.keySet();

        // Batch loads — one query per concern, never one per candidate.
        Map<UUID, Department> departmentByUser = departmentMembershipRepository
            .findByMemberIdsWithDepartment(candidateIds).stream()
            .collect(Collectors.toMap(
                membership -> membership.getMember().getId(),
                membership -> membership.getDepartment(),
                (first, second) -> first));

        Set<UUID> pendingProposalUserIds = new HashSet<>(assignmentProposalRepository
            .findEmployeeIdsByProjectAndStatus(project.getId(), AssignmentProposalStatus.PENDING));

        Map<UUID, List<ProjectAllocation>> activeAllocationsByUser = allocationRepository
            .findActiveByEmployeeIdsWithProject(candidateIds).stream()
            .collect(Collectors.groupingBy(allocation -> allocation.getEmployee().getId()));

        Map<UUID, List<EmployeeSkill>> skillsByUser = employeeSkillRepository
            .findActiveByUserIdsAndOrganization(candidateIds, organizationId).stream()
            .collect(Collectors.groupingBy(skill -> skill.getUser().getId()));

        // Past-project similarity is disabled without target role requirements,
        // so past data is only loaded when it can contribute.
        Map<UUID, List<ProjectAllocation>> pastAllocationsByUser = Map.of();
        Map<UUID, Set<String>> pastTechnologiesByProject = Map.of();
        Map<UUID, List<ProjectAssignmentProposalRole>> pastRolesByProposal = Map.of();
        if (!targetRoleIds.isEmpty()) {
            List<ProjectAllocation> pastAllocations = allocationRepository
                .findPastByEmployeeIdsWithProject(candidateIds, organizationId).stream()
                .filter(allocation -> !allocation.getProject().getId().equals(project.getId()))
                .toList();
            pastAllocationsByUser = pastAllocations.stream()
                .collect(Collectors.groupingBy(allocation -> allocation.getEmployee().getId()));

            Set<UUID> pastProjectIds = pastAllocations.stream()
                .map(allocation -> allocation.getProject().getId())
                .collect(Collectors.toSet());
            if (!pastProjectIds.isEmpty()) {
                pastTechnologiesByProject = technologyRepository.findByProjectIds(pastProjectIds)
                    .stream()
                    .collect(Collectors.groupingBy(
                        technology -> technology.getProject().getId(),
                        Collectors.mapping(
                            ProjectTechnology::getNormalizedName, Collectors.toSet())));
            }

            Set<UUID> pastProposalIds = pastAllocations.stream()
                .map(allocation -> allocation.getAssignmentProposal().getId())
                .collect(Collectors.toSet());
            if (!pastProposalIds.isEmpty()) {
                pastRolesByProposal = proposalRoleRepository
                    .findByProposalIdsWithTeamRole(pastProposalIds).stream()
                    .collect(Collectors.groupingBy(role -> role.getProposal().getId()));
            }
        }

        LocalDate today = LocalDate.now(clock);
        List<TeamFinderCandidateResponse> candidates = new ArrayList<>();

        for (User candidate : candidateById.values()) {
            Department department = departmentByUser.get(candidate.getId());
            if (department == null || pendingProposalUserIds.contains(candidate.getId())) {
                continue;
            }

            List<ProjectAllocation> activeAllocations =
                activeAllocationsByUser.getOrDefault(candidate.getId(), List.of());
            boolean allocatedToTarget = activeAllocations.stream()
                .anyMatch(allocation -> allocation.getProject().getId().equals(project.getId()));
            if (allocatedToTarget) {
                continue;
            }

            AvailabilityView availability = buildAvailability(activeAllocations, criteria, today);
            boolean passesAvailability = availability.fullyAvailable()
                || (criteria.includePartiallyAvailable() && availability.partiallyAvailable())
                || (criteria.includeCloseToFinish() && availability.closeToFinish())
                || (criteria.includeUnavailable() && availability.unavailable());
            if (!passesAvailability) {
                continue;
            }

            List<SkillMatchView> skillMatches = buildSkillMatches(
                skillsByUser.getOrDefault(candidate.getId(), List.of()), targetTechnologies);
            List<PastProjectMatchView> pastMatches = buildPastProjectMatches(
                pastAllocationsByUser.getOrDefault(candidate.getId(), List.of()),
                pastTechnologiesByProject, pastRolesByProposal,
                targetTechnologies, targetRoleIds);
            if (skillMatches.isEmpty() && pastMatches.isEmpty()) {
                continue;
            }

            long matchedTechnologyCount = skillMatches.stream()
                .map(SkillMatchView::technologyName)
                .distinct()
                .count();
            int skillScore = skillScore((int) matchedTechnologyCount, targetTechnologies.size());
            int pastProjectScore = pastMatches.isEmpty() ? 0 : 20;
            int availabilityScore = availabilityScore(
                availability.availableHours(), availability.closeToFinish());

            candidates.add(new TeamFinderCandidateResponse(
                new EmployeeSummary(candidate.getId(), candidate.getName(), candidate.getEmail()),
                new DepartmentSummary(department.getId(), department.getName()),
                availability,
                skillMatches,
                pastMatches,
                new TeamFinderScore(
                    skillScore,
                    pastProjectScore,
                    availabilityScore,
                    skillScore + pastProjectScore + availabilityScore)));
        }

        candidates.sort(candidateOrdering());
        List<TeamFinderCandidateResponse> limited = candidates.stream()
            .limit(criteria.limit())
            .toList();

        return new TeamFinderResponse(
            project.getId(), generatedAt, criteria, limited.size(), limited);
    }

    // ---- criteria ----

    private TeamFinderCriteria normalizeCriteria(TeamFinderRequest request) {
        boolean includePartiallyAvailable =
            request != null && Boolean.TRUE.equals(request.includePartiallyAvailable());
        boolean includeCloseToFinish =
            request != null && Boolean.TRUE.equals(request.includeCloseToFinish());
        boolean includeUnavailable =
            request != null && Boolean.TRUE.equals(request.includeUnavailable());

        Integer weeks = request == null ? null : request.closeToFinishWeeks();
        if (weeks != null
            && (weeks < MIN_CLOSE_TO_FINISH_WEEKS || weeks > MAX_CLOSE_TO_FINISH_WEEKS)) {
            throw new BadRequestException("closeToFinishWeeks must be between 2 and 6.");
        }

        Integer limit = request == null ? null : request.limit();
        if (limit != null && (limit < MIN_LIMIT || limit > MAX_LIMIT)) {
            throw new BadRequestException("limit must be between 1 and 100.");
        }

        Integer effectiveWeeks = includeCloseToFinish
            ? (weeks != null ? weeks : DEFAULT_CLOSE_TO_FINISH_WEEKS)
            : null;

        return new TeamFinderCriteria(
            includePartiallyAvailable,
            includeCloseToFinish,
            effectiveWeeks,
            includeUnavailable,
            limit != null ? limit : DEFAULT_LIMIT);
    }

    // ---- availability ----

    private AvailabilityView buildAvailability(
        List<ProjectAllocation> activeAllocations,
        TeamFinderCriteria criteria,
        LocalDate today
    ) {
        int allocatedHours = activeAllocations.stream()
            .filter(allocation -> allocation.getProject().getStatus().consumesAllocationCapacity())
            .mapToInt(ProjectAllocation::getWorkHoursPerDay)
            .sum();
        int availableHours =
            Math.max(0, EmployeeCapacityService.MAX_HOURS_PER_DAY - allocatedHours);

        boolean fullyAvailable = activeAllocations.isEmpty();
        boolean partiallyAvailable = allocatedHours > 0
            && allocatedHours < EmployeeCapacityService.MAX_HOURS_PER_DAY;
        boolean unavailable = allocatedHours >= EmployeeCapacityService.MAX_HOURS_PER_DAY;

        List<CloseToFinishProjectView> closeToFinishProjects = List.of();
        if (criteria.includeCloseToFinish()) {
            LocalDate windowEnd = today.plusWeeks(criteria.closeToFinishWeeks());
            closeToFinishProjects = activeAllocations.stream()
                .filter(allocation -> {
                    Project allocated = allocation.getProject();
                    return allocated.getStatus().consumesAllocationCapacity()
                        && allocated.getPeriod() == ProjectPeriod.FIXED
                        && allocated.getDeadlineDate() != null
                        && !allocated.getDeadlineDate().isBefore(today)
                        && !allocated.getDeadlineDate().isAfter(windowEnd);
                })
                .sorted(Comparator
                    .comparing((ProjectAllocation allocation) ->
                        allocation.getProject().getDeadlineDate())
                    .thenComparing(allocation -> allocation.getProject().getId().toString()))
                .map(allocation -> new CloseToFinishProjectView(
                    allocation.getProject().getId(),
                    allocation.getProject().getName(),
                    allocation.getProject().getDeadlineDate(),
                    allocation.getWorkHoursPerDay()))
                .toList();
        }

        return new AvailabilityView(
            allocatedHours,
            availableHours,
            activeAllocations.size(),
            fullyAvailable,
            partiallyAvailable,
            unavailable,
            !closeToFinishProjects.isEmpty(),
            closeToFinishProjects);
    }

    // ---- matching ----

    private List<SkillMatchView> buildSkillMatches(
        List<EmployeeSkill> employeeSkills, Map<String, String> targetTechnologies) {
        return employeeSkills.stream()
            .filter(employeeSkill ->
                targetTechnologies.containsKey(employeeSkill.getSkill().getNormalizedName()))
            .map(employeeSkill -> {
                Skill skill = employeeSkill.getSkill();
                return new SkillMatchView(
                    targetTechnologies.get(skill.getNormalizedName()),
                    skill.getId(),
                    skill.getName(),
                    skill.getCategory().getName(),
                    new LevelView(
                        employeeSkill.getLevel().name(),
                        employeeSkill.getLevel().getValue(),
                        employeeSkill.getLevel().getLabel()),
                    new ExperienceView(
                        employeeSkill.getExperience().name(),
                        employeeSkill.getExperience().getLabel()));
            })
            .sorted(Comparator
                .comparing(SkillMatchView::technologyName)
                .thenComparing(SkillMatchView::skillName)
                .thenComparing(match -> match.skillId().toString()))
            .toList();
    }

    private List<PastProjectMatchView> buildPastProjectMatches(
        List<ProjectAllocation> pastAllocations,
        Map<UUID, Set<String>> pastTechnologiesByProject,
        Map<UUID, List<ProjectAssignmentProposalRole>> pastRolesByProposal,
        Map<String, String> targetTechnologies,
        Set<UUID> targetRoleIds
    ) {
        if (targetRoleIds.isEmpty()) {
            return List.of();
        }

        List<PastProjectMatchView> matches = new ArrayList<>();
        for (ProjectAllocation allocation : pastAllocations) {
            Set<String> pastTechnologies = pastTechnologiesByProject
                .getOrDefault(allocation.getProject().getId(), Set.of());
            List<String> matchedTechnologies = targetTechnologies.entrySet().stream()
                .filter(entry -> pastTechnologies.contains(entry.getKey()))
                .map(Map.Entry::getValue)
                .sorted()
                .toList();
            if (matchedTechnologies.isEmpty()) {
                continue;
            }

            List<String> matchedTeamRoles = pastRolesByProposal
                .getOrDefault(allocation.getAssignmentProposal().getId(), List.of()).stream()
                .filter(role -> targetRoleIds.contains(role.getTeamRole().getId()))
                .map(role -> role.getTeamRole().getName())
                .sorted()
                .toList();
            if (matchedTeamRoles.isEmpty()) {
                continue;
            }

            matches.add(new PastProjectMatchView(
                allocation.getProject().getId(),
                allocation.getProject().getName(),
                matchedTechnologies,
                matchedTeamRoles,
                allocation.getDeallocatedAt()));
        }

        matches.sort(Comparator
            .comparing(PastProjectMatchView::deallocatedAt).reversed()
            .thenComparing(match -> match.projectId().toString()));
        return matches;
    }

    // ---- scoring (deterministic; package-private for focused unit tests) ----

    static int skillScore(int matchedTechnologyCount, int technologyCount) {
        if (technologyCount <= 0) {
            return 0;
        }
        return (int) Math.round(60.0 * matchedTechnologyCount / technologyCount);
    }

    static int availabilityScore(int availableHours, boolean closeToFinish) {
        int score = (int) Math.round(
            20.0 * availableHours / EmployeeCapacityService.MAX_HOURS_PER_DAY);
        if (closeToFinish) {
            score = Math.max(score, 10);
        }
        return Math.max(0, Math.min(20, score));
    }

    private static Comparator<TeamFinderCandidateResponse> candidateOrdering() {
        return Comparator
            .comparing((TeamFinderCandidateResponse candidate) -> -candidate.score().totalScore())
            .thenComparing(candidate -> -candidate.score().skillScore())
            .thenComparing(candidate -> -candidate.score().pastProjectScore())
            .thenComparing(candidate -> -candidate.score().availabilityScore())
            .thenComparing(candidate -> -candidate.availability().availableHours())
            .thenComparing(candidate -> candidate.employee().name().toLowerCase(Locale.ROOT))
            .thenComparing(candidate -> candidate.employee().userId().toString());
    }
}
