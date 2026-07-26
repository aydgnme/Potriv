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
import me.aydgn.potriv.admin.service.AdminDepartmentService;
import me.aydgn.potriv.admin.service.AdminDepartmentWriteService;
import me.aydgn.potriv.admin.support.AdminAccessGuard;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.support.AdminRequests;
import me.aydgn.potriv.admin.support.AdminValidationException;
import me.aydgn.potriv.admin.viewmodel.AdminDepartmentForms;

@Controller
public class AdminDepartmentController {

    private static final Set<String> SORTABLE = Set.of("name", "createdAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.ASC, "name");

    private final AdminAccessGuard guard;
    private final AdminDepartmentService departmentService;
    private final AdminDepartmentWriteService departmentWriteService;

    public AdminDepartmentController(
        AdminAccessGuard guard,
        AdminDepartmentService departmentService,
        AdminDepartmentWriteService departmentWriteService
    ) {
        this.guard = guard;
        this.departmentService = departmentService;
        this.departmentWriteService = departmentWriteService;
    }

    @GetMapping("/admin/departments")
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

        model.addAttribute("pageTitle", "Departments");
        model.addAttribute("activeNav", "departments");
        model.addAttribute("sectionLabel", "Departments");
        model.addAttribute("sectionHref", "/admin/departments");
        model.addAttribute("list",
            departmentService.list(q, AdminPaging.of(page, size, resolvedSort), baseQuery));
        return "admin/departments/list";
    }

    @GetMapping("/admin/departments/{id}")
    public String detail(@PathVariable UUID id, Model model) {
        guard.requireEnabled();
        var details = departmentService.details(id);
        model.addAttribute("pageTitle", "Department · " + details.name());
        model.addAttribute("activeNav", "departments");
        model.addAttribute("sectionLabel", "Departments");
        model.addAttribute("sectionHref", "/admin/departments");
        model.addAttribute("detailLabel", details.name());
        model.addAttribute("department", details);
        return "admin/departments/detail";
    }

    @GetMapping("/admin/departments/new")
    public String createForm(Model model) {
        guard.requireEnabled();
        if (!model.containsAttribute("form")) {
            model.addAttribute("form", new AdminDepartmentForms.CreateForm());
        }
        populateCreateModel(model);
        return "admin/departments/form";
    }

    @PostMapping("/admin/departments")
    public String create(
        @Valid @ModelAttribute("form") AdminDepartmentForms.CreateForm form,
        BindingResult result,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes,
        Model model
    ) {
        guard.requireEnabled();
        if (!result.hasErrors()) {
            try {
                UUID id = departmentWriteService.create(
                    form.getOrganizationId(), form.getName(), principal);
                redirectAttributes.addFlashAttribute("adminSuccess", "Department created.");
                return "redirect:/admin/departments/" + id;
            } catch (AdminValidationException ex) {
                rejectField(result, ex);
            }
        }
        populateCreateModel(model);
        return "admin/departments/form";
    }

    @GetMapping("/admin/departments/{id}/edit")
    public String editForm(@PathVariable UUID id, Model model) {
        guard.requireEnabled();
        var details = departmentService.details(id);
        if (!model.containsAttribute("form")) {
            model.addAttribute("form", new AdminDepartmentForms.EditForm(details.name()));
        }
        populateEditModel(model, details);
        return "admin/departments/form";
    }

    @PostMapping("/admin/departments/{id}/edit")
    public String update(
        @PathVariable UUID id,
        @Valid @ModelAttribute("form") AdminDepartmentForms.EditForm form,
        BindingResult result,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes,
        Model model
    ) {
        guard.requireEnabled();
        var details = departmentService.details(id);

        if (!result.hasErrors()) {
            try {
                departmentWriteService.update(id, form.getName(), principal);
                redirectAttributes.addFlashAttribute("adminSuccess", "Department updated.");
                return "redirect:/admin/departments/" + id;
            } catch (AdminValidationException ex) {
                rejectField(result, ex);
            }
        }
        populateEditModel(model, details);
        return "admin/departments/form";
    }

    @GetMapping("/admin/departments/{id}/delete")
    public String deleteConfirm(@PathVariable UUID id, Model model) {
        guard.requireEnabled();
        var details = departmentService.details(id);
        model.addAttribute("pageTitle", "Delete · " + details.name());
        model.addAttribute("activeNav", "departments");
        model.addAttribute("sectionLabel", "Departments");
        model.addAttribute("sectionHref", "/admin/departments");
        model.addAttribute("detailLabel", details.name());
        model.addAttribute("department", details);
        model.addAttribute("dependencies", departmentWriteService.dependencies(id));
        return "admin/departments/delete";
    }

    @PostMapping("/admin/departments/{id}/delete")
    public String delete(
        @PathVariable UUID id,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes
    ) {
        guard.requireEnabled();
        boolean deleted = departmentWriteService.delete(id, principal);
        if (deleted) {
            redirectAttributes.addFlashAttribute("adminSuccess", "Department deleted.");
            return "redirect:/admin/departments";
        }
        redirectAttributes.addFlashAttribute("adminError",
            "Department cannot be deleted because it has members, managers, skills, "
                + "proposals, allocations, or project history.");
        return "redirect:/admin/departments/" + id;
    }

    private void populateCreateModel(Model model) {
        model.addAttribute("pageTitle", "New department");
        model.addAttribute("activeNav", "departments");
        model.addAttribute("sectionLabel", "Departments");
        model.addAttribute("sectionHref", "/admin/departments");
        model.addAttribute("detailLabel", "New");
        model.addAttribute("formMode", "create");
        model.addAttribute("organizationOptions", departmentWriteService.organizationOptions());
    }

    private void populateEditModel(
        Model model, me.aydgn.potriv.admin.viewmodel.AdminDepartmentViews.Details details) {
        model.addAttribute("pageTitle", "Edit · " + details.name());
        model.addAttribute("activeNav", "departments");
        model.addAttribute("sectionLabel", "Departments");
        model.addAttribute("sectionHref", "/admin/departments");
        model.addAttribute("detailLabel", details.name());
        model.addAttribute("formMode", "edit");
        model.addAttribute("department", details);
    }

    private static void rejectField(BindingResult result, AdminValidationException ex) {
        if (ex.field() != null) {
            result.rejectValue(ex.field(), "invalid", ex.getMessage());
        } else {
            result.reject("invalid", ex.getMessage());
        }
    }
}
