package me.aydgn.potriv.admin.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.admin.security.AdminPrincipal;
import me.aydgn.potriv.admin.support.AdminNotFoundException;
import me.aydgn.potriv.admin.support.AdminValidationException;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.OrganizationRepository;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.service.SecurityAuditService;

/**
 * Transactional write service for organization administration. The console is a
 * platform (cross-organization) surface, so this deliberately does not use the
 * organization-scoped {@code DepartmentService}/domain services that resolve the
 * current user's org; it enforces the same field invariants directly through
 * repositories. Only the organization name is mutable here.
 */
@Service
public class AdminOrganizationWriteService {

    private final OrganizationRepository organizationRepository;
    private final SecurityAuditService securityAuditService;

    public AdminOrganizationWriteService(
        OrganizationRepository organizationRepository,
        SecurityAuditService securityAuditService
    ) {
        this.organizationRepository = organizationRepository;
        this.securityAuditService = securityAuditService;
    }

    /**
     * Renames an organization. The address and all other fields are left
     * untouched. Throws {@link AdminNotFoundException} for an unknown id and
     * {@link AdminValidationException} for a blank name.
     */
    @Transactional
    public void updateName(UUID organizationId, String rawName, AdminPrincipal actor) {
        Organization organization = organizationRepository.findById(organizationId)
            .orElseThrow(() -> new AdminNotFoundException("Organization was not found."));

        String name = rawName == null ? "" : rawName.trim();
        if (name.isEmpty()) {
            throw new AdminValidationException("name", "Name is required.");
        }

        organization.updateDetails(name, organization.getHeadquarterAddress());

        securityAuditService.record(SecurityAuditEvent
            .builder(SecurityAuditEventType.ADMIN_ORGANIZATION_UPDATED, true)
            .actorUserId(actor == null ? null : actor.userId())
            .organizationId(organization.getId())
            .details("Renamed organization")
            .build());
    }
}
