package me.aydgn.potriv.organization.service;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.exception.ConflictException;
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.CurrentOrganizationResolver;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.organization.dto.CreateDepartmentRequest;
import me.aydgn.potriv.organization.dto.DepartmentManagerSummary;
import me.aydgn.potriv.organization.dto.DepartmentResponse;
import me.aydgn.potriv.organization.dto.UpdateDepartmentRequest;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.entity.DepartmentManagerAssignment;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.DepartmentManagerAssignmentRepository;
import me.aydgn.potriv.organization.repository.DepartmentMembershipRepository;
import me.aydgn.potriv.organization.repository.DepartmentRepository;
import me.aydgn.potriv.organization.repository.OrganizationRepository;

@Service
public class DepartmentService {

    private final DepartmentRepository departmentRepository;
    private final OrganizationRepository organizationRepository;
    private final DepartmentManagerAssignmentRepository managerAssignmentRepository;
    private final DepartmentMembershipRepository membershipRepository;
    private final CurrentOrganizationResolver currentOrganizationResolver;

    public DepartmentService(
        DepartmentRepository departmentRepository,
        OrganizationRepository organizationRepository,
        DepartmentManagerAssignmentRepository managerAssignmentRepository,
        DepartmentMembershipRepository membershipRepository,
        CurrentOrganizationResolver currentOrganizationResolver
    ) {
        this.departmentRepository = departmentRepository;
        this.organizationRepository = organizationRepository;
        this.managerAssignmentRepository = managerAssignmentRepository;
        this.membershipRepository = membershipRepository;
        this.currentOrganizationResolver = currentOrganizationResolver;
    }

    @Transactional
    public DepartmentResponse create(AuthenticatedUser currentUser, CreateDepartmentRequest request) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);

        String name = request.name().trim();
        String normalizedName = normalize(name);

        ensureNameAvailable(organizationId, normalizedName);

        Organization organization = organizationRepository.findById(organizationId)
            .orElseThrow(() -> new NotFoundException("Organization was not found."));

        Department department = departmentRepository.save(
            new Department(organization, name, normalizedName));

        return toResponse(department);
    }

    @Transactional(readOnly = true)
    public List<DepartmentResponse> list(AuthenticatedUser currentUser) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);

        List<Department> departments =
            departmentRepository.findByOrganization_IdOrderByNameAsc(organizationId);

        // Batch-load manager assignments and member counts once for the whole org
        // to avoid N+1 across the listing.
        Map<UUID, DepartmentManagerSummary> managerByDepartment = managerAssignmentRepository
            .findAllWithManagerByOrganizationId(organizationId).stream()
            .collect(Collectors.toMap(
                assignment -> assignment.getDepartment().getId(),
                DepartmentService::managerSummary));

        Map<UUID, Long> memberCountByDepartment = membershipRepository
            .countMembersByOrganization(organizationId).stream()
            .collect(Collectors.toMap(
                row -> (UUID) row[0],
                row -> (Long) row[1]));

        return departments.stream()
            .map(department -> new DepartmentResponse(
                department.getId(),
                department.getName(),
                managerByDepartment.get(department.getId()),
                memberCountByDepartment.getOrDefault(department.getId(), 0L),
                department.getCreatedAt(),
                department.getUpdatedAt()))
            .toList();
    }

    @Transactional(readOnly = true)
    public DepartmentResponse get(AuthenticatedUser currentUser, UUID departmentId) {
        return toResponse(requireOwnedDepartment(currentUser, departmentId));
    }

    @Transactional
    public DepartmentResponse update(
        AuthenticatedUser currentUser,
        UUID departmentId,
        UpdateDepartmentRequest request
    ) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);
        Department department = requireOwnedDepartment(organizationId, departmentId);

        if (request.name() != null) {
            String name = request.name().trim();
            if (name.isEmpty()) {
                throw new BadRequestException("name must not be blank.");
            }

            String normalizedName = normalize(name);
            if (!normalizedName.equals(department.getNormalizedName())) {
                ensureNameAvailable(organizationId, normalizedName);
            }
            department.rename(name, normalizedName);
        }

        return toResponse(department);
    }

    @Transactional
    public void delete(AuthenticatedUser currentUser, UUID departmentId) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);
        Department department = requireOwnedDepartment(organizationId, departmentId);

        ensureDeletable(department);

        departmentRepository.delete(department);
    }

    /**
     * Guards destructive deletion. A department with a manager assignment must
     * have the manager unassigned first; the service returns 409 before any FK
     * failure. Users are never cascade-deleted. Later tasks extend this with a
     * membership check.
     */
    protected void ensureDeletable(Department department) {
        if (managerAssignmentRepository.existsByDepartment_Id(department.getId())) {
            throw new ConflictException(
                "Department has a manager assignment and cannot be deleted. "
                    + "Unassign the manager first.");
        }
        if (membershipRepository.existsByDepartment_Id(department.getId())) {
            throw new ConflictException(
                "Department has members and cannot be deleted. "
                    + "Remove all members first.");
        }
    }

    protected DepartmentResponse toResponse(Department department) {
        DepartmentManagerSummary manager = managerAssignmentRepository
            .findByDepartment_Id(department.getId())
            .map(DepartmentService::managerSummary)
            .orElse(null);

        long memberCount = membershipRepository.countByDepartment_Id(department.getId());

        return new DepartmentResponse(
            department.getId(),
            department.getName(),
            manager,
            memberCount,
            department.getCreatedAt(),
            department.getUpdatedAt()
        );
    }

    private static DepartmentManagerSummary managerSummary(DepartmentManagerAssignment assignment) {
        User manager = assignment.getManager();
        return new DepartmentManagerSummary(
            manager.getId(), manager.getName(), manager.getEmail());
    }

    private void ensureNameAvailable(UUID organizationId, String normalizedName) {
        departmentRepository
            .findByOrganization_IdAndNormalizedName(organizationId, normalizedName)
            .ifPresent(existing -> {
                throw new ConflictException(
                    "A department with this name already exists in the organization.");
            });
    }

    private Department requireOwnedDepartment(AuthenticatedUser currentUser, UUID departmentId) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);
        return requireOwnedDepartment(organizationId, departmentId);
    }

    private Department requireOwnedDepartment(UUID organizationId, UUID departmentId) {
        return departmentRepository.findByIdAndOrganization_Id(departmentId, organizationId)
            .orElseThrow(() -> new NotFoundException("Department was not found."));
    }

    private static String normalize(String name) {
        return name.trim().toLowerCase(Locale.ROOT);
    }
}
