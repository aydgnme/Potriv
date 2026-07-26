package me.aydgn.potriv.admin.controller;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import me.aydgn.potriv.admin.support.AdminAccessGuard;

/**
 * Renders the admin sign-in page. The POST login and logout are handled by the
 * Spring Security filter chain (see {@code AdminSecurityConfig}), not here.
 */
@Controller
public class AdminLoginController {

    private final AdminAccessGuard guard;

    public AdminLoginController(AdminAccessGuard guard) {
        this.guard = guard;
    }

    @GetMapping("/admin/login")
    public String login(
        @RequestParam(required = false) String error,
        @RequestParam(required = false) String logout,
        Model model
    ) {
        guard.requireEnabled();
        model.addAttribute("pageTitle", "Sign in");
        if (error != null) {
            model.addAttribute("loginError", "Invalid email or password.");
        }
        if (logout != null) {
            model.addAttribute("logoutMessage", "You have been signed out.");
        }
        return "admin/auth/login";
    }
}
