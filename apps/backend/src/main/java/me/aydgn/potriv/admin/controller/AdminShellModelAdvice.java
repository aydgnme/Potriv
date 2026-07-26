package me.aydgn.potriv.admin.controller;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;

import me.aydgn.potriv.admin.security.AdminPrincipal;

/**
 * Exposes the authenticated admin principal to every admin page so the shell
 * topbar can show the signed-in identity and a logout form. Scoped to the admin
 * controller and backend-monitor packages (both render inside the admin shell);
 * never touches the REST API.
 */
@ControllerAdvice(basePackages = {
    "me.aydgn.potriv.admin.controller",
    "me.aydgn.potriv.ops.monitor"
})
public class AdminShellModelAdvice {

    @ModelAttribute
    public void addAdminPrincipal(Model model) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null
            && authentication.getPrincipal() instanceof AdminPrincipal principal) {
            model.addAttribute("adminPrincipal", principal);
        }
    }
}
