package me.aydgn.potriv.admin.service;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.admin.security.AdminPrincipal;
import me.aydgn.potriv.admin.support.AdminIds;
import me.aydgn.potriv.admin.support.AdminNotFoundException;
import me.aydgn.potriv.admin.support.AdminValidationException;
import me.aydgn.potriv.admin.viewmodel.AdminSkillCatalogForms.OrganizationOption;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.OrganizationRepository;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.service.SecurityAuditService;
import me.aydgn.potriv.skill.entity.SkillCategory;
import me.aydgn.potriv.skill.repository.SkillCategoryRepository;

/**
 * Transactional write service for skill categories. Mirrors the org-scoped
 * {@code SkillCategoryService} invariants (trim, lower-cased normalized name,
 * per-organization uniqueness) but works cross-organization for the platform
 * console. Category create/edit only — no delete or deactivate in ADMIN-UI-04.
 */
@Service
public class AdminSkillCategoryWriteService {

    private final SkillCategoryRepository categoryRepository;
    private final OrganizationRepository organizationRepository;
    private final SecurityAuditService securityAuditService;

    public AdminSkillCategoryWriteService(
        SkillCategoryRepository categoryRepository,
        OrganizationRepository organizationRepository,
        SecurityAuditService securityAuditService
    ) {
        this.categoryRepository = categoryRepository;
        this.organizationRepository = organizationRepository;
        this.securityAuditService = securityAuditService;
    }

    @Transactional(readOnly = true)
    public List<OrganizationOption> organizationOptions() {
        return organizationRepository.findAllByOrderByNameAsc().stream()
            .map(org -> new OrganizationOption(org.getId(), org.getName()))
            .toList();
    }

    @Transactional
    public UUID create(String rawOrganizationId, String rawName, AdminPrincipal actor) {
        UUID organizationId = AdminIds.parse(
            rawOrganizationId, "organizationId", "Organization is required.");
        String name = trimName(rawName);
        String normalizedName = normalize(name);

        Organization organization = organizationRepository.findById(organizationId)
            .orElseThrow(() -> new AdminValidationException(
                "organizationId", "The selected organization no longer exists."));

        ensureNameAvailable(organizationId, normalizedName);

        SkillCategory category = categoryRepository.save(
            new SkillCategory(organization, name, normalizedName));

        audit(SecurityAuditEventType.ADMIN_SKILL_CATEGORY_CREATED, actor, organizationId,
            "Created skill category");
        return category.getId();
    }

    @Transactional
    public void update(UUID categoryId, String rawName, AdminPrincipal actor) {
        SkillCategory category = categoryRepository.findById(categoryId)
            .orElseThrow(() -> new AdminNotFoundException("Skill category was not found."));
        UUID organizationId = category.getOrganization().getId();
        String name = trimName(rawName);
        String normalizedName = normalize(name);

        if (!normalizedName.equals(category.getNormalizedName())) {
            ensureNameAvailable(organizationId, normalizedName);
        }
        category.rename(name, normalizedName);

        audit(SecurityAuditEventType.ADMIN_SKILL_CATEGORY_UPDATED, actor, organizationId,
            "Renamed skill category");
    }

    private void ensureNameAvailable(UUID organizationId, String normalizedName) {
        categoryRepository.findByOrganization_IdAndNormalizedName(organizationId, normalizedName)
            .ifPresent(existing -> {
                throw new AdminValidationException(
                    "name", "A skill category with this name already exists in the organization.");
            });
    }

    private void audit(
        SecurityAuditEventType type, AdminPrincipal actor, UUID organizationId, String details) {
        securityAuditService.record(SecurityAuditEvent.builder(type, true)
            .actorUserId(actor == null ? null : actor.userId())
            .organizationId(organizationId)
            .details(details)
            .build());
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
