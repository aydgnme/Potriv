package me.aydgn.potriv.skill.service;

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
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.OrganizationRepository;
import me.aydgn.potriv.skill.dto.CreateSkillCategoryRequest;
import me.aydgn.potriv.skill.dto.SkillCategoryResponse;
import me.aydgn.potriv.skill.dto.UpdateSkillCategoryRequest;
import me.aydgn.potriv.skill.entity.SkillCategory;
import me.aydgn.potriv.skill.repository.SkillCategoryRepository;

@Service
public class SkillCategoryService {

    private final SkillCategoryRepository skillCategoryRepository;
    private final OrganizationRepository organizationRepository;
    private final CurrentOrganizationResolver currentOrganizationResolver;

    public SkillCategoryService(
        SkillCategoryRepository skillCategoryRepository,
        OrganizationRepository organizationRepository,
        CurrentOrganizationResolver currentOrganizationResolver
    ) {
        this.skillCategoryRepository = skillCategoryRepository;
        this.organizationRepository = organizationRepository;
        this.currentOrganizationResolver = currentOrganizationResolver;
    }

    @Transactional
    public SkillCategoryResponse create(
        AuthenticatedUser currentUser,
        CreateSkillCategoryRequest request
    ) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);

        String name = request.name().trim();
        String normalizedName = normalize(name);

        ensureNameAvailable(organizationId, normalizedName);

        Organization organization = organizationRepository.findById(organizationId)
            .orElseThrow(() -> new NotFoundException("Organization was not found."));

        SkillCategory category = skillCategoryRepository.save(
            new SkillCategory(organization, name, normalizedName));

        return toResponse(category);
    }

    @Transactional(readOnly = true)
    public List<SkillCategoryResponse> list(AuthenticatedUser currentUser, boolean includeInactive) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);

        List<SkillCategory> categories = includeInactive
            ? skillCategoryRepository.findByOrganization_IdOrderByNameAsc(organizationId)
            : skillCategoryRepository.findByOrganization_IdAndActiveTrueOrderByNameAsc(organizationId);

        return categories.stream().map(SkillCategoryService::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public SkillCategoryResponse get(AuthenticatedUser currentUser, UUID categoryId) {
        return toResponse(requireOwnedCategory(currentUser, categoryId));
    }

    @Transactional
    public SkillCategoryResponse update(
        AuthenticatedUser currentUser,
        UUID categoryId,
        UpdateSkillCategoryRequest request
    ) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);
        SkillCategory category = requireOwnedCategory(organizationId, categoryId);

        if (request.name() != null) {
            String name = request.name().trim();
            if (name.isEmpty()) {
                throw new BadRequestException("name must not be blank.");
            }

            String normalizedName = normalize(name);
            if (!normalizedName.equals(category.getNormalizedName())) {
                ensureNameAvailable(organizationId, normalizedName);
            }
            category.rename(name, normalizedName);
        }

        if (request.active() != null) {
            if (request.active()) {
                category.activate();
            } else {
                category.deactivate();
            }
        }

        return toResponse(category);
    }

    @Transactional
    public void deactivate(AuthenticatedUser currentUser, UUID categoryId) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);

        // Soft, idempotent deactivation: future Skill rows may reference the row,
        // so it is never physically deleted.
        skillCategoryRepository.findByIdAndOrganization_Id(categoryId, organizationId)
            .ifPresent(SkillCategory::deactivate);
    }

    private void ensureNameAvailable(UUID organizationId, String normalizedName) {
        skillCategoryRepository
            .findByOrganization_IdAndNormalizedName(organizationId, normalizedName)
            .ifPresent(existing -> {
                throw new ConflictException(
                    "A skill category with this name already exists in the organization.");
            });
    }

    private SkillCategory requireOwnedCategory(AuthenticatedUser currentUser, UUID categoryId) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);
        return requireOwnedCategory(organizationId, categoryId);
    }

    private SkillCategory requireOwnedCategory(UUID organizationId, UUID categoryId) {
        return skillCategoryRepository.findByIdAndOrganization_Id(categoryId, organizationId)
            .orElseThrow(() -> new NotFoundException("Skill category was not found."));
    }

    private static String normalize(String name) {
        return name.trim().toLowerCase(Locale.ROOT);
    }

    private static SkillCategoryResponse toResponse(SkillCategory category) {
        return new SkillCategoryResponse(
            category.getId(),
            category.getName(),
            category.isActive(),
            category.getCreatedAt(),
            category.getUpdatedAt()
        );
    }
}
