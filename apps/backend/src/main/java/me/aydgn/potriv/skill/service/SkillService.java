package me.aydgn.potriv.skill.service;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.exception.ConflictException;
import me.aydgn.potriv.common.exception.ForbiddenException;
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.CurrentOrganizationResolver;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.skill.dto.CreateSkillRequest;
import me.aydgn.potriv.skill.dto.SkillAuthorRef;
import me.aydgn.potriv.skill.dto.SkillCategoryRef;
import me.aydgn.potriv.skill.dto.SkillResponse;
import me.aydgn.potriv.skill.dto.SkillDepartmentRef;
import me.aydgn.potriv.skill.dto.UpdateSkillRequest;
import me.aydgn.potriv.skill.entity.Skill;
import me.aydgn.potriv.skill.entity.SkillCategory;
import me.aydgn.potriv.skill.entity.SkillDepartmentLink;
import me.aydgn.potriv.skill.repository.SkillCategoryRepository;
import me.aydgn.potriv.skill.repository.SkillDepartmentLinkRepository;
import me.aydgn.potriv.skill.repository.SkillRepository;

@Service
public class SkillService {

    private final SkillRepository skillRepository;
    private final SkillCategoryRepository skillCategoryRepository;
    private final SkillDepartmentLinkRepository skillDepartmentLinkRepository;
    private final UserRepository userRepository;
    private final CurrentOrganizationResolver currentOrganizationResolver;

    public SkillService(
        SkillRepository skillRepository,
        SkillCategoryRepository skillCategoryRepository,
        SkillDepartmentLinkRepository skillDepartmentLinkRepository,
        UserRepository userRepository,
        CurrentOrganizationResolver currentOrganizationResolver
    ) {
        this.skillRepository = skillRepository;
        this.skillCategoryRepository = skillCategoryRepository;
        this.skillDepartmentLinkRepository = skillDepartmentLinkRepository;
        this.userRepository = userRepository;
        this.currentOrganizationResolver = currentOrganizationResolver;
    }

    @Transactional
    public SkillResponse create(AuthenticatedUser currentUser, CreateSkillRequest request) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);

        SkillCategory category = requireActiveCategory(organizationId, request.categoryId());

        String name = request.name().trim();
        String normalizedName = normalize(name);
        ensureNameAvailable(organizationId, category.getId(), normalizedName, null);

        User author = userRepository.findById(currentUser.userId())
            .orElseThrow(() -> new NotFoundException("Authenticated user was not found."));

        Skill skill = skillRepository.save(new Skill(
            category.getOrganization(),
            category,
            name,
            normalizedName,
            trimToNull(request.description()),
            author));

        return toResponseWithLinks(skill);
    }

    @Transactional(readOnly = true)
    public List<SkillResponse> list(
        AuthenticatedUser currentUser,
        boolean includeInactive,
        UUID categoryId,
        String q
    ) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);

        List<Skill> skills =
            skillRepository.search(organizationId, includeInactive, categoryId, trimToNull(q));

        if (skills.isEmpty()) {
            return List.of();
        }

        // Batch-load department links once for all matched skills to avoid N+1.
        Map<UUID, List<SkillDepartmentRef>> departmentsBySkill = skillDepartmentLinkRepository
            .findBySkillIdsWithDepartment(skills.stream().map(Skill::getId).toList()).stream()
            .collect(Collectors.groupingBy(
                link -> link.getSkill().getId(),
                Collectors.mapping(SkillService::departmentRef, Collectors.toList())));

        return skills.stream()
            .map(skill -> toResponse(
                skill, departmentsBySkill.getOrDefault(skill.getId(), List.of())))
            .toList();
    }

    @Transactional(readOnly = true)
    public SkillResponse get(AuthenticatedUser currentUser, UUID skillId) {
        return toResponseWithLinks(requireOrganizationSkill(currentUser, skillId));
    }

    @Transactional
    public SkillResponse update(
        AuthenticatedUser currentUser,
        UUID skillId,
        UpdateSkillRequest request
    ) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);
        Skill skill = requireOrganizationSkill(organizationId, skillId);
        requireAuthor(skill, currentUser);

        SkillCategory targetCategory = skill.getCategory();
        if (request.categoryId() != null
            && !request.categoryId().equals(skill.getCategory().getId())) {
            targetCategory = requireActiveCategory(organizationId, request.categoryId());
            skill.changeCategory(targetCategory);
        }

        if (request.name() != null) {
            String name = request.name().trim();
            if (name.isEmpty()) {
                throw new BadRequestException("name must not be blank.");
            }
            skill.rename(name, normalize(name));
        }

        // Re-check uniqueness against the (possibly new) category and name.
        ensureNameAvailable(
            organizationId, targetCategory.getId(), skill.getNormalizedName(), skill.getId());

        if (request.description() != null) {
            skill.changeDescription(trimToNull(request.description()));
        }

        if (request.active() != null) {
            if (request.active()) {
                skill.activate();
            } else {
                skill.deactivate();
            }
        }

        return toResponseWithLinks(skill);
    }

    @Transactional
    public void deactivate(AuthenticatedUser currentUser, UUID skillId) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);
        Skill skill = requireOrganizationSkill(organizationId, skillId);
        requireAuthor(skill, currentUser);

        // Soft, idempotent for the author; never physically deleted.
        skill.deactivate();
    }

    private SkillCategory requireActiveCategory(UUID organizationId, UUID categoryId) {
        SkillCategory category = skillCategoryRepository
            .findByIdAndOrganization_Id(categoryId, organizationId)
            .orElseThrow(() -> new BadRequestException(
                "Skill category was not found in your organization."));

        if (!category.isActive()) {
            throw new BadRequestException("Skill category is inactive.");
        }

        return category;
    }

    private void ensureNameAvailable(
        UUID organizationId, UUID categoryId, String normalizedName, UUID selfSkillId) {
        skillRepository
            .findByOrganization_IdAndCategory_IdAndNormalizedName(
                organizationId, categoryId, normalizedName)
            .filter(existing -> !existing.getId().equals(selfSkillId))
            .ifPresent(existing -> {
                throw new ConflictException(
                    "A skill with this name already exists in this category.");
            });
    }

    private Skill requireOrganizationSkill(AuthenticatedUser currentUser, UUID skillId) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);
        return requireOrganizationSkill(organizationId, skillId);
    }

    private Skill requireOrganizationSkill(UUID organizationId, UUID skillId) {
        // Cross-org resolves to 404 before any author disclosure.
        return skillRepository.findByIdAndOrganization_Id(skillId, organizationId)
            .orElseThrow(() -> new NotFoundException("Skill was not found."));
    }

    private void requireAuthor(Skill skill, AuthenticatedUser currentUser) {
        if (!skill.getAuthor().getId().equals(currentUser.userId())) {
            throw new ForbiddenException("Only the skill author can modify this skill.");
        }
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

    private SkillResponse toResponseWithLinks(Skill skill) {
        List<SkillDepartmentRef> departments = skillDepartmentLinkRepository
            .findBySkillIdWithDepartment(skill.getId()).stream()
            .map(SkillService::departmentRef)
            .toList();
        return toResponse(skill, departments);
    }

    private static SkillDepartmentRef departmentRef(SkillDepartmentLink link) {
        return new SkillDepartmentRef(link.getDepartment().getId(), link.getDepartment().getName());
    }

    private static SkillResponse toResponse(Skill skill, List<SkillDepartmentRef> departments) {
        SkillCategory category = skill.getCategory();
        User author = skill.getAuthor();
        return new SkillResponse(
            skill.getId(),
            new SkillCategoryRef(category.getId(), category.getName()),
            skill.getName(),
            skill.getDescription(),
            new SkillAuthorRef(author.getId(), author.getName(), author.getEmail()),
            departments,
            skill.isActive(),
            skill.getCreatedAt(),
            skill.getUpdatedAt()
        );
    }
}
