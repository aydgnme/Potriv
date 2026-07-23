package me.aydgn.potriv.admin.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.admin.repository.AdminProjectRepository;
import me.aydgn.potriv.admin.support.AdminListView;
import me.aydgn.potriv.admin.support.AdminNotFoundException;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.viewmodel.AdminProjectViews;
import me.aydgn.potriv.allocation.entity.ProjectAllocation;
import me.aydgn.potriv.allocation.repository.ProjectAllocationRepository;
import me.aydgn.potriv.project.entity.Project;
import me.aydgn.potriv.project.entity.ProjectStatus;
import me.aydgn.potriv.project.repository.ProjectTeamRoleRequirementRepository;
import me.aydgn.potriv.project.repository.ProjectTechnologyRepository;

@Service
public class AdminProjectService {

    private final AdminProjectRepository projectRepository;
    private final ProjectTechnologyRepository technologyRepository;
    private final ProjectTeamRoleRequirementRepository requirementRepository;
    private final ProjectAllocationRepository allocationRepository;

    public AdminProjectService(
        AdminProjectRepository projectRepository,
        ProjectTechnologyRepository technologyRepository,
        ProjectTeamRoleRequirementRepository requirementRepository,
        ProjectAllocationRepository allocationRepository
    ) {
        this.projectRepository = projectRepository;
        this.technologyRepository = technologyRepository;
        this.requirementRepository = requirementRepository;
        this.allocationRepository = allocationRepository;
    }

    @Transactional(readOnly = true)
    public AdminListView<AdminProjectViews.ListItem> list(
        String query, ProjectStatus status, Pageable pageable, String baseQuery) {
        String q = AdminPaging.normalizeQuery(query);
        Page<Project> page = projectRepository.search(AdminPaging.likePattern(q), status, pageable);

        List<UUID> ids = page.getContent().stream().map(Project::getId).toList();
        Map<UUID, Long> technologies =
            AdminCounts.toMap(projectRepository.countTechnologiesByProjectIds(ids));
        Map<UUID, Long> activeAllocations =
            AdminCounts.toMap(projectRepository.countActiveAllocationsByProjectIds(ids));

        Page<AdminProjectViews.ListItem> mapped = page.map(project ->
            new AdminProjectViews.ListItem(
                project.getId(),
                project.getName(),
                project.getStatus().name(),
                project.getPeriod().name(),
                project.getProjectManager() == null ? "—" : project.getProjectManager().getName(),
                AdminCounts.get(technologies, project.getId()),
                AdminCounts.get(activeAllocations, project.getId()),
                project.getDeadlineDate(),
                project.getUpdatedAt()));
        return AdminListView.of(mapped, q, baseQuery);
    }

    @Transactional(readOnly = true)
    public AdminProjectViews.Details details(UUID id) {
        Project project = projectRepository.findDetailById(id)
            .orElseThrow(() -> new AdminNotFoundException("Project was not found."));

        List<String> technologyStack = technologyRepository.findByProject_IdOrderByNameAsc(id)
            .stream().map(t -> t.getName()).toList();

        List<AdminProjectViews.Details.RoleRequirement> requirements =
            requirementRepository.findByProjectIdWithTeamRole(id).stream()
                .map(r -> new AdminProjectViews.Details.RoleRequirement(
                    r.getTeamRole().getName(), r.getRequiredMembers(), r.getTeamRole().isActive()))
                .toList();

        List<AdminProjectViews.Details.Member> activeMembers =
            allocationRepository.findActiveByProjectIdWithDetails(id).stream()
                .map(AdminProjectService::toMember).toList();
        List<AdminProjectViews.Details.Member> pastMembers =
            allocationRepository.findPastByProjectIdWithDetails(id).stream()
                .map(AdminProjectService::toMember).toList();

        return new AdminProjectViews.Details(
            project.getId(),
            project.getName(),
            project.getStatus().name(),
            project.getPeriod().name(),
            project.getStartDate(),
            project.getDeadlineDate(),
            project.getGeneralDescription(),
            project.getProjectManager() == null ? "—" : project.getProjectManager().getName(),
            project.getProjectManager() == null ? null : project.getProjectManager().getId(),
            project.getOrganization() == null ? "—" : project.getOrganization().getName(),
            technologyStack,
            requirements,
            activeMembers,
            pastMembers,
            projectRepository.countPendingAssignmentProposals(id),
            projectRepository.countPendingDeallocationProposals(id),
            project.getCreatedAt(),
            project.getUpdatedAt());
    }

    private static AdminProjectViews.Details.Member toMember(ProjectAllocation allocation) {
        return new AdminProjectViews.Details.Member(
            allocation.getId(),
            allocation.getEmployee().getName(),
            allocation.getAssignmentProposal().getReviewDepartment().getName(),
            allocation.getWorkHoursPerDay(),
            allocation.getAllocatedAt(),
            allocation.getDeallocatedAt());
    }
}
