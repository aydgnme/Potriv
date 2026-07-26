package me.aydgn.potriv.admin.service;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.admin.security.AdminPrincipal;
import me.aydgn.potriv.admin.support.AdminNotFoundException;
import me.aydgn.potriv.admin.support.AdminValidationException;
import me.aydgn.potriv.admin.viewmodel.AdminDepartmentForms.Dependencies;
import me.aydgn.potriv.admin.viewmodel.AdminDepartmentForms.OrganizationOption;
import me.aydgn.potriv.allocation.repository.ProjectAssignmentProposalRepository;
import me.aydgn.potriv.allocation.repository.ProjectDeallocationProposalRepository;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.DepartmentManagerAssignmentRepository;
import me.aydgn.potriv.organization.repository.DepartmentMembershipRepository;
import me.aydgn.potriv.organization.repository.DepartmentRepository;
import me.aydgn.potriv.organization.repository.OrganizationRepository;
import me.aydgn.potriv.skill.repository.SkillDepartmentLinkRepository;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.service.SecurityAuditService;

/**
 * Transactional write service for department administration. It mirrors the
 * organization-scoped {@code DepartmentService} invariants (trim, lower-cased
 * normalized name, per-organization uniqueness) but works cross-organization
 * for the platform console. Deletion is dependency-safe: a department is deleted
 * only when nothing references it — never cascading, never orphaning history.
 */
@Service
public class AdminDepartmentWriteService {

    private final DepartmentRepository departmentRepository;
    private final OrganizationRepository organizationRepository;
    private final DepartmentMembershipRepository membershipRepository;
    private final DepartmentManagerAssignmentRepository managerAssignmentRepository;
    private final SkillDepartmentLinkRepository skillDepartmentLinkRepository;
    private final ProjectAssignmentProposalRepository assignmentProposalRepository;
    private final ProjectDeallocationProposalRepository deallocationProposalRepository;
    private final SecurityAuditService securityAuditService;

    public AdminDepartmentWriteService(
        DepartmentRepository departmentRepository,
        OrganizationRepository organizationRepository,
        DepartmentMembershipRepository membershipRepository,
        DepartmentManagerAssignmentRepository managerAssignmentRepository,
        SkillDepartmentLinkRepository skillDepartmentLinkRepository,
        ProjectAssignmentProposalRepository assignmentProposalRepository,
        ProjectDeallocationProposalRepository deallocationProposalRepository,
        SecurityAuditService securityAuditService
    ) {
        this.departmentRepository = departmentRepository;
        this.organizationRepository = organizationRepository;
        this.membershipRepository = membershipRepository;
        this.managerAssignmentRepository = managerAssignmentRepository;
        this.skillDepartmentLinkRepository = skillDepartmentLinkRepository;
        this.assignmentProposalRepository = assignmentProposalRepository;
        this.deallocationProposalRepository = deallocationProposalRepository;
        this.securityAuditService = securityAuditService;
    }

    /** Human-readable organizations for the create form's dropdown. */
    @Transactional(readOnly = true)
    public List<OrganizationOption> organizationOptions() {
        return organizationRepository.findAllByOrderByNameAsc().stream()
            .map(org -> new OrganizationOption(org.getId(), org.getName()))
            .toList();
    }

    /**
     * Creates a department in the chosen organization. Enforces name presence
     * and per-organization uniqueness; returns the new id.
     */
    @Transactional
    public UUID create(String rawOrganizationId, String rawName, AdminPrincipal actor) {
        String name = trimName(rawName);
        String normalizedName = normalize(name);
        UUID organizationId = parseOrganizationId(rawOrganizationId);

        Organization organization = organizationRepository.findById(organizationId)
            .orElseThrow(() -> new AdminValidationException(
                "organizationId", "The selected organization no longer exists."));

        ensureNameAvailable(organizationId, normalizedName);

        Department department = departmentRepository.save(
            new Department(organization, name, normalizedName));

        securityAuditService.record(SecurityAuditEvent
            .builder(SecurityAuditEventType.ADMIN_DEPARTMENT_CREATED, true)
            .actorUserId(actor == null ? null : actor.userId())
            .organizationId(organizationId)
            .details("Created department")
            .build());

        return department.getId();
    }

    /** Renames a department. The organization is immutable. */
    @Transactional
    public void update(UUID departmentId, String rawName, AdminPrincipal actor) {
        Department department = requireDepartment(departmentId);
        String name = trimName(rawName);
        String normalizedName = normalize(name);

        if (!normalizedName.equals(department.getNormalizedName())) {
            ensureNameAvailable(department.getOrganization().getId(), normalizedName);
        }
        department.rename(name, normalizedName);

        securityAuditService.record(SecurityAuditEvent
            .builder(SecurityAuditEventType.ADMIN_DEPARTMENT_UPDATED, true)
            .actorUserId(actor == null ? null : actor.userId())
            .organizationId(department.getOrganization().getId())
            .details("Renamed department")
            .build());
    }

    /** Read-only dependency snapshot for the delete confirmation page. */
    @Transactional(readOnly = true)
    public Dependencies dependencies(UUID departmentId) {
        requireDepartment(departmentId);
        return computeDependencies(departmentId);
    }

    /**
     * Deletes a department only when it has no dependent domain data. Returns
     * {@code true} when deleted, {@code false} when blocked; never cascades.
     */
    @Transactional
    public boolean delete(UUID departmentId, AdminPrincipal actor) {
        Department department = requireDepartment(departmentId);
        UUID organizationId = department.getOrganization().getId();
        Dependencies dependencies = computeDependencies(departmentId);

        if (dependencies.blocked()) {
            securityAuditService.record(SecurityAuditEvent
                .builder(SecurityAuditEventType.ADMIN_DEPARTMENT_DELETE_BLOCKED, false)
                .actorUserId(actor == null ? null : actor.userId())
                .organizationId(organizationId)
                .details("Blocked: department still has dependent data")
                .build());
            return false;
        }

        departmentRepository.delete(department);

        securityAuditService.record(SecurityAuditEvent
            .builder(SecurityAuditEventType.ADMIN_DEPARTMENT_DELETED, true)
            .actorUserId(actor == null ? null : actor.userId())
            .organizationId(organizationId)
            .details("Deleted department")
            .build());
        return true;
    }

    private Dependencies computeDependencies(UUID departmentId) {
        return new Dependencies(
            membershipRepository.countByDepartment_Id(departmentId),
            managerAssignmentRepository.existsByDepartment_Id(departmentId),
            skillDepartmentLinkRepository.countByDepartment_Id(departmentId),
            assignmentProposalRepository.existsByReviewDepartment_Id(departmentId),
            deallocationProposalRepository.existsByReviewDepartment_Id(departmentId));
    }

    private Department requireDepartment(UUID departmentId) {
        return departmentRepository.findById(departmentId)
            .orElseThrow(() -> new AdminNotFoundException("Department was not found."));
    }

    private void ensureNameAvailable(UUID organizationId, String normalizedName) {
        departmentRepository
            .findByOrganization_IdAndNormalizedName(organizationId, normalizedName)
            .ifPresent(existing -> {
                throw new AdminValidationException(
                    "name", "A department with this name already exists in the organization.");
            });
    }

    private static UUID parseOrganizationId(String rawOrganizationId) {
        if (rawOrganizationId == null || rawOrganizationId.isBlank()) {
            throw new AdminValidationException("organizationId", "Organization is required.");
        }
        try {
            return UUID.fromString(rawOrganizationId.trim());
        } catch (IllegalArgumentException ex) {
            throw new AdminValidationException(
                "organizationId", "Please select a valid organization.");
        }
    }

    private static String trimName(String rawName) {
        String name = rawName == null ? "" : rawName.trim();
        if (name.isEmpty()) {
            throw new AdminValidationException("name", "Name is required.");
        }
        return name;
    }

    private static String normalize(String name) {
        return name.trim().toLowerCase(Locale.ROOT);
    }
}
