package me.aydgn.potriv.admin.service;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.admin.support.AdminListView;
import me.aydgn.potriv.admin.support.AdminNotFoundException;
import me.aydgn.potriv.admin.viewmodel.AdminAuditLogViews;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.repository.SecurityAuditEventRepository;

/**
 * Read-only view over security audit events. The free-form {@code details}
 * metadata is never exposed so no secret stored there can leak.
 */
@Service
public class AdminAuditLogService {

    private final SecurityAuditEventRepository auditEventRepository;

    public AdminAuditLogService(SecurityAuditEventRepository auditEventRepository) {
        this.auditEventRepository = auditEventRepository;
    }

    @Transactional(readOnly = true)
    public AdminListView<AdminAuditLogViews.ListItem> list(Pageable pageable, String baseQuery) {
        Page<SecurityAuditEvent> page = auditEventRepository.findAll(pageable);
        Page<AdminAuditLogViews.ListItem> mapped = page.map(event ->
            new AdminAuditLogViews.ListItem(
                event.getId(),
                event.getEventType().name(),
                actor(event),
                event.getActorUserId(),
                event.getIpAddress(),
                event.getCreatedAt()));
        return AdminListView.of(mapped, null, baseQuery);
    }

    @Transactional(readOnly = true)
    public AdminAuditLogViews.Details details(UUID id) {
        SecurityAuditEvent event = auditEventRepository.findById(id)
            .orElseThrow(() -> new AdminNotFoundException("Audit event was not found."));
        return new AdminAuditLogViews.Details(
            event.getId(),
            event.getEventType().name(),
            actor(event),
            event.getActorUserId(),
            event.getUserId(),
            event.getOrganizationId(),
            event.getSessionId(),
            event.getIpAddress(),
            event.getUserAgent(),
            event.getCreatedAt());
    }

    private static String actor(SecurityAuditEvent event) {
        if (event.getNormalizedEmail() != null && !event.getNormalizedEmail().isBlank()) {
            return event.getNormalizedEmail();
        }
        if (event.getActorUserId() != null) {
            return event.getActorUserId().toString();
        }
        return "—";
    }
}
