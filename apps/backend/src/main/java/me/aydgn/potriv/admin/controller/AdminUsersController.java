package me.aydgn.potriv.admin.controller;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.data.domain.Sort;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import jakarta.validation.Valid;
import me.aydgn.potriv.admin.security.AdminPrincipal;
import me.aydgn.potriv.admin.service.AdminUserService;
import me.aydgn.potriv.admin.service.AdminUserWriteService;
import me.aydgn.potriv.admin.service.AdminUserWriteService.StatusOutcome;
import me.aydgn.potriv.admin.support.AdminAccessGuard;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.admin.support.AdminRequests;
import me.aydgn.potriv.admin.support.AdminValidationException;
import me.aydgn.potriv.admin.viewmodel.AdminUserForms;

@Controller
public class AdminUsersController {

    private static final Set<String> SORTABLE =
        Set.of("name", "email", "status", "createdAt", "updatedAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.DESC, "createdAt");

    private final AdminAccessGuard guard;
    private final AdminUserService userService;
    private final AdminUserWriteService userWriteService;

    public AdminUsersController(
        AdminAccessGuard guard,
        AdminUserService userService,
        AdminUserWriteService userWriteService
    ) {
        this.guard = guard;
        this.userService = userService;
        this.userWriteService = userWriteService;
    }

    @GetMapping("/admin/users")
    public String list(
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String page,
        @RequestParam(required = false) String size,
        @RequestParam(required = false) String sort,
        Model model
    ) {
        guard.requireEnabled();
        Sort resolvedSort = AdminRequests.sort(sort, SORTABLE, DEFAULT_SORT);
        Map<String, String> retained = new LinkedHashMap<>();
        retained.put("q", q);
        retained.put("size", AdminPaging.retainedSize(size));
        retained.put("sort", sort);
        String baseQuery = AdminRequests.baseQuery(retained);

        head(model, "Users", null);
        model.addAttribute("list",
            userService.list(q, AdminPaging.of(page, size, resolvedSort), baseQuery));
        return "admin/users/list";
    }

    @GetMapping("/admin/users/{id}")
    public String detail(@PathVariable UUID id, Model model) {
        guard.requireEnabled();
        var details = userService.details(id);
        head(model, "User · " + details.name(), details.name());
        model.addAttribute("user", details);
        return "admin/users/detail";
    }

    @GetMapping("/admin/users/{id}/edit")
    public String editForm(@PathVariable UUID id, Model model) {
        guard.requireEnabled();
        var details = userService.details(id);
        if (!model.containsAttribute("form")) {
            model.addAttribute("form", new AdminUserForms.NameEditForm(details.name()));
        }
        head(model, "Edit · " + details.name(), details.name());
        model.addAttribute("user", details);
        return "admin/users/form";
    }

    @PostMapping("/admin/users/{id}/edit")
    public String update(
        @PathVariable UUID id,
        @Valid @ModelAttribute("form") AdminUserForms.NameEditForm form,
        BindingResult result,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes,
        Model model
    ) {
        guard.requireEnabled();
        var details = userService.details(id);
        if (!result.hasErrors()) {
            try {
                userWriteService.updateName(id, form.getName(), principal);
                redirectAttributes.addFlashAttribute("adminSuccess", "User updated.");
                return "redirect:/admin/users/" + id;
            } catch (AdminValidationException ex) {
                if (ex.field() != null) {
                    result.rejectValue(ex.field(), "invalid", ex.getMessage());
                } else {
                    result.reject("invalid", ex.getMessage());
                }
            }
        }
        head(model, "Edit · " + details.name(), details.name());
        model.addAttribute("user", details);
        return "admin/users/form";
    }

    @PostMapping("/admin/users/{id}/activate")
    public String activate(
        @PathVariable UUID id,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes
    ) {
        guard.requireEnabled();
        boolean changed = userWriteService.activate(id, principal);
        redirectAttributes.addFlashAttribute("adminSuccess",
            changed ? "User activated." : "User is already active.");
        return "redirect:/admin/users/" + id;
    }

    @PostMapping("/admin/users/{id}/suspend")
    public String suspend(
        @PathVariable UUID id,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes
    ) {
        guard.requireEnabled();
        StatusOutcome outcome = userWriteService.suspend(id, principal);
        switch (outcome) {
            case CHANGED -> redirectAttributes.addFlashAttribute("adminSuccess", "User suspended.");
            case UNCHANGED -> redirectAttributes.addFlashAttribute("adminSuccess",
                "User is already suspended.");
            case BLOCKED_SELF -> redirectAttributes.addFlashAttribute("adminError",
                "You cannot suspend your own account.");
            case BLOCKED_LAST_ADMIN -> redirectAttributes.addFlashAttribute("adminError",
                "You cannot suspend the last active SYSTEM_ADMIN.");
            default -> { }
        }
        return "redirect:/admin/users/" + id;
    }

    @PostMapping("/admin/users/{id}/unlock")
    public String unlock(
        @PathVariable UUID id,
        @AuthenticationPrincipal AdminPrincipal principal,
        RedirectAttributes redirectAttributes
    ) {
        guard.requireEnabled();
        userWriteService.unlock(id, principal);
        redirectAttributes.addFlashAttribute("adminSuccess",
            "Lockout cleared and failed logins reset.");
        return "redirect:/admin/users/" + id;
    }

    private void head(Model model, String pageTitle, String detailLabel) {
        model.addAttribute("pageTitle", pageTitle);
        model.addAttribute("activeNav", "users");
        model.addAttribute("sectionLabel", "Users");
        model.addAttribute("sectionHref", "/admin/users");
        if (detailLabel != null) {
            model.addAttribute("detailLabel", detailLabel);
        }
    }
}
