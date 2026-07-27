package me.aydgn.potriv.admin.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.admin.repository.AdminSkillCategoryRepository;
import me.aydgn.potriv.admin.support.AdminListView;
import me.aydgn.potriv.admin.support.AdminNotFoundException;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.viewmodel.AdminSkillCategoryViews;
import me.aydgn.potriv.skill.entity.SkillCategory;

/** Read-only projections for the admin skill-category browser. */
@Service
public class AdminSkillCategoryService {

    private final AdminSkillCategoryRepository categoryRepository;

    public AdminSkillCategoryService(AdminSkillCategoryRepository categoryRepository) {
        this.categoryRepository = categoryRepository;
    }

    @Transactional(readOnly = true)
    public AdminListView<AdminSkillCategoryViews.ListItem> list(
        String query, Pageable pageable, String baseQuery) {
        String q = AdminPaging.normalizeQuery(query);
        Page<SkillCategory> page = categoryRepository.search(AdminPaging.likePattern(q), pageable);

        List<UUID> ids = page.getContent().stream().map(SkillCategory::getId).toList();
        Map<UUID, Long> skills = AdminCounts.toMap(categoryRepository.countSkillsByCategoryIds(ids));

        Page<AdminSkillCategoryViews.ListItem> mapped = page.map(category ->
            new AdminSkillCategoryViews.ListItem(
                category.getId(),
                category.getName(),
                category.getOrganization().getName(),
                category.isActive(),
                AdminCounts.get(skills, category.getId()),
                category.getCreatedAt()));
        return AdminListView.of(mapped, q, baseQuery);
    }

    @Transactional(readOnly = true)
    public AdminSkillCategoryViews.Details details(UUID id) {
        SkillCategory category = categoryRepository.findDetailById(id)
            .orElseThrow(() -> new AdminNotFoundException("Skill category was not found."));
        long skillCount = AdminCounts.get(
            AdminCounts.toMap(categoryRepository.countSkillsByCategoryIds(List.of(id))), id);

        return new AdminSkillCategoryViews.Details(
            category.getId(),
            category.getName(),
            category.getOrganization().getId(),
            category.getOrganization().getName(),
            category.isActive(),
            skillCount,
            category.getCreatedAt(),
            category.getUpdatedAt());
    }
}
