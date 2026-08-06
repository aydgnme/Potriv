package me.aydgn.potriv.admin.controller;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.data.domain.Sort;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import me.aydgn.potriv.admin.security.AdminPrincipal;
import me.aydgn.potriv.admin.service.AdminProjectService;
import me.aydgn.potriv.admin.service.AdminProjectWriteService;
import me.aydgn.potriv.admin.service.AdminProjectWriteService.ProjectActionOutcome;
import me.aydgn.potriv.admin.support.AdminAccessGuard;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.support.AdminRequests;
import me.aydgn.potriv.admin.viewmodel.AdminProjectViews;
import me.aydgn.potriv.project.entity.ProjectStatus;

@Controller
public class AdminProjectController {

    private static final Set<String> SORTABLE =
        Set.of("name", "status", "deadlineDate", "updatedAt", "createdAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.DESC, "updatedAt");

    private final AdminAccessGuard guard;
    private final AdminProjectService projectService;
    private final AdminProjectWriteService projectWriteService;

    public AdminProjectController(
        AdminAccessGuard guard,
        AdminProjectService projectService,
        AdminProjectWriteService projectWriteService
    ) {
        this.guard = guard;
        this.projectService = projectService;
        this.projectWriteService = projectWriteService;
    }

    @GetMapping("/admin/projects")
    public String list(
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String page,
        @RequestParam(required = false) String size,
        @RequestParam(required = false) String sort,
        Model model
    ) {
        guard.requireEnabled();
        Sort resolvedSort = AdminRequests.sort(sort, SORTABLE, DEFAULT_SORT);

        // Parse the status filter defensively — an unknown value is ignored with
        // a visible message rather than throwing a binding error.
        ProjectStatus statusFilter = null;
        String appliedStatus = null;
        if (status != null && !status.isBlank()) {
            try {
                statusFilter = ProjectStatus.valueOf(status.trim().toUpperCase(Locale.ROOT));
                appliedStatus = statusFilter.name();
            } catch (IllegalArgumentException ignored) {
                model.addAttribute("filterError",
                    "Unknown status '" + status + "' — showing all projects.");
            }
        }

        Map<String, String> retained = new LinkedHashMap<>();
        retained.put("q", q);
        retained.put("status", appliedStatus);
        retained.put("size", AdminPaging.retainedSize(size));
        retained.put("sort", sort);
        String baseQuery = AdminRequests.baseQuery(retained);

        model.addAttribute("pageTitle", "Projects");
        model.addAttribute("activeNav", "projects");
        model.addAttribute("sectionLabel", "Projects");
        model.addAttribute("sectionHref", "/admin/projects");
        model.addAttribute("statuses", ProjectStatus.values());
        model.addAttribute("selectedStatus", appliedStatus);
        model.addAttribute("list", projectService.list(
            q, statusFilter, AdminPaging.of(page, size, resolvedSort), baseQuery));
        return "admin/projects/list";
    }

    @GetMapping("/admin/projects/{id}")
    public String detail(@PathVariable UUID id, Model model) {
        guard.requireEnabled();
        var details = projectService.details(id);
        populate(model, details);
        model.addAttribute("pageTitle", "Project · " + details.name());
        model.addAttribute("statusOptions", ProjectStatus.values());
        return "admin/projects/detail";
    }

    /**
     * Moves a project to another status. The lifecycle guards run first and can
     * veto, in which case nothing changes and the domain's own reason is shown.
     */
    @PostMapping("/admin/projects/{id}/status")
    public String changeStatus(
        @PathVariable UUID id,
        @RequestParam(required = false) String status,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes
    ) {
        guard.requireEnabled();
        flash(redirectAttributes, projectWriteService.changeStatus(id, status, principal));
        return "redirect:/admin/projects/" + id;
    }

    /** Deletion confirmation. Never mutates — the POST below does the work. */
    @GetMapping("/admin/projects/{id}/delete")
    public String deleteConfirm(@PathVariable UUID id, Model model) {
        guard.requireEnabled();
        var details = projectService.details(id);
        populate(model, details);
        model.addAttribute("pageTitle", "Delete · " + details.name());
        return "admin/projects/delete";
    }

    @PostMapping("/admin/projects/{id}/delete")
    public String delete(
        @PathVariable UUID id,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes
    ) {
        guard.requireEnabled();
        var outcome = projectWriteService.delete(id, principal);
        flash(redirectAttributes, outcome);
        // A deleted project has no detail page left to return to.
        return outcome.succeeded()
            ? "redirect:/admin/projects"
            : "redirect:/admin/projects/" + id;
    }

    private static void populate(Model model, AdminProjectViews.Details details) {
        model.addAttribute("activeNav", "projects");
        model.addAttribute("sectionLabel", "Projects");
        model.addAttribute("sectionHref", "/admin/projects");
        model.addAttribute("detailLabel", details.name());
        model.addAttribute("project", details);
    }

    private static void flash(
        RedirectAttributes redirectAttributes, ProjectActionOutcome outcome) {
        redirectAttributes.addFlashAttribute(
            outcome.succeeded() ? "adminSuccess" : "adminError", outcome.message());
    }
}
