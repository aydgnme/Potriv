package me.aydgn.potriv.admin.controller;

import java.util.LinkedHashMap;
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
import me.aydgn.potriv.admin.service.AdminSkillCategoryService;
import me.aydgn.potriv.admin.service.AdminSkillCategoryWriteService;
import me.aydgn.potriv.admin.support.AdminAccessGuard;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.support.AdminRequests;
import me.aydgn.potriv.admin.support.AdminValidationException;
import me.aydgn.potriv.admin.viewmodel.AdminSkillCatalogForms;

@Controller
public class AdminSkillCategoryController {

    private static final Set<String> SORTABLE = Set.of("name", "createdAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.ASC, "name");

    private final AdminAccessGuard guard;
    private final AdminSkillCategoryService categoryService;
    private final AdminSkillCategoryWriteService categoryWriteService;

    public AdminSkillCategoryController(
        AdminAccessGuard guard,
        AdminSkillCategoryService categoryService,
        AdminSkillCategoryWriteService categoryWriteService
    ) {
        this.guard = guard;
        this.categoryService = categoryService;
        this.categoryWriteService = categoryWriteService;
    }

    @GetMapping("/admin/skill-categories")
    public String list(
        @RequestParam(required = false) String q,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String sort,
        Model model
    ) {
        guard.requireEnabled();
        Sort resolvedSort = AdminRequests.sort(sort, SORTABLE, DEFAULT_SORT);
        Map<String, String> retained = new LinkedHashMap<>();
        retained.put("q", q);
        retained.put("size", size == null ? null : size.toString());
        retained.put("sort", sort);
        String baseQuery = AdminRequests.baseQuery(retained);

        head(model, "Skill categories", null);
        model.addAttribute("list",
            categoryService.list(q, AdminPaging.of(page, size, resolvedSort), baseQuery));
        return "admin/skill-categories/list";
    }

    @GetMapping("/admin/skill-categories/{id}")
    public String detail(@PathVariable UUID id, Model model) {
        guard.requireEnabled();
        var details = categoryService.details(id);
        head(model, "Skill category · " + details.name(), details.name());
        model.addAttribute("category", details);
        return "admin/skill-categories/detail";
    }

    @GetMapping("/admin/skill-categories/new")
    public String createForm(Model model) {
        guard.requireEnabled();
        if (!model.containsAttribute("form")) {
            model.addAttribute("form", new AdminSkillCatalogForms.CategoryCreateForm());
        }
        head(model, "New skill category", "New");
        model.addAttribute("formMode", "create");
        model.addAttribute("organizationOptions", categoryWriteService.organizationOptions());
        return "admin/skill-categories/form";
    }

    @PostMapping("/admin/skill-categories")
    public String create(
        @Valid @ModelAttribute("form") AdminSkillCatalogForms.CategoryCreateForm form,
        BindingResult result,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes,
        Model model
    ) {
        guard.requireEnabled();
        if (!result.hasErrors()) {
            try {
                UUID id = categoryWriteService.create(
                    form.getOrganizationId(), form.getName(), principal);
                redirectAttributes.addFlashAttribute("adminSuccess", "Skill category created.");
                return "redirect:/admin/skill-categories/" + id;
            } catch (AdminValidationException ex) {
                reject(result, ex);
            }
        }
        head(model, "New skill category", "New");
        model.addAttribute("formMode", "create");
        model.addAttribute("organizationOptions", categoryWriteService.organizationOptions());
        return "admin/skill-categories/form";
    }

    @GetMapping("/admin/skill-categories/{id}/edit")
    public String editForm(@PathVariable UUID id, Model model) {
        guard.requireEnabled();
        var details = categoryService.details(id);
        if (!model.containsAttribute("form")) {
            model.addAttribute("form", new AdminSkillCatalogForms.CategoryEditForm(details.name()));
        }
        head(model, "Edit · " + details.name(), details.name());
        model.addAttribute("formMode", "edit");
        model.addAttribute("category", details);
        return "admin/skill-categories/form";
    }

    @PostMapping("/admin/skill-categories/{id}/edit")
    public String update(
        @PathVariable UUID id,
        @Valid @ModelAttribute("form") AdminSkillCatalogForms.CategoryEditForm form,
        BindingResult result,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes,
        Model model
    ) {
        guard.requireEnabled();
        var details = categoryService.details(id);
        if (!result.hasErrors()) {
            try {
                categoryWriteService.update(id, form.getName(), principal);
                redirectAttributes.addFlashAttribute("adminSuccess", "Skill category updated.");
                return "redirect:/admin/skill-categories/" + id;
            } catch (AdminValidationException ex) {
                reject(result, ex);
            }
        }
        head(model, "Edit · " + details.name(), details.name());
        model.addAttribute("formMode", "edit");
        model.addAttribute("category", details);
        return "admin/skill-categories/form";
    }

    private void head(Model model, String pageTitle, String detailLabel) {
        model.addAttribute("pageTitle", pageTitle);
        model.addAttribute("activeNav", "skill-categories");
        model.addAttribute("sectionLabel", "Skill categories");
        model.addAttribute("sectionHref", "/admin/skill-categories");
        if (detailLabel != null) {
            model.addAttribute("detailLabel", detailLabel);
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
