package me.aydgn.potriv.admin.service;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.admin.repository.AdminMetricsRepository;
import me.aydgn.potriv.admin.viewmodel.AdminDashboardView;
import me.aydgn.potriv.admin.viewmodel.AdminDashboardView.Metric;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.organization.repository.DepartmentRepository;
import me.aydgn.potriv.organization.repository.OrganizationRepository;
import me.aydgn.potriv.security.repository.SecurityAuditEventRepository;

/**
 * Builds safe operational counts for the admin dashboard from existing
 * repositories only. No value is fabricated.
 */
@Service
public class AdminDashboardService {

    private final UserRepository userRepository;
    private final OrganizationRepository organizationRepository;
    private final DepartmentRepository departmentRepository;
    private final AdminMetricsRepository metricsRepository;
    private final SecurityAuditEventRepository auditEventRepository;

    public AdminDashboardService(
        UserRepository userRepository,
        OrganizationRepository organizationRepository,
        DepartmentRepository departmentRepository,
        AdminMetricsRepository metricsRepository,
        SecurityAuditEventRepository auditEventRepository
    ) {
        this.userRepository = userRepository;
        this.organizationRepository = organizationRepository;
        this.departmentRepository = departmentRepository;
        this.metricsRepository = metricsRepository;
        this.auditEventRepository = auditEventRepository;
    }

    @Transactional(readOnly = true)
    public AdminDashboardView build() {
        List<Metric> metrics = new ArrayList<>();
        metrics.add(new Metric("Users", userRepository.count(), "/admin/users"));
        metrics.add(new Metric("Organizations",
            organizationRepository.count(), "/admin/organizations"));
        metrics.add(new Metric("Departments",
            departmentRepository.count(), "/admin/departments"));
        metrics.add(new Metric("Projects", metricsRepository.count(), "/admin/projects"));
        metrics.add(new Metric("Active Projects",
            metricsRepository.countActiveProjects(), "/admin/projects"));
        metrics.add(new Metric("Active Allocations",
            metricsRepository.countActiveAllocations(), "/admin/allocations"));
        metrics.add(new Metric("Pending Assignment Proposals",
            metricsRepository.countPendingAssignmentProposals(), "/admin/projects"));
        metrics.add(new Metric("Pending Deallocation Proposals",
            metricsRepository.countPendingDeallocationProposals(), "/admin/projects"));
        metrics.add(new Metric("Pending Invitations",
            metricsRepository.countActiveInvitations(), "/admin/invitations"));
        metrics.add(new Metric("Audit Events",
            auditEventRepository.count(), "/admin/audit-logs"));
        return new AdminDashboardView(metrics);
    }
}
