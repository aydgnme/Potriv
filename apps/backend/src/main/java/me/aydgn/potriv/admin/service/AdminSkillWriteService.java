package me.aydgn.potriv.admin.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import me.aydgn.potriv.admin.security.AdminPrincipal;
import me.aydgn.potriv.admin.support.AdminIds;
import me.aydgn.potriv.admin.support.AdminNotFoundException;
import me.aydgn.potriv.admin.support.AdminValidationException;
import me.aydgn.potriv.admin.viewmodel.AdminSkillCatalogForms.GroupedOption;
import me.aydgn.potriv.admin.viewmodel.AdminSkillCatalogForms.OrganizationOption;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.DepartmentRepository;
import me.aydgn.potriv.organization.repository.OrganizationRepository;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.service.SecurityAuditService;
import me.aydgn.potriv.skill.entity.Skill;
import me.aydgn.potriv.skill.entity.SkillCategory;
import me.aydgn.potriv.skill.entity.SkillDepartmentLink;
import me.aydgn.potriv.skill.repository.SkillCategoryRepository;
import me.aydgn.potriv.skill.repository.SkillDepartmentLinkRepository;
import me.aydgn.potriv.skill.repository.SkillRepository;

/**
 * Transactional write service for the skill catalog. It preserves the domain
 * invariants of the org-scoped {@code SkillService} — organization/category
 * scoping, per (organization, category) normalized uniqueness, an immutable
 * author, safe activate/deactivate, and same-organization department links —
 * while operating cross-organization for the platform console. It never assigns
 * skills to employees and never hard-deletes anything.
 */
@Service
public class AdminSkillWriteService {

    private final SkillRepository skillRepository;
    private final SkillCategoryRepository categoryRepository;
    private final DepartmentRepository departmentRepository;
    private final OrganizationRepository organizationRepository;
    private final SkillDepartmentLinkRepository linkRepository;
    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final SecurityAuditService securityAuditService;

    public AdminSkillWriteService(
        SkillRepository skillRepository,
        SkillCategoryRepository categoryRepository,
        DepartmentRepository departmentRepository,
        OrganizationRepository organizationRepository,
        SkillDepartmentLinkRepository linkRepository,
        UserRepository userRepository,
        UserRoleRepository userRoleRepository,
        SecurityAuditService securityAuditService
    ) {
        this.skillRepository = skillRepository;
        this.categoryRepository = categoryRepository;
        this.departmentRepository = departmentRepository;
        this.organizationRepository = organizationRepository;
        this.linkRepository = linkRepository;
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.securityAuditService = securityAuditService;
    }

    // -------------------------------------------------------------- Options

    @Transactional(readOnly = true)
    public List<OrganizationOption> organizationOptions() {
        return organizationRepository.findAllByOrderByNameAsc().stream()
            .map(org -> new OrganizationOption(org.getId(), org.getName()))
            .toList();
    }

    @Transactional(readOnly = true)
    public List<GroupedOption> categoryOptions() {
        return categoryRepository.findActiveWithOrganization().stream()
            .map(c -> new GroupedOption(c.getId(), c.getName(), c.getOrganization().getId()))
            .toList();
    }

    @Transactional(readOnly = true)
    public List<GroupedOption> authorOptions() {
        return userRoleRepository.findUsersByRole(AccessRole.DEPARTMENT_MANAGER).stream()
            .filter(u -> u.getOrganization() != null)
            .map(u -> new GroupedOption(u.getId(), u.getName(), u.getOrganization().getId()))
            .toList();
    }

    @Transactional(readOnly = true)
    public List<GroupedOption> departmentOptions() {
        return departmentRepository.findAllWithOrganization().stream()
            .map(d -> new GroupedOption(d.getId(), d.getName(), d.getOrganization().getId()))
            .toList();
    }

    @Transactional(readOnly = true)
    public List<GroupedOption> categoryOptionsForOrganization(UUID organizationId) {
        return categoryRepository.findByOrganization_IdAndActiveTrueOrderByNameAsc(organizationId)
            .stream()
            .map(c -> new GroupedOption(c.getId(), c.getName(), organizationId))
            .toList();
    }

    @Transactional(readOnly = true)
    public List<GroupedOption> departmentOptionsForOrganization(UUID organizationId) {
        return departmentRepository.findByOrganization_IdOrderByNameAsc(organizationId).stream()
            .map(d -> new GroupedOption(d.getId(), d.getName(), organizationId))
            .toList();
    }

    // --------------------------------------------------------------- Create

    @Transactional
    public UUID create(
        String rawOrganizationId,
        String rawCategoryId,
        String rawName,
        String rawDescription,
        String rawAuthorId,
        List<String> rawDepartmentIds,
        AdminPrincipal actor
    ) {
        UUID organizationId = AdminIds.parse(
            rawOrganizationId, "organizationId", "Organization is required.");
        Organization organization = organizationRepository.findById(organizationId)
            .orElseThrow(() -> new AdminValidationException(
                "organizationId", "The selected organization no longer exists."));

        SkillCategory category = requireActiveCategoryInOrg(organizationId,
            AdminIds.parse(rawCategoryId, "categoryId", "Category is required."));
        User author = requireDepartmentManagerInOrg(organizationId,
            AdminIds.parse(rawAuthorId, "authorId", "Author is required."));

        String name = trimName(rawName);
        String normalizedName = normalize(name);
        ensureNameAvailable(organizationId, category.getId(), normalizedName, null);

        List<Department> departments = resolveDepartments(organizationId, rawDepartmentIds);
        User linkedBy = requireActor(actor);

        Skill skill = skillRepository.save(new Skill(
            organization, category, name, normalizedName, trimToNull(rawDescription), author));
        for (Department department : departments) {
            linkRepository.save(new SkillDepartmentLink(skill, department, linkedBy));
        }

        audit(SecurityAuditEventType.ADMIN_SKILL_CREATED, actor, organizationId, "Created skill");
        return skill.getId();
    }

    // ----------------------------------------------------------------- Edit

    @Transactional
    public void update(
        UUID skillId,
        String rawCategoryId,
        String rawName,
        String rawDescription,
        List<String> rawDepartmentIds,
        AdminPrincipal actor
    ) {
        Skill skill = requireSkill(skillId);
        UUID organizationId = skill.getOrganization().getId();

        UUID categoryId = AdminIds.parse(rawCategoryId, "categoryId", "Category is required.");
        SkillCategory targetCategory;
        if (categoryId.equals(skill.getCategory().getId())) {
            targetCategory = skill.getCategory();
        } else {
            targetCategory = requireActiveCategoryInOrg(organizationId, categoryId);
            skill.changeCategory(targetCategory);
        }

        String name = trimName(rawName);
        skill.rename(name, normalize(name));
        ensureNameAvailable(
            organizationId, targetCategory.getId(), skill.getNormalizedName(), skill.getId());
        skill.changeDescription(trimToNull(rawDescription));

        syncDepartmentLinks(skill, organizationId, rawDepartmentIds, actor);

        audit(SecurityAuditEventType.ADMIN_SKILL_UPDATED, actor, organizationId, "Updated skill");
    }

    // ---------------------------------------------------- Activate / deactivate

    @Transactional
    public void deactivate(UUID skillId, AdminPrincipal actor) {
        Skill skill = requireSkill(skillId);
        skill.deactivate();
        audit(SecurityAuditEventType.ADMIN_SKILL_DEACTIVATED, actor,
            skill.getOrganization().getId(), "Deactivated skill");
    }

    @Transactional
    public void reactivate(UUID skillId, AdminPrincipal actor) {
        Skill skill = requireSkill(skillId);
        skill.activate();
        audit(SecurityAuditEventType.ADMIN_SKILL_REACTIVATED, actor,
            skill.getOrganization().getId(), "Reactivated skill");
    }

    // -------------------------------------------------------- Department links

    @Transactional
    public void addDepartmentLink(UUID skillId, String rawDepartmentId, AdminPrincipal actor) {
        Skill skill = requireSkill(skillId);
        UUID organizationId = skill.getOrganization().getId();
        UUID departmentId = AdminIds.parse(rawDepartmentId, "departmentId", "Department is required.");
        Department department = departmentRepository
            .findByIdAndOrganization_Id(departmentId, organizationId)
            .orElseThrow(() -> new AdminValidationException(
                null, "The department must belong to the skill's organization."));

        if (!linkRepository.existsBySkill_IdAndDepartment_Id(skillId, departmentId)) {
            linkRepository.save(new SkillDepartmentLink(skill, department, requireActor(actor)));
            audit(SecurityAuditEventType.ADMIN_SKILL_DEPARTMENT_LINK_ADDED, actor,
                organizationId, "Linked department to skill");
        }
    }

    @Transactional
    public void removeDepartmentLink(UUID skillId, UUID departmentId, AdminPrincipal actor) {
        Skill skill = requireSkill(skillId);
        linkRepository.findBySkill_IdAndDepartment_Id(skillId, departmentId)
            .ifPresent(link -> {
                linkRepository.delete(link);
                audit(SecurityAuditEventType.ADMIN_SKILL_DEPARTMENT_LINK_REMOVED, actor,
                    skill.getOrganization().getId(), "Unlinked department from skill");
            });
    }

    // ---------------------------------------------------------------- Helpers

    private void syncDepartmentLinks(
        Skill skill, UUID organizationId, List<String> rawDepartmentIds, AdminPrincipal actor) {
        List<Department> desired = resolveDepartments(organizationId, rawDepartmentIds);
        Set<UUID> desiredIds = desired.stream().map(Department::getId).collect(Collectors.toSet());

        List<SkillDepartmentLink> current = linkRepository.findBySkillIdWithDepartment(skill.getId());
        Set<UUID> currentIds = current.stream()
            .map(link -> link.getDepartment().getId()).collect(Collectors.toSet());

        current.stream()
            .filter(link -> !desiredIds.contains(link.getDepartment().getId()))
            .forEach(linkRepository::delete);

        User linkedBy = requireActor(actor);
        desired.stream()
            .filter(department -> !currentIds.contains(department.getId()))
            .forEach(department ->
                linkRepository.save(new SkillDepartmentLink(skill, department, linkedBy)));
    }

    private SkillCategory requireActiveCategoryInOrg(UUID organizationId, UUID categoryId) {
        SkillCategory category = categoryRepository
            .findByIdAndOrganization_Id(categoryId, organizationId)
            .orElseThrow(() -> new AdminValidationException(
                "categoryId", "The selected category is not in this organization."));
        if (!category.isActive()) {
            throw new AdminValidationException("categoryId", "The selected category is inactive.");
        }
        return category;
    }

    private User requireDepartmentManagerInOrg(UUID organizationId, UUID authorId) {
        User author = userRepository.findById(authorId)
            .orElseThrow(() -> new AdminValidationException(
                "authorId", "The selected author was not found."));
        if (author.getOrganization() == null
            || !author.getOrganization().getId().equals(organizationId)) {
            throw new AdminValidationException(
                "authorId", "The author must belong to the selected organization.");
        }
        if (!userRoleRepository.existsByUserAndRole(author, AccessRole.DEPARTMENT_MANAGER)) {
            throw new AdminValidationException(
                "authorId", "The author must be a Department Manager.");
        }
        return author;
    }

    private List<Department> resolveDepartments(UUID organizationId, List<String> rawDepartmentIds) {
        List<Department> result = new ArrayList<>();
        if (rawDepartmentIds == null) {
            return result;
        }
        for (String raw : rawDepartmentIds) {
            if (raw == null || raw.isBlank()) {
                continue;
            }
            UUID departmentId = AdminIds.parse(raw, "departmentIds", "Invalid department.");
            Department department = departmentRepository
                .findByIdAndOrganization_Id(departmentId, organizationId)
                .orElseThrow(() -> new AdminValidationException(
                    "departmentIds",
                    "A selected department is not in this organization."));
            result.add(department);
        }
        return result;
    }

    private void ensureNameAvailable(
        UUID organizationId, UUID categoryId, String normalizedName, UUID selfSkillId) {
        skillRepository
            .findByOrganization_IdAndCategory_IdAndNormalizedName(
                organizationId, categoryId, normalizedName)
            .filter(existing -> !existing.getId().equals(selfSkillId))
            .ifPresent(existing -> {
                throw new AdminValidationException(
                    "name", "A skill with this name already exists in this category.");
            });
    }

    private Skill requireSkill(UUID skillId) {
        return skillRepository.findById(skillId)
            .orElseThrow(() -> new AdminNotFoundException("Skill was not found."));
    }

    private User requireActor(AdminPrincipal actor) {
        if (actor == null) {
            throw new AdminValidationException(null, "Your admin account was not found.");
        }
        return userRepository.findById(actor.userId())
            .orElseThrow(() -> new AdminValidationException(
                null, "Your admin account was not found."));
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

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return StringUtils.hasText(trimmed) ? trimmed : null;
    }
}
