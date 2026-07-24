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

import me.aydgn.potriv.admin.service.AdminDepartmentService;
import me.aydgn.potriv.admin.support.AdminAccessGuard;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.support.AdminRequests;

@Controller
public class AdminDepartmentController {

    private static final Set<String> SORTABLE = Set.of("name", "createdAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.ASC, "name");

    private final AdminAccessGuard guard;
    private final AdminDepartmentService departmentService;

    public AdminDepartmentController(
        AdminAccessGuard guard, AdminDepartmentService departmentService) {
        this.guard = guard;
        this.departmentService = departmentService;
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
}
