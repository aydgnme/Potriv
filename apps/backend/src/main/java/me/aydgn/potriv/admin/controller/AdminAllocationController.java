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

import me.aydgn.potriv.admin.service.AdminAllocationService;
import me.aydgn.potriv.admin.support.AdminAccessGuard;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.support.AdminRequests;

@Controller
public class AdminAllocationController {

    private static final Set<String> SORTABLE =
        Set.of("allocatedAt", "deallocatedAt", "workHoursPerDay");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.DESC, "allocatedAt");

    private final AdminAccessGuard guard;
    private final AdminAllocationService allocationService;

    public AdminAllocationController(
        AdminAccessGuard guard, AdminAllocationService allocationService) {
        this.guard = guard;
        this.allocationService = allocationService;
    }

    @GetMapping("/admin/allocations")
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
        boolean activeOnly = status != null
            && status.trim().toUpperCase(Locale.ROOT).equals("ACTIVE");

        Map<String, String> retained = new LinkedHashMap<>();
        retained.put("q", q);
        retained.put("status", activeOnly ? "ACTIVE" : null);
        retained.put("size", size == null ? null : size.toString());
        retained.put("sort", sort);
        String baseQuery = AdminRequests.baseQuery(retained);

        model.addAttribute("pageTitle", "Allocations");
        model.addAttribute("activeNav", "allocations");
        model.addAttribute("sectionLabel", "Allocations");
        model.addAttribute("sectionHref", "/admin/allocations");
        model.addAttribute("activeOnly", activeOnly);
        model.addAttribute("list", allocationService.list(
            q, activeOnly, AdminPaging.of(page, size, resolvedSort), baseQuery));
        return "admin/allocations/list";
    }

    @GetMapping("/admin/allocations/{id}")
    public String detail(@PathVariable UUID id, Model model) {
        guard.requireEnabled();
        var details = allocationService.details(id);
        model.addAttribute("pageTitle", "Allocation · " + details.employeeName());
        model.addAttribute("activeNav", "allocations");
        model.addAttribute("sectionLabel", "Allocations");
        model.addAttribute("sectionHref", "/admin/allocations");
        model.addAttribute("detailLabel", details.employeeName() + " → " + details.projectName());
        model.addAttribute("allocation", details);
        return "admin/allocations/detail";
    }
}
