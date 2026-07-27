package me.aydgn.potriv.admin.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.admin.repository.AdminSkillRepository;
import me.aydgn.potriv.admin.support.AdminListView;
import me.aydgn.potriv.admin.support.AdminNotFoundException;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.viewmodel.AdminSkillViews;
import me.aydgn.potriv.skill.entity.Skill;
import me.aydgn.potriv.skill.repository.EmployeeSkillRepository;
import me.aydgn.potriv.skill.repository.SkillDepartmentLinkRepository;

/** Read-only projections for the admin skill browser. */
@Service
public class AdminSkillService {

    private final AdminSkillRepository skillRepository;
    private final SkillDepartmentLinkRepository linkRepository;
    private final EmployeeSkillRepository employeeSkillRepository;

    public AdminSkillService(
        AdminSkillRepository skillRepository,
        SkillDepartmentLinkRepository linkRepository,
        EmployeeSkillRepository employeeSkillRepository
    ) {
        this.skillRepository = skillRepository;
        this.linkRepository = linkRepository;
        this.employeeSkillRepository = employeeSkillRepository;
    }

    @Transactional(readOnly = true)
    public AdminListView<AdminSkillViews.ListItem> list(
        UUID organizationId, UUID categoryId, boolean activeOnly,
        String query, Pageable pageable, String baseQuery) {
        String q = AdminPaging.normalizeQuery(query);
        Page<Skill> page = skillRepository.search(
            organizationId, categoryId, activeOnly, AdminPaging.likePattern(q), pageable);

        List<UUID> ids = page.getContent().stream().map(Skill::getId).toList();
        Map<UUID, Long> links = AdminCounts.toMap(skillRepository.countLinksBySkillIds(ids));

        Page<AdminSkillViews.ListItem> mapped = page.map(skill ->
            new AdminSkillViews.ListItem(
                skill.getId(),
                skill.getName(),
                skill.getCategory().getName(),
                skill.getOrganization().getName(),
                skill.getAuthor().getName(),
                skill.isActive(),
                AdminCounts.get(links, skill.getId()),
                skill.getCreatedAt()));
        return AdminListView.of(mapped, q, baseQuery);
    }

    @Transactional(readOnly = true)
    public AdminSkillViews.Details details(UUID id) {
        Skill skill = skillRepository.findDetailById(id)
            .orElseThrow(() -> new AdminNotFoundException("Skill was not found."));

        List<AdminSkillViews.Details.DepartmentRef> departments =
            linkRepository.findBySkillIdWithDepartment(id).stream()
                .map(link -> new AdminSkillViews.Details.DepartmentRef(
                    link.getDepartment().getId(), link.getDepartment().getName()))
                .toList();

        return new AdminSkillViews.Details(
            skill.getId(),
            skill.getName(),
            skill.getOrganization().getId(),
            skill.getOrganization().getName(),
            skill.getCategory().getId(),
            skill.getCategory().getName(),
            skill.getDescription(),
            skill.getAuthor().getId(),
            skill.getAuthor().getName(),
            skill.isActive(),
            departments,
            employeeSkillRepository.countBySkill_Id(id),
            skill.getCreatedAt(),
            skill.getUpdatedAt());
    }
}
