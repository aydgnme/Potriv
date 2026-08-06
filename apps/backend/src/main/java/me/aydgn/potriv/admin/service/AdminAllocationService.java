package me.aydgn.potriv.admin.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.admin.repository.AdminAllocationRepository;
import me.aydgn.potriv.admin.support.AdminIds;
import me.aydgn.potriv.admin.support.AdminListView;
import me.aydgn.potriv.admin.support.AdminNotFoundException;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.viewmodel.AdminAllocationViews;
import me.aydgn.potriv.allocation.entity.ProjectAllocation;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRoleRepository;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.organization.entity.Organization;

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

    /**
     * Wide bounds used when the operator supplied no date filter. A null
     * {@code timestamptz} bind is untypeable by Postgres, so the query always
     * receives a real instant; every stored {@code allocatedAt} falls inside these.
     */
    private static final OffsetDateTime MIN_BOUND =
        OffsetDateTime.of(1970, 1, 1, 0, 0, 0, 0, ZoneOffset.UTC);
    private static final OffsetDateTime MAX_BOUND =
        OffsetDateTime.of(9999, 12, 31, 23, 59, 59, 0, ZoneOffset.UTC);

    /** Filter value selecting allocations that are still running. */
    public static final String STATUS_ACTIVE = "ACTIVE";
    /** Filter value selecting allocations that have been deallocated. */
    public static final String STATUS_PAST = "PAST";

    @Transactional(readOnly = true)
    public AdminListView<AdminAllocationViews.ListItem> list(
        AdminAllocationViews.Filter filter, Pageable pageable, String baseQuery) {

        String q = AdminPaging.normalizeQuery(filter.q());
        String status = AdminPaging.normalizeQuery(filter.status());
        boolean activeOnly = STATUS_ACTIVE.equalsIgnoreCase(status);
        boolean pastOnly = STATUS_PAST.equalsIgnoreCase(status);

        Page<ProjectAllocation> page = allocationRepository.search(
            AdminPaging.likePattern(q),
            AdminIds.parseOrNull(filter.organizationId()),
            AdminIds.parseOrNull(filter.projectId()),
            AdminIds.parseOrNull(filter.employeeId()),
            AdminIds.parseOrNull(filter.departmentId()),
            activeOnly,
            pastOnly,
            bound(timestamp(filter.from(), false), MIN_BOUND),
            bound(timestamp(filter.to(), true), MAX_BOUND),
            pageable);

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
            organizationName(allocation),
            organizationId(allocation),
            allocation.getAssignmentProposal().getReviewDepartment().getId(),
            proposalId,
            allocation.getAssignmentProposal().getStatus().name(),
            nameOf(allocation.getAssignmentProposal().getProposedBy()),
            idOf(allocation.getAssignmentProposal().getProposedBy()),
            nameOf(allocation.getAssignmentProposal().getReviewedBy()),
            idOf(allocation.getAssignmentProposal().getReviewedBy()),
            allocation.getAssignmentProposal().getReviewedAt(),
            allocation.getAllocatedAt(),
            allocation.getDeallocatedAt(),
            allocation.getCreatedAt(),
            allocation.getUpdatedAt());
    }

    private static String status(ProjectAllocation allocation) {
        return allocation.getDeallocatedAt() == null ? STATUS_ACTIVE : STATUS_PAST;
    }

    private static String organizationName(ProjectAllocation allocation) {
        Organization organization = allocation.getProject().getOrganization();
        return organization == null ? "—" : organization.getName();
    }

    private static UUID organizationId(ProjectAllocation allocation) {
        Organization organization = allocation.getProject().getOrganization();
        return organization == null ? null : organization.getId();
    }

    private static String nameOf(User user) {
        return user == null ? "—" : user.getName();
    }

    private static UUID idOf(User user) {
        return user == null ? null : user.getId();
    }

    private static OffsetDateTime bound(OffsetDateTime value, OffsetDateTime fallback) {
        return value == null ? fallback : value;
    }

    /**
     * Reads a browser {@code datetime-local} value, or a bare date, as UTC — the
     * zone every admin timestamp is rendered in. Unreadable input is dropped so a
     * mistyped bound narrows nothing instead of failing the page.
     */
    private static OffsetDateTime timestamp(String raw, boolean endOfDay) {
        String value = AdminPaging.normalizeQuery(raw);
        if (value == null) {
            return null;
        }
        try {
            return LocalDateTime.parse(value).atOffset(ZoneOffset.UTC);
        } catch (DateTimeParseException notADateTime) {
            // Fall through: the value may still be a bare ISO date.
        }
        try {
            LocalDate date = LocalDate.parse(value);
            return date.atTime(endOfDay ? LocalTime.MAX : LocalTime.MIN).atOffset(ZoneOffset.UTC);
        } catch (DateTimeParseException notADate) {
            return null;
        }
    }
}
