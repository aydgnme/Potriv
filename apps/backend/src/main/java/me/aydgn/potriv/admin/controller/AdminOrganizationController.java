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
import me.aydgn.potriv.admin.service.AdminOrganizationService;
import me.aydgn.potriv.admin.service.AdminOrganizationWriteService;
import me.aydgn.potriv.admin.support.AdminAccessGuard;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.support.AdminRequests;
import me.aydgn.potriv.admin.support.AdminValidationException;
import me.aydgn.potriv.admin.viewmodel.AdminOrganizationForms;

@Controller
public class AdminOrganizationController {

    private static final Set<String> SORTABLE = Set.of("name", "createdAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.DESC, "createdAt");

    private final AdminAccessGuard guard;
    private final AdminOrganizationService organizationService;
    private final AdminOrganizationWriteService organizationWriteService;

    public AdminOrganizationController(
        AdminAccessGuard guard,
        AdminOrganizationService organizationService,
        AdminOrganizationWriteService organizationWriteService
    ) {
        this.guard = guard;
        this.organizationService = organizationService;
        this.organizationWriteService = organizationWriteService;
    }

    @GetMapping("/admin/organizations")
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

        model.addAttribute("pageTitle", "Organizations");
        model.addAttribute("activeNav", "organizations");
        model.addAttribute("sectionLabel", "Organizations");
        model.addAttribute("sectionHref", "/admin/organizations");
        model.addAttribute("list",
            organizationService.list(q, AdminPaging.of(page, size, resolvedSort), baseQuery));
        return "admin/organizations/list";
    }

    @GetMapping("/admin/organizations/{id}")
    public String detail(@PathVariable UUID id, Model model) {
        guard.requireEnabled();
        var details = organizationService.details(id);
        model.addAttribute("pageTitle", "Organization · " + details.name());
        model.addAttribute("activeNav", "organizations");
        model.addAttribute("sectionLabel", "Organizations");
        model.addAttribute("sectionHref", "/admin/organizations");
        model.addAttribute("detailLabel", details.name());
        model.addAttribute("organization", details);
        return "admin/organizations/detail";
    }

    @GetMapping("/admin/organizations/{id}/edit")
    public String editForm(@PathVariable UUID id, Model model) {
        guard.requireEnabled();
        var details = organizationService.details(id);
        if (!model.containsAttribute("form")) {
            model.addAttribute("form", new AdminOrganizationForms.EditForm(details.name()));
        }
        populateEditModel(model, id, details.name());
        return "admin/organizations/form";
    }

    @PostMapping("/admin/organizations/{id}/edit")
    public String update(
        @PathVariable UUID id,
        @Valid @ModelAttribute("form") AdminOrganizationForms.EditForm form,
        BindingResult result,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes,
        Model model
    ) {
        guard.requireEnabled();
        var details = organizationService.details(id);

        if (!result.hasErrors()) {
            try {
                organizationWriteService.updateName(id, form.getName(), principal);
                redirectAttributes.addFlashAttribute("adminSuccess", "Organization updated.");
                return "redirect:/admin/organizations/" + id;
            } catch (AdminValidationException ex) {
                rejectField(result, ex);
            }
        }
        populateEditModel(model, id, details.name());
        return "admin/organizations/form";
    }

    private void populateEditModel(Model model, UUID id, String currentName) {
        model.addAttribute("pageTitle", "Edit · " + currentName);
        model.addAttribute("activeNav", "organizations");
        model.addAttribute("sectionLabel", "Organizations");
        model.addAttribute("sectionHref", "/admin/organizations");
        model.addAttribute("detailLabel", currentName);
        model.addAttribute("organizationId", id);
        model.addAttribute("organizationName", currentName);
    }

    private static void rejectField(BindingResult result, AdminValidationException ex) {
        if (ex.field() != null) {
            result.rejectValue(ex.field(), "invalid", ex.getMessage());
        } else {
            result.reject("invalid", ex.getMessage());
        }
    }
}
