package me.aydgn.potriv.ops.monitor;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import me.aydgn.potriv.common.exception.NotFoundException;

/**
 * Server-rendered, read-only monitoring console. Because the application runs
 * under the {@code /api} context path, the page is served at
 * {@code /api/admin/monitor}. When the console is disabled the route answers
 * 404 so its existence is not leaked.
 */
@Controller
public class BackendMonitorController {

    private final BackendMonitorService backendMonitorService;
    private final BackendMonitorProperties properties;

    public BackendMonitorController(
        BackendMonitorService backendMonitorService,
        BackendMonitorProperties properties
    ) {
        this.backendMonitorService = backendMonitorService;
        this.properties = properties;
    }

    @GetMapping("/admin/monitor")
    public String monitor(Model model) {
        if (!properties.enabled()) {
            throw new NotFoundException("Not found.");
        }
        model.addAttribute("monitor", backendMonitorService.snapshot());
        return "admin/monitor";
    }
}
