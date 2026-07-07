package me.aydgn.potriv.security.controller;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import me.aydgn.potriv.common.config.OpenApiConfig;
import me.aydgn.potriv.common.security.annotation.SystemAdminOnly;
import me.aydgn.potriv.security.dto.SecurityAuditEventResponse;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.service.SecurityAuditService;

@RestController
@RequestMapping("/admin/security")
@SystemAdminOnly
@Tag(name = "System Administration", description = "Platform-level user administration")
@SecurityRequirement(name = OpenApiConfig.BEARER_SECURITY_SCHEME)
public class AdminSecurityAuditController {

    private final SecurityAuditService securityAuditService;

    public AdminSecurityAuditController(SecurityAuditService securityAuditService) {
        this.securityAuditService = securityAuditService;
    }

    @GetMapping("/audit-events")
    public Page<SecurityAuditEventResponse> listAuditEvents(
        @RequestParam(required = false) SecurityAuditEventType eventType,
        @RequestParam(required = false) UUID userId,
        @RequestParam(required = false) UUID organizationId,
        @RequestParam(required = false) Boolean success,
        @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
        Pageable pageable
    ) {
        return securityAuditService.findEvents(
            eventType,
            userId,
            organizationId,
            success,
            pageable
        );
    }
}
