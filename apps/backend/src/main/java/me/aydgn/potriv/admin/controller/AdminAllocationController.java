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

import me.aydgn.potriv.admin.service.AdminAllocationService;
import me.aydgn.potriv.admin.support.AdminAccessGuard;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.support.AdminRequests;
import me.aydgn.potriv.admin.viewmodel.AdminAllocationViews;

@Controller
public class AdminAllocationController {

    private static final Set<String> SORTABLE =
        Set.of("allocatedAt", "deallocatedAt", "workHoursPerDay");
    private static final java.util.List<Integer> PAGE_SIZES = java.util.List.of(25, 50, 100);
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
        @RequestParam(required = false) String organizationId,
        @RequestParam(required = false) String projectId,
        @RequestParam(required = false) String employeeId,
        @RequestParam(required = false) String departmentId,
        @RequestParam(required = false) String from,
        @RequestParam(required = false) String to,
        @RequestParam(required = false) String page,
        @RequestParam(required = false) String size,
        @RequestParam(required = false) String sort,
        Model model
    ) {
        guard.requireEnabled();
        Sort resolvedSort = AdminRequests.sort(sort, SORTABLE, DEFAULT_SORT);
        AdminAllocationViews.Filter filter = new AdminAllocationViews.Filter(
            q, status, organizationId, projectId, employeeId, departmentId, from, to);

        Map<String, String> retained = new LinkedHashMap<>();
        retained.put("q", q);
        retained.put("status", status);
        retained.put("organizationId", organizationId);
        retained.put("projectId", projectId);
        retained.put("employeeId", employeeId);
        retained.put("departmentId", departmentId);
        retained.put("from", from);
        retained.put("to", to);
        retained.put("size", AdminPaging.retainedSize(size));
        retained.put("sort", sort);
        String baseQuery = AdminRequests.baseQuery(retained);

        model.addAttribute("pageTitle", "Allocations");
        model.addAttribute("activeNav", "allocations");
        model.addAttribute("sectionLabel", "Allocations");
        model.addAttribute("sectionHref", "/admin/allocations");
        model.addAttribute("filter", filter);
        model.addAttribute("pageSizes", PAGE_SIZES);
        model.addAttribute("selectedSize", AdminPaging.size(size));
        model.addAttribute("list", allocationService.list(
            filter, AdminPaging.of(page, size, resolvedSort), baseQuery));
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
