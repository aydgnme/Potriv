package me.aydgn.potriv.admin.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.admin.repository.AdminOrganizationRepository;
import me.aydgn.potriv.admin.support.AdminListView;
import me.aydgn.potriv.admin.support.AdminNotFoundException;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.viewmodel.AdminOrganizationViews;
import me.aydgn.potriv.organization.entity.Organization;

@Service
public class AdminOrganizationService {

    private final AdminOrganizationRepository organizationRepository;

    public AdminOrganizationService(AdminOrganizationRepository organizationRepository) {
        this.organizationRepository = organizationRepository;
    }

    @Transactional(readOnly = true)
    public AdminListView<AdminOrganizationViews.ListItem> list(
        String query, Pageable pageable, String baseQuery) {
        String q = AdminPaging.normalizeQuery(query);
        Page<Organization> page = organizationRepository.search(AdminPaging.likePattern(q), pageable);

        List<UUID> ids = page.getContent().stream().map(Organization::getId).toList();
        Map<UUID, Long> users = counts(organizationRepository.countUsersByOrganizationIds(ids), ids);
        Map<UUID, Long> departments =
            counts(organizationRepository.countDepartmentsByOrganizationIds(ids), ids);
        Map<UUID, Long> projects =
            counts(organizationRepository.countProjectsByOrganizationIds(ids), ids);

        Page<AdminOrganizationViews.ListItem> mapped = page.map(org ->
            new AdminOrganizationViews.ListItem(
                org.getId(),
                org.getName(),
                AdminCounts.get(users, org.getId()),
                AdminCounts.get(departments, org.getId()),
                AdminCounts.get(projects, org.getId()),
                org.getCreatedAt()));
        return AdminListView.of(mapped, q, baseQuery);
    }

    @Transactional(readOnly = true)
    public AdminOrganizationViews.Details details(UUID id) {
        Organization org = organizationRepository.findById(id)
            .orElseThrow(() -> new AdminNotFoundException("Organization was not found."));
        List<UUID> ids = List.of(id);
        long usersCount = AdminCounts.get(
            counts(organizationRepository.countUsersByOrganizationIds(ids), ids), id);
        long departmentsCount = AdminCounts.get(
            counts(organizationRepository.countDepartmentsByOrganizationIds(ids), ids), id);
        long projectsCount = AdminCounts.get(
            counts(organizationRepository.countProjectsByOrganizationIds(ids), ids), id);

        // Department member counts are shown on the Departments page; the org
        // detail lists departments by name/link only (no fabricated counts).
        List<AdminOrganizationViews.Details.DepartmentSummary> departments =
            organizationRepository.departmentSummaries(id).stream()
                .map(row -> new AdminOrganizationViews.Details.DepartmentSummary(
                    (UUID) row[0], (String) row[1], -1L))
                .toList();

        return new AdminOrganizationViews.Details(
            org.getId(),
            org.getName(),
            org.getHeadquarterAddress(),
            usersCount,
            departmentsCount,
            projectsCount,
            departments,
            org.getCreatedAt(),
            org.getUpdatedAt());
    }

    private static Map<UUID, Long> counts(List<Object[]> rows, List<UUID> ids) {
        return AdminCounts.toMap(rows);
    }
}
