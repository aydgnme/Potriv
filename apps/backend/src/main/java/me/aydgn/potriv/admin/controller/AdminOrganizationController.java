package me.aydgn.potriv.admin.controller;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

import me.aydgn.potriv.admin.service.AdminOrganizationService;
import me.aydgn.potriv.admin.support.AdminAccessGuard;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.support.AdminRequests;

@Controller
public class AdminOrganizationController {

    private static final Set<String> SORTABLE = Set.of("name", "createdAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.DESC, "createdAt");

    private final AdminAccessGuard guard;
    private final AdminOrganizationService organizationService;

    public AdminOrganizationController(
        AdminAccessGuard guard, AdminOrganizationService organizationService) {
        this.guard = guard;
        this.organizationService = organizationService;
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
}
