package me.aydgn.potriv.admin.support;

import org.springframework.stereotype.Component;

import me.aydgn.potriv.ops.monitor.BackendMonitorProperties;

/**
 * Gates the admin UI behind the console enable flag. When the console is
 * disabled the admin routes answer with an anti-leak 404 instead of revealing
 * that they exist. Authentication itself (the SYSTEM_ADMIN browser-session
 * login) is enforced upstream by the shared {@code /admin/**} security chain.
 */
@Component
public class AdminAccessGuard {

    private final BackendMonitorProperties properties;

    public AdminAccessGuard(BackendMonitorProperties properties) {
        this.properties = properties;
    }

    public void requireEnabled() {
        if (!properties.enabled()) {
            throw new AdminNotFoundException("Not found.");
        }
    }
}
