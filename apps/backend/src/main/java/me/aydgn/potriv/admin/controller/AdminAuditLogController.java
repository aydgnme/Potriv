package me.aydgn.potriv.admin.controller;

import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
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
import me.aydgn.potriv.admin.support.AdminAuditQuery;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.support.AdminRequests;
import me.aydgn.potriv.admin.viewmodel.AdminAuditLogViews;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;

/**
 * Audit event review. Read-only and GET-only: this controller never mutates an
 * audit row, and the console offers no way to delete, edit or export one.
 *
 * <p>Every filter arrives as raw text and is parsed leniently by
 * {@link AdminAuditQuery} — an unreadable value is dropped rather than thrown,
 * so a hand-edited query string narrows the result set instead of rendering the
 * 500 page that the admin error advice produces for any escaping exception.
 */
@Controller
public class AdminAuditLogController {

    private static final Set<String> SORTABLE = Set.of("createdAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.DESC, "createdAt");
    /**
     * Audit rows written by one request share a timestamp, so paging is only
     * deterministic with a tiebreaker; id is the one column guaranteed unique.
     */
    private static final Sort TIEBREAKER = Sort.by(Sort.Direction.DESC, "id");
    private static final List<Integer> PAGE_SIZES = List.of(25, 50, 100);

    private final AdminAccessGuard guard;
    private final AdminAuditLogService auditLogService;

    public AdminAuditLogController(AdminAccessGuard guard, AdminAuditLogService auditLogService) {
        this.guard = guard;
        this.auditLogService = auditLogService;
    }

    @GetMapping("/admin/audit-logs")
    public String list(
        @RequestParam(required = false) String eventType,
        @RequestParam(required = false) String outcome,
        @RequestParam(required = false) String organizationId,
        @RequestParam(required = false) String actor,
        @RequestParam(required = false) String ip,
        @RequestParam(required = false) String from,
        @RequestParam(required = false) String to,
        @RequestParam(required = false) String page,
        @RequestParam(required = false) String size,
        @RequestParam(required = false) String sort,
        Model model
    ) {
        guard.requireEnabled();
        AdminAuditLogViews.Filter filter = new AdminAuditLogViews.Filter(
            eventType, outcome, organizationId, actor, ip, from, to);
        Sort resolvedSort = AdminRequests.sort(sort, SORTABLE, DEFAULT_SORT).and(TIEBREAKER);

        Map<String, String> retained = AdminAuditQuery.retainedParams(filter);
        retained.put("size", size);
        retained.put("sort", sort);
        String baseQuery = AdminRequests.baseQuery(retained);

        model.addAttribute("pageTitle", "Audit Logs");
        model.addAttribute("activeNav", "audit-logs");
        model.addAttribute("sectionLabel", "Audit Logs");
        model.addAttribute("sectionHref", "/admin/audit-logs");
        model.addAttribute("filter", filter);
        model.addAttribute("eventTypes", eventTypeOptions());
        model.addAttribute("pageSizes", PAGE_SIZES);
        model.addAttribute("selectedSize", AdminPaging.number(size));
        model.addAttribute("list", auditLogService.list(filter,
            AdminPaging.of(AdminPaging.number(page), AdminPaging.number(size), resolvedSort),
            baseQuery));
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

    /** Every recorded event type, alphabetically — the enum's own order is thematic. */
    private static List<String> eventTypeOptions() {
        return Arrays.stream(SecurityAuditEventType.values())
            .map(Enum::name)
            .sorted(Comparator.naturalOrder())
            .toList();
    }
}
