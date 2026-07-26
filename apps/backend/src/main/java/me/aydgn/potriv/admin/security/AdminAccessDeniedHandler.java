package me.aydgn.potriv.admin.security;

import java.io.IOException;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Renders an admin-styled 403 for an authenticated admin request that is not
 * authorized — never a JSON body or a stack trace. In practice this rarely
 * fires because non-SYSTEM_ADMIN users are rejected at authentication time.
 */
@Component
public class AdminAccessDeniedHandler implements AccessDeniedHandler {

    @Override
    public void handle(
        HttpServletRequest request,
        HttpServletResponse response,
        AccessDeniedException accessDeniedException
    ) throws IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("text/html;charset=UTF-8");
        String loginHref = request.getContextPath() + "/admin/login";
        String ctx = request.getContextPath();
        response.getWriter().write(
            "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
                + "<title>403 · Potriv Admin</title>"
                + "<link rel=\"stylesheet\" href=\"" + ctx + "/admin/css/admin.css\">"
                + "<link rel=\"stylesheet\" href=\"" + ctx + "/admin/css/components.css\">"
                + "</head><body>"
                + "<div class=\"admin-error\"><div class=\"admin-error-code\">403</div>"
                + "<p>Your account is not authorized for the Potriv administration console.</p>"
                + "<a class=\"admin-btn\" href=\"" + loginHref + "\">Back to sign in</a>"
                + "</div></body></html>");
    }
}
