package me.aydgn.potriv.admin.support;

import org.springframework.stereotype.Component;

import me.aydgn.potriv.ops.monitor.BackendMonitorProperties;

/**
 * Gates the admin UI behind the same enable flag as the monitor console. When
 * the console is disabled the admin routes answer with an anti-leak 404 instead
 * of revealing that they exist. HTTP Basic authentication itself is enforced
 * upstream by the shared {@code /admin/**} security chain.
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
