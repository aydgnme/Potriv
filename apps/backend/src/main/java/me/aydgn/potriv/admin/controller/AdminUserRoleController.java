package me.aydgn.potriv.admin.controller;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import me.aydgn.potriv.admin.security.AdminPrincipal;
import me.aydgn.potriv.admin.service.AdminUserRoleWriteService;
import me.aydgn.potriv.admin.service.AdminUserRoleWriteService.RoleActionOutcome;
import me.aydgn.potriv.admin.service.AdminUserService;
import me.aydgn.potriv.admin.support.AdminAccessGuard;
import me.aydgn.potriv.admin.viewmodel.AdminUserRoleForm;

/**
 * User role management, on the shared admin session boundary. Manageable roles
 * only ({@code SYSTEM_ADMIN} is never exposed here); every write is CSRF-guarded,
 * validated in the service layer, and redirect-after-POST with flash messages.
 */
@Controller
public class AdminUserRoleController {

    private final AdminAccessGuard guard;
    private final AdminUserService userService;
    private final AdminUserRoleWriteService roleWriteService;

    public AdminUserRoleController(
        AdminAccessGuard guard,
        AdminUserService userService,
        AdminUserRoleWriteService roleWriteService
    ) {
        this.guard = guard;
        this.userService = userService;
        this.roleWriteService = roleWriteService;
    }

    @GetMapping("/admin/users/{userId}/roles")
    public String roles(@PathVariable UUID userId, Model model) {
        guard.requireEnabled();
        var details = userService.details(userId);
        model.addAttribute("pageTitle", "Roles · " + details.name());
        model.addAttribute("activeNav", "users");
        model.addAttribute("sectionLabel", "Users");
        model.addAttribute("sectionHref", "/admin/users");
        model.addAttribute("detailLabel", details.name());
        model.addAttribute("user", details);
        model.addAttribute("roleRows", roleWriteService.roleRows(userId, details.roles()));
        return "admin/users/roles";
    }

    @PostMapping("/admin/users/{userId}/roles/grant")
    public String grant(
        @PathVariable UUID userId,
        @ModelAttribute AdminUserRoleForm form,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes
    ) {
        guard.requireEnabled();
        flash(redirectAttributes, roleWriteService.grant(userId, form.getRole(), principal));
        return "redirect:/admin/users/" + userId + "/roles";
    }

    @PostMapping("/admin/users/{userId}/roles/revoke")
    public String revoke(
        @PathVariable UUID userId,
        @ModelAttribute AdminUserRoleForm form,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes
    ) {
        guard.requireEnabled();
        flash(redirectAttributes, roleWriteService.revoke(userId, form.getRole(), principal));
        return "redirect:/admin/users/" + userId + "/roles";
    }

    private static void flash(RedirectAttributes redirectAttributes, RoleActionOutcome outcome) {
        if (outcome.kind() == RoleActionOutcome.Kind.BLOCKED) {
            redirectAttributes.addFlashAttribute("adminError", outcome.message());
        } else {
            redirectAttributes.addFlashAttribute("adminSuccess", outcome.message());
        }
    }
}
