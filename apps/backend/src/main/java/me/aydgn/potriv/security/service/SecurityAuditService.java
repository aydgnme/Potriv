package me.aydgn.potriv.security.service;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.security.dto.SecurityAuditEventResponse;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.repository.SecurityAuditEventRepository;

@Service
public class SecurityAuditService {

    private final SecurityAuditEventRepository securityAuditEventRepository;

    public SecurityAuditService(SecurityAuditEventRepository securityAuditEventRepository) {
        this.securityAuditEventRepository = securityAuditEventRepository;
    }

    @Transactional
    public void record(SecurityAuditEvent event) {
        securityAuditEventRepository.save(event);
    }

    @Transactional(readOnly = true)
    public Page<SecurityAuditEventResponse> findEvents(
        SecurityAuditEventType eventType,
        UUID userId,
        UUID organizationId,
        Boolean success,
        Pageable pageable
    ) {
        Specification<SecurityAuditEvent> specification = Specification.allOf(
            eventType == null ? null
                : (root, query, cb) -> cb.equal(root.get("eventType"), eventType),
            userId == null ? null
                : (root, query, cb) -> cb.equal(root.get("userId"), userId),
            organizationId == null ? null
                : (root, query, cb) -> cb.equal(root.get("organizationId"), organizationId),
            success == null ? null
                : (root, query, cb) -> cb.equal(root.get("success"), success)
        );

        return securityAuditEventRepository
            .findAll(specification, pageable)
            .map(SecurityAuditService::toResponse);
    }

    private static SecurityAuditEventResponse toResponse(SecurityAuditEvent event) {
        return new SecurityAuditEventResponse(
            event.getId(),
            event.getEventType(),
            event.getUserId(),
            event.getOrganizationId(),
            event.getSessionId(),
            event.getActorUserId(),
            event.getNormalizedEmail(),
            event.getIpAddress(),
            event.getUserAgent(),
            event.isSuccess(),
            event.getDetails(),
            event.getCreatedAt()
        );
    }
}
