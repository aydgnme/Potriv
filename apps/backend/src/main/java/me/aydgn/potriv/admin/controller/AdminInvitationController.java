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

import me.aydgn.potriv.admin.service.AdminInvitationService;
import me.aydgn.potriv.admin.support.AdminAccessGuard;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.support.AdminRequests;

@Controller
public class AdminInvitationController {

    private static final Set<String> SORTABLE = Set.of("createdAt", "expiresAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.DESC, "createdAt");

    private final AdminAccessGuard guard;
    private final AdminInvitationService invitationService;

    public AdminInvitationController(
        AdminAccessGuard guard, AdminInvitationService invitationService) {
        this.guard = guard;
        this.invitationService = invitationService;
    }

    @GetMapping("/admin/invitations")
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

        model.addAttribute("pageTitle", "Invitations");
        model.addAttribute("activeNav", "invitations");
        model.addAttribute("sectionLabel", "Invitations");
        model.addAttribute("sectionHref", "/admin/invitations");
        model.addAttribute("list",
            invitationService.list(q, AdminPaging.of(page, size, resolvedSort), baseQuery));
        return "admin/invitations/list";
    }

    @GetMapping("/admin/invitations/{id}")
    public String detail(@PathVariable UUID id, Model model) {
        guard.requireEnabled();
        var details = invitationService.details(id);
        model.addAttribute("pageTitle", "Invitation · " + details.organizationName());
        model.addAttribute("activeNav", "invitations");
        model.addAttribute("sectionLabel", "Invitations");
        model.addAttribute("sectionHref", "/admin/invitations");
        model.addAttribute("detailLabel", details.organizationName());
        model.addAttribute("invitation", details);
        return "admin/invitations/detail";
    }
}
