package me.aydgn.potriv.admin.service;

import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.admin.repository.AdminAllocationRepository;
import me.aydgn.potriv.admin.support.AdminListView;
import me.aydgn.potriv.admin.support.AdminNotFoundException;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.viewmodel.AdminAllocationViews;
import me.aydgn.potriv.allocation.entity.ProjectAllocation;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRoleRepository;

@Service
public class AdminAllocationService {

    private final AdminAllocationRepository allocationRepository;
    private final ProjectAssignmentProposalRoleRepository proposalRoleRepository;

    public AdminAllocationService(
        AdminAllocationRepository allocationRepository,
        ProjectAssignmentProposalRoleRepository proposalRoleRepository
    ) {
        this.allocationRepository = allocationRepository;
        this.proposalRoleRepository = proposalRoleRepository;
    }

    @Transactional(readOnly = true)
    public AdminListView<AdminAllocationViews.ListItem> list(
        String query, boolean activeOnly, Pageable pageable, String baseQuery) {
        String q = AdminPaging.normalizeQuery(query);
        Page<ProjectAllocation> page = allocationRepository.search(AdminPaging.likePattern(q), activeOnly, pageable);

        Page<AdminAllocationViews.ListItem> mapped = page.map(allocation ->
            new AdminAllocationViews.ListItem(
                allocation.getId(),
                allocation.getEmployee().getName(),
                allocation.getProject().getName(),
                allocation.getAssignmentProposal().getReviewDepartment().getName(),
                allocation.getWorkHoursPerDay(),
                status(allocation),
                allocation.getAllocatedAt(),
                allocation.getDeallocatedAt()));
        return AdminListView.of(mapped, q, baseQuery);
    }

    @Transactional(readOnly = true)
    public AdminAllocationViews.Details details(UUID id) {
        ProjectAllocation allocation = allocationRepository.findDetailById(id)
            .orElseThrow(() -> new AdminNotFoundException("Allocation was not found."));

        UUID proposalId = allocation.getAssignmentProposal().getId();
        List<String> roles = proposalRoleRepository.findByProposalIdWithTeamRole(proposalId)
            .stream().map(role -> role.getTeamRole().getName()).sorted().toList();

        return new AdminAllocationViews.Details(
            allocation.getId(),
            allocation.getEmployee().getName(),
            allocation.getEmployee().getId(),
            allocation.getProject().getName(),
            allocation.getProject().getId(),
            allocation.getAssignmentProposal().getReviewDepartment().getName(),
            allocation.getWorkHoursPerDay(),
            roles,
            status(allocation),
            proposalId,
            allocation.getAllocatedAt(),
            allocation.getDeallocatedAt(),
            allocation.getCreatedAt(),
            allocation.getUpdatedAt());
    }

    private static String status(ProjectAllocation allocation) {
        return allocation.getDeallocatedAt() == null ? "ACTIVE" : "PAST";
    }
}
