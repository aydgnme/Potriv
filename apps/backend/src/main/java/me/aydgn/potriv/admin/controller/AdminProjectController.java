package me.aydgn.potriv.admin.controller;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

import me.aydgn.potriv.admin.service.AdminProjectService;
import me.aydgn.potriv.admin.support.AdminAccessGuard;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.support.AdminRequests;
import me.aydgn.potriv.project.entity.ProjectStatus;

@Controller
public class AdminProjectController {

    private static final Set<String> SORTABLE =
        Set.of("name", "status", "deadlineDate", "updatedAt", "createdAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.DESC, "updatedAt");

    private final AdminAccessGuard guard;
    private final AdminProjectService projectService;

    public AdminProjectController(AdminAccessGuard guard, AdminProjectService projectService) {
        this.guard = guard;
        this.projectService = projectService;
    }

    @GetMapping("/admin/projects")
    public String list(
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size,
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
        retained.put("size", size == null ? null : size.toString());
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
        model.addAttribute("pageTitle", "Project · " + details.name());
        model.addAttribute("activeNav", "projects");
        model.addAttribute("sectionLabel", "Projects");
        model.addAttribute("sectionHref", "/admin/projects");
        model.addAttribute("detailLabel", details.name());
        model.addAttribute("project", details);
        return "admin/projects/detail";
    }
}
