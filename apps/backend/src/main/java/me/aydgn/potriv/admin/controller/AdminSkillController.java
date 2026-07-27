package me.aydgn.potriv.admin.controller;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.data.domain.Sort;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import jakarta.validation.Valid;
import me.aydgn.potriv.admin.security.AdminPrincipal;
import me.aydgn.potriv.admin.service.AdminSkillService;
import me.aydgn.potriv.admin.service.AdminSkillWriteService;
import me.aydgn.potriv.admin.support.AdminAccessGuard;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.support.AdminRequests;
import me.aydgn.potriv.admin.support.AdminValidationException;
import me.aydgn.potriv.admin.viewmodel.AdminSkillCatalogForms;
import me.aydgn.potriv.admin.viewmodel.AdminSkillCatalogForms.GroupedOption;
import me.aydgn.potriv.admin.viewmodel.AdminSkillViews;

@Controller
public class AdminSkillController {

    private static final Set<String> SORTABLE = Set.of("name", "createdAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.ASC, "name");

    private final AdminAccessGuard guard;
    private final AdminSkillService skillService;
    private final AdminSkillWriteService skillWriteService;

    public AdminSkillController(
        AdminAccessGuard guard,
        AdminSkillService skillService,
        AdminSkillWriteService skillWriteService
    ) {
        this.guard = guard;
        this.skillService = skillService;
        this.skillWriteService = skillWriteService;
    }

    @GetMapping("/admin/skills")
    public String list(
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String organization,
        @RequestParam(required = false) String category,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String sort,
        Model model
    ) {
        guard.requireEnabled();
        Sort resolvedSort = AdminRequests.sort(sort, SORTABLE, DEFAULT_SORT);
        UUID organizationId = parseNullable(organization);
        UUID categoryId = parseNullable(category);
        boolean activeOnly = "active".equals(status);

        Map<String, String> retained = new LinkedHashMap<>();
        retained.put("q", q);
        retained.put("organization", organization);
        retained.put("category", category);
        retained.put("status", status);
        retained.put("size", size == null ? null : size.toString());
        retained.put("sort", sort);
        String baseQuery = AdminRequests.baseQuery(retained);

        head(model, "Skills", null);
        model.addAttribute("list", skillService.list(
            organizationId, categoryId, activeOnly, q,
            AdminPaging.of(page, size, resolvedSort), baseQuery));
        model.addAttribute("organizationOptions", skillWriteService.organizationOptions());
        model.addAttribute("categoryOptions", skillWriteService.categoryOptions());
        model.addAttribute("filterOrganization", organization);
        model.addAttribute("filterCategory", category);
        model.addAttribute("filterStatus", status);
        return "admin/skills/list";
    }

    @GetMapping("/admin/skills/{id}")
    public String detail(@PathVariable UUID id, Model model) {
        guard.requireEnabled();
        var details = skillService.details(id);
        head(model, "Skill · " + details.name(), details.name());
        model.addAttribute("skill", details);
        return "admin/skills/detail";
    }

    @GetMapping("/admin/skills/new")
    public String createForm(Model model) {
        guard.requireEnabled();
        if (!model.containsAttribute("form")) {
            model.addAttribute("form", new AdminSkillCatalogForms.SkillCreateForm());
        }
        head(model, "New skill", "New");
        populateCreateOptions(model);
        return "admin/skills/form";
    }

    @PostMapping("/admin/skills")
    public String create(
        @Valid @ModelAttribute("form") AdminSkillCatalogForms.SkillCreateForm form,
        BindingResult result,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes,
        Model model
    ) {
        guard.requireEnabled();
        if (!result.hasErrors()) {
            try {
                UUID id = skillWriteService.create(
                    form.getOrganizationId(), form.getCategoryId(), form.getName(),
                    form.getDescription(), form.getAuthorId(), form.getDepartmentIds(), principal);
                redirectAttributes.addFlashAttribute("adminSuccess", "Skill created.");
                return "redirect:/admin/skills/" + id;
            } catch (AdminValidationException ex) {
                reject(result, ex);
            }
        }
        head(model, "New skill", "New");
        populateCreateOptions(model);
        return "admin/skills/form";
    }

    @GetMapping("/admin/skills/{id}/edit")
    public String editForm(@PathVariable UUID id, Model model) {
        guard.requireEnabled();
        var details = skillService.details(id);
        if (!model.containsAttribute("form")) {
            AdminSkillCatalogForms.SkillEditForm form = new AdminSkillCatalogForms.SkillEditForm();
            form.setCategoryId(details.categoryId().toString());
            form.setName(details.name());
            form.setDescription(details.description());
            form.setDepartmentIds(details.departments().stream()
                .map(d -> d.id().toString()).toList());
            model.addAttribute("form", form);
        }
        populateEditModel(model, details);
        return "admin/skills/form";
    }

    @PostMapping("/admin/skills/{id}/edit")
    public String update(
        @PathVariable UUID id,
        @Valid @ModelAttribute("form") AdminSkillCatalogForms.SkillEditForm form,
        BindingResult result,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes,
        Model model
    ) {
        guard.requireEnabled();
        var details = skillService.details(id);
        if (!result.hasErrors()) {
            try {
                skillWriteService.update(id, form.getCategoryId(), form.getName(),
                    form.getDescription(), form.getDepartmentIds(), principal);
                redirectAttributes.addFlashAttribute("adminSuccess", "Skill updated.");
                return "redirect:/admin/skills/" + id;
            } catch (AdminValidationException ex) {
                reject(result, ex);
            }
        }
        populateEditModel(model, details);
        return "admin/skills/form";
    }

    @PostMapping("/admin/skills/{id}/deactivate")
    public String deactivate(
        @PathVariable UUID id,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes
    ) {
        guard.requireEnabled();
        skillWriteService.deactivate(id, principal);
        redirectAttributes.addFlashAttribute("adminSuccess", "Skill deactivated.");
        return "redirect:/admin/skills/" + id;
    }

    @PostMapping("/admin/skills/{id}/reactivate")
    public String reactivate(
        @PathVariable UUID id,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes
    ) {
        guard.requireEnabled();
        skillWriteService.reactivate(id, principal);
        redirectAttributes.addFlashAttribute("adminSuccess", "Skill reactivated.");
        return "redirect:/admin/skills/" + id;
    }

    @GetMapping("/admin/skills/{id}/department-links")
    public String departmentLinks(@PathVariable UUID id, Model model) {
        guard.requireEnabled();
        var details = skillService.details(id);
        head(model, "Department links · " + details.name(), details.name());
        model.addAttribute("skill", details);
        model.addAttribute("availableDepartments", availableDepartments(details));
        return "admin/skills/department-links";
    }

    @PostMapping("/admin/skills/{id}/department-links")
    public String addDepartmentLink(
        @PathVariable UUID id,
        @RequestParam(required = false) String departmentId,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes
    ) {
        guard.requireEnabled();
        try {
            skillWriteService.addDepartmentLink(id, departmentId, principal);
            redirectAttributes.addFlashAttribute("adminSuccess", "Department linked.");
        } catch (AdminValidationException ex) {
            redirectAttributes.addFlashAttribute("adminError", ex.getMessage());
        }
        return "redirect:/admin/skills/" + id + "/department-links";
    }

    @PostMapping("/admin/skills/{id}/department-links/{departmentId}/remove")
    public String removeDepartmentLink(
        @PathVariable UUID id,
        @PathVariable UUID departmentId,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes
    ) {
        guard.requireEnabled();
        skillWriteService.removeDepartmentLink(id, departmentId, principal);
        redirectAttributes.addFlashAttribute("adminSuccess", "Department link removed.");
        return "redirect:/admin/skills/" + id + "/department-links";
    }

    private void populateCreateOptions(Model model) {
        model.addAttribute("formMode", "create");
        model.addAttribute("organizationOptions", skillWriteService.organizationOptions());
        model.addAttribute("categoryOptions", skillWriteService.categoryOptions());
        model.addAttribute("authorOptions", skillWriteService.authorOptions());
        model.addAttribute("departmentOptions", skillWriteService.departmentOptions());
    }

    private void populateEditModel(Model model, AdminSkillViews.Details details) {
        head(model, "Edit · " + details.name(), details.name());
        model.addAttribute("formMode", "edit");
        model.addAttribute("skill", details);
        model.addAttribute("categoryOptions",
            skillWriteService.categoryOptionsForOrganization(details.organizationId()));
        model.addAttribute("departmentOptions",
            skillWriteService.departmentOptionsForOrganization(details.organizationId()));
    }

    private List<GroupedOption> availableDepartments(AdminSkillViews.Details details) {
        Set<UUID> linked = details.departments().stream()
            .map(AdminSkillViews.Details.DepartmentRef::id)
            .collect(java.util.stream.Collectors.toSet());
        return skillWriteService.departmentOptionsForOrganization(details.organizationId()).stream()
            .filter(option -> !linked.contains(option.id()))
            .toList();
    }

    private void head(Model model, String pageTitle, String detailLabel) {
        model.addAttribute("pageTitle", pageTitle);
        model.addAttribute("activeNav", "skills");
        model.addAttribute("sectionLabel", "Skills");
        model.addAttribute("sectionHref", "/admin/skills");
        if (detailLabel != null) {
            model.addAttribute("detailLabel", detailLabel);
        }
    }

    private static UUID parseNullable(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(raw.trim());
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static void reject(BindingResult result, AdminValidationException ex) {
        if (ex.field() != null) {
            result.rejectValue(ex.field(), "invalid", ex.getMessage());
        } else {
            result.reject("invalid", ex.getMessage());
        }
    }
}
