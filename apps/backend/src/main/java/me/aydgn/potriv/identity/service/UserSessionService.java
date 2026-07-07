package me.aydgn.potriv.identity.service;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.identity.dto.SessionResponse;
import me.aydgn.potriv.identity.entity.UserSession;
import me.aydgn.potriv.identity.repository.UserSessionRepository;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.service.SecurityAuditService;

@Service
public class UserSessionService {

    private final UserSessionRepository userSessionRepository;
    private final RefreshTokenService refreshTokenService;
    private final SecurityAuditService securityAuditService;

    public UserSessionService(
        UserSessionRepository userSessionRepository,
        RefreshTokenService refreshTokenService,
        SecurityAuditService securityAuditService
    ) {
        this.userSessionRepository = userSessionRepository;
        this.refreshTokenService = refreshTokenService;
        this.securityAuditService = securityAuditService;
    }

    @Transactional
    public void revokeCurrentSession(AuthenticatedUser currentUser) {
        userSessionRepository
            .findByIdAndUserId(currentUser.sessionId(), currentUser.userId())
            .ifPresent(this::revokeSession);

        securityAuditService.record(
            SecurityAuditEvent.builder(SecurityAuditEventType.LOGOUT, true)
                .userId(currentUser.userId())
                .organizationId(currentUser.organizationId())
                .sessionId(currentUser.sessionId())
                .actorUserId(currentUser.userId())
                .build()
        );
    }

    @Transactional
    public void revokeAllSessions(AuthenticatedUser currentUser) {
        revokeAllSessionsForUser(currentUser.userId());

        securityAuditService.record(
            SecurityAuditEvent.builder(SecurityAuditEventType.LOGOUT_ALL, true)
                .userId(currentUser.userId())
                .organizationId(currentUser.organizationId())
                .sessionId(currentUser.sessionId())
                .actorUserId(currentUser.userId())
                .build()
        );
    }

    @Transactional
    public void revokeAllSessionsForUser(UUID userId) {
        userSessionRepository
            .findByUserIdOrderByCreatedAtDesc(userId)
            .forEach(this::revokeSession);
    }

    @Transactional(readOnly = true)
    public List<SessionResponse> listSessions(AuthenticatedUser currentUser) {
        return userSessionRepository
            .findByUserIdOrderByCreatedAtDesc(currentUser.userId())
            .stream()
            .map(session -> toResponse(session, currentUser.sessionId()))
            .toList();
    }

    @Transactional
    public void revokeOwnedSession(AuthenticatedUser currentUser, UUID sessionId) {
        UserSession session = userSessionRepository
            .findByIdAndUserId(sessionId, currentUser.userId())
            .orElseThrow(() -> new NotFoundException("Session was not found."));

        revokeSession(session);

        securityAuditService.record(
            SecurityAuditEvent.builder(SecurityAuditEventType.SESSION_REVOKED, true)
                .userId(currentUser.userId())
                .organizationId(currentUser.organizationId())
                .sessionId(sessionId)
                .actorUserId(currentUser.userId())
                .build()
        );
    }

    private void revokeSession(UserSession session) {
        if (session.isRevoked()) {
            return;
        }

        session.revoke();
        refreshTokenService.revokeAllForSession(session);
    }

    private SessionResponse toResponse(UserSession session, UUID currentSessionId) {
        return new SessionResponse(
            session.getId(),
            session.getCreatedAt(),
            session.getLastSeenAt(),
            session.getRevokedAt(),
            session.getUserAgent(),
            session.getIpAddress(),
            session.getId().equals(currentSessionId)
        );
    }
}
