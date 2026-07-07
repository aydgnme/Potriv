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

@Service
public class UserSessionService {

    private final UserSessionRepository userSessionRepository;
    private final RefreshTokenService refreshTokenService;

    public UserSessionService(
        UserSessionRepository userSessionRepository,
        RefreshTokenService refreshTokenService
    ) {
        this.userSessionRepository = userSessionRepository;
        this.refreshTokenService = refreshTokenService;
    }

    @Transactional
    public void revokeCurrentSession(AuthenticatedUser currentUser) {
        userSessionRepository
            .findByIdAndUserId(currentUser.sessionId(), currentUser.userId())
            .ifPresent(this::revokeSession);
    }

    @Transactional
    public void revokeAllSessions(AuthenticatedUser currentUser) {
        revokeAllSessionsForUser(currentUser.userId());
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
