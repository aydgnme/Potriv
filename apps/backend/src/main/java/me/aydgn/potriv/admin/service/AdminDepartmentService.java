package me.aydgn.potriv.admin.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.admin.repository.AdminDepartmentRepository;
import me.aydgn.potriv.admin.support.AdminListView;
import me.aydgn.potriv.admin.support.AdminNotFoundException;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.viewmodel.AdminDepartmentViews;
import me.aydgn.potriv.organization.entity.Department;

@Service
public class AdminDepartmentService {

    private final AdminDepartmentRepository departmentRepository;

    public AdminDepartmentService(AdminDepartmentRepository departmentRepository) {
        this.departmentRepository = departmentRepository;
    }

    @Transactional(readOnly = true)
    public AdminListView<AdminDepartmentViews.ListItem> list(
        String query, Pageable pageable, String baseQuery) {
        String q = AdminPaging.normalizeQuery(query);
        Page<Department> page = departmentRepository.search(AdminPaging.likePattern(q), pageable);

        List<UUID> ids = page.getContent().stream().map(Department::getId).toList();
        Map<UUID, Long> members =
            AdminCounts.toMap(departmentRepository.countMembersByDepartmentIds(ids));
        Map<UUID, String> managers =
            AdminCounts.toStringMap(departmentRepository.managerNamesByDepartmentIds(ids));

        Page<AdminDepartmentViews.ListItem> mapped = page.map(dept ->
            new AdminDepartmentViews.ListItem(
                dept.getId(),
                dept.getName(),
                dept.getOrganization().getName(),
                managers.getOrDefault(dept.getId(), "—"),
                AdminCounts.get(members, dept.getId()),
                dept.getCreatedAt()));
        return AdminListView.of(mapped, q, baseQuery);
    }

    @Transactional(readOnly = true)
    public AdminDepartmentViews.Details details(UUID id) {
        Department dept = departmentRepository.findDetailById(id)
            .orElseThrow(() -> new AdminNotFoundException("Department was not found."));

        List<Object[]> managerRows = departmentRepository.manager(id);
        UUID managerId = managerRows.isEmpty() ? null : (UUID) managerRows.get(0)[0];
        String managerName = managerRows.isEmpty() ? "—" : (String) managerRows.get(0)[1];

        List<AdminDepartmentViews.Details.MemberSummary> members =
            departmentRepository.memberSummaries(id).stream()
                .map(row -> new AdminDepartmentViews.Details.MemberSummary(
                    (UUID) row[0], (String) row[1], (String) row[2]))
                .toList();

        return new AdminDepartmentViews.Details(
            dept.getId(),
            dept.getName(),
            dept.getOrganization().getName(),
            dept.getOrganization().getId(),
            managerName,
            managerId,
            members.size(),
            members,
            dept.getCreatedAt(),
            dept.getUpdatedAt());
    }
}
