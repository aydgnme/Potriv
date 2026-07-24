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

import me.aydgn.potriv.admin.service.AdminUserService;
import me.aydgn.potriv.admin.support.AdminAccessGuard;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.support.AdminRequests;

@Controller
public class AdminUsersController {

    private static final Set<String> SORTABLE =
        Set.of("name", "email", "status", "createdAt", "updatedAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.DESC, "createdAt");

    private final AdminAccessGuard guard;
    private final AdminUserService userService;

    public AdminUsersController(AdminAccessGuard guard, AdminUserService userService) {
        this.guard = guard;
        this.userService = userService;
    }

    @GetMapping("/admin/users")
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

        model.addAttribute("pageTitle", "Users");
        model.addAttribute("activeNav", "users");
        model.addAttribute("sectionLabel", "Users");
        model.addAttribute("sectionHref", "/admin/users");
        model.addAttribute("list",
            userService.list(q, AdminPaging.of(page, size, resolvedSort), baseQuery));
        return "admin/users/list";
    }

    @GetMapping("/admin/users/{id}")
    public String detail(@PathVariable UUID id, Model model) {
        guard.requireEnabled();
        var details = userService.details(id);
        model.addAttribute("pageTitle", "User · " + details.name());
        model.addAttribute("activeNav", "users");
        model.addAttribute("sectionLabel", "Users");
        model.addAttribute("sectionHref", "/admin/users");
        model.addAttribute("detailLabel", details.name());
        model.addAttribute("user", details);
        return "admin/users/detail";
    }
}
