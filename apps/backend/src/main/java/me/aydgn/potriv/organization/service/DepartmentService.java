package me.aydgn.potriv.organization.service;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.exception.ConflictException;
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.CurrentOrganizationResolver;
import me.aydgn.potriv.organization.dto.CreateDepartmentRequest;
import me.aydgn.potriv.organization.dto.DepartmentResponse;
import me.aydgn.potriv.organization.dto.UpdateDepartmentRequest;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.DepartmentRepository;
import me.aydgn.potriv.organization.repository.OrganizationRepository;

@Service
public class DepartmentService {

    private final DepartmentRepository departmentRepository;
    private final OrganizationRepository organizationRepository;
    private final CurrentOrganizationResolver currentOrganizationResolver;

    public DepartmentService(
        DepartmentRepository departmentRepository,
        OrganizationRepository organizationRepository,
        CurrentOrganizationResolver currentOrganizationResolver
    ) {
        this.departmentRepository = departmentRepository;
        this.organizationRepository = organizationRepository;
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

        return departmentRepository.findByOrganization_IdOrderByNameAsc(organizationId).stream()
            .map(this::toResponse)
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
     * Guards destructive deletion. Later tasks add manager-assignment and
     * membership dependency checks here so a department is deletable only when
     * it has no manager and no members. Users are never cascade-deleted.
     */
    protected void ensureDeletable(Department department) {
        // No dependent relations exist yet in this task.
    }

    protected DepartmentResponse toResponse(Department department) {
        return new DepartmentResponse(
            department.getId(),
            department.getName(),
            null,
            0L,
            department.getCreatedAt(),
            department.getUpdatedAt()
        );
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
