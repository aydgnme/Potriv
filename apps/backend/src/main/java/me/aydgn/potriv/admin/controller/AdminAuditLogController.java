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

import me.aydgn.potriv.admin.service.AdminAuditLogService;
import me.aydgn.potriv.admin.support.AdminAccessGuard;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.support.AdminRequests;

@Controller
public class AdminAuditLogController {

    private static final Set<String> SORTABLE = Set.of("createdAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.DESC, "createdAt");

    private final AdminAccessGuard guard;
    private final AdminAuditLogService auditLogService;

    public AdminAuditLogController(AdminAccessGuard guard, AdminAuditLogService auditLogService) {
        this.guard = guard;
        this.auditLogService = auditLogService;
    }

    @GetMapping("/admin/audit-logs")
    public String list(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String sort,
        Model model
    ) {
        guard.requireEnabled();
        Sort resolvedSort = AdminRequests.sort(sort, SORTABLE, DEFAULT_SORT);
        Map<String, String> retained = new LinkedHashMap<>();
        retained.put("size", size == null ? null : size.toString());
        retained.put("sort", sort);
        String baseQuery = AdminRequests.baseQuery(retained);

        model.addAttribute("pageTitle", "Audit Logs");
        model.addAttribute("activeNav", "audit-logs");
        model.addAttribute("sectionLabel", "Audit Logs");
        model.addAttribute("sectionHref", "/admin/audit-logs");
        model.addAttribute("list",
            auditLogService.list(AdminPaging.of(page, size, resolvedSort), baseQuery));
        return "admin/audit-logs/list";
    }

    @GetMapping("/admin/audit-logs/{id}")
    public String detail(@PathVariable UUID id, Model model) {
        guard.requireEnabled();
        var details = auditLogService.details(id);
        model.addAttribute("pageTitle", "Audit Event · " + details.eventType());
        model.addAttribute("activeNav", "audit-logs");
        model.addAttribute("sectionLabel", "Audit Logs");
        model.addAttribute("sectionHref", "/admin/audit-logs");
        model.addAttribute("detailLabel", details.eventType());
        model.addAttribute("event", details);
        return "admin/audit-logs/detail";
    }
}
