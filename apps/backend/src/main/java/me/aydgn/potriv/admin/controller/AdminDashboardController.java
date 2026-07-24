package me.aydgn.potriv.admin.controller;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import me.aydgn.potriv.admin.service.AdminDashboardService;
import me.aydgn.potriv.admin.support.AdminAccessGuard;

@Controller
public class AdminDashboardController {

    private final AdminAccessGuard guard;
    private final AdminDashboardService dashboardService;

    public AdminDashboardController(
        AdminAccessGuard guard, AdminDashboardService dashboardService) {
        this.guard = guard;
        this.dashboardService = dashboardService;
    }

    @GetMapping("/admin")
    public String dashboard(Model model) {
        guard.requireEnabled();
        model.addAttribute("pageTitle", "Dashboard");
        model.addAttribute("activeNav", "dashboard");
        model.addAttribute("dashboard", dashboardService.build());
        return "admin/dashboard/index";
    }
}
