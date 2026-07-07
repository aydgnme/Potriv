package me.aydgn.potriv.identity.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import me.aydgn.potriv.common.config.AuthProperties;
import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.exception.UnauthorizedException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.JwtService;
import me.aydgn.potriv.identity.dto.LoginRequest;
import me.aydgn.potriv.identity.dto.RefreshRequest;
import me.aydgn.potriv.identity.dto.TokenPairResponse;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.RefreshToken;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.entity.UserSession;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.identity.repository.UserSessionRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

@Service
public class JwtAuthenticationService {

    private static final Duration LAST_SEEN_UPDATE_INTERVAL = Duration.ofMinutes(5);

    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final UserSessionRepository userSessionRepository;
    private final RefreshTokenService refreshTokenService;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    private final int maxFailedLoginAttempts;
    private final Duration loginLockDuration;

    public JwtAuthenticationService(
        UserRepository userRepository,
        UserRoleRepository userRoleRepository,
        UserSessionRepository userSessionRepository,
        RefreshTokenService refreshTokenService,
        PasswordEncoder passwordEncoder,
        JwtService jwtService,
        AuthProperties authProperties
    ) {
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.userSessionRepository = userSessionRepository;
        this.refreshTokenService = refreshTokenService;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.maxFailedLoginAttempts = authProperties.maxFailedLoginAttempts();
        this.loginLockDuration = Duration.ofMinutes(authProperties.lockDurationMinutes());
    }

    // Failed-attempt and lockout updates must persist even though the login
    // request itself is rejected with an exception.
    @Transactional(noRollbackFor = BadRequestException.class)
    public TokenPairResponse login(LoginRequest request, String userAgent, String ipAddress) {
        String normalizedEmail = request.email().trim().toLowerCase();

        User user = userRepository.findByEmailForUpdate(normalizedEmail)
            .orElseThrow(JwtAuthenticationService::invalidCredentialsException);

        if (!user.isActive() || user.isLoginLocked()) {
            throw invalidCredentialsException();
        }

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            user.registerFailedLogin(maxFailedLoginAttempts, loginLockDuration);
            throw invalidCredentialsException();
        }

        user.resetLoginFailures();

        UserSession session = userSessionRepository.save(
            new UserSession(user, userAgent, ipAddress)
        );

        RefreshTokenService.IssuedRefreshToken issuedRefreshToken =
            refreshTokenService.issue(session);

        return buildTokenPairResponse(user, session, issuedRefreshToken.rawToken());
    }

    // Reuse detection must persist the session revocation even though the
    // request itself is rejected with an exception.
    @Transactional(noRollbackFor = UnauthorizedException.class)
    public TokenPairResponse refresh(RefreshRequest request) {
        RefreshToken presentedToken = refreshTokenService
            .findByRawToken(request.refreshToken())
            .orElseThrow(() -> new UnauthorizedException("Invalid refresh token."));

        UserSession session = presentedToken.getSession();

        if (presentedToken.isUsed() || presentedToken.isRevoked()) {
            session.revoke();
            refreshTokenService.revokeAllForSession(session);
            throw new UnauthorizedException("Invalid refresh token.");
        }

        if (presentedToken.isExpired()) {
            throw new UnauthorizedException("Invalid refresh token.");
        }

        if (session.isRevoked()) {
            throw new UnauthorizedException("Invalid refresh token.");
        }

        if (!session.getUser().isActive()) {
            throw new UnauthorizedException("Invalid refresh token.");
        }

        RefreshTokenService.IssuedRefreshToken issuedRefreshToken =
            refreshTokenService.issue(session);

        presentedToken.markUsed(issuedRefreshToken.token().getId());
        session.touch();

        return buildTokenPairResponse(session.getUser(), session, issuedRefreshToken.rawToken());
    }

    @Transactional
    public AuthenticatedUser authenticateAccessToken(String token) {
        Claims claims = jwtService.parseAccessToken(token);

        UUID userId = parseUuidClaim(claims.getSubject());
        UUID sessionId = parseUuidClaim(claims.get("sid", String.class));

        UserSession session = userSessionRepository.findById(sessionId)
            .orElseThrow(() -> new JwtException("Invalid or expired access token."));

        if (session.isRevoked()
            || !session.getUser().getId().equals(userId)
            || !session.getUser().isActive()) {
            throw new JwtException("Invalid or expired access token.");
        }

        // lastSeenAt is refreshed at most once per interval to avoid a
        // database write on every authenticated request.
        if (Duration.between(session.getLastSeenAt(), OffsetDateTime.now(ZoneOffset.UTC))
                .compareTo(LAST_SEEN_UPDATE_INTERVAL) >= 0) {
            session.touch();
        }

        User user = session.getUser();

        List<AccessRole> roles = getRoles(user);

        UUID organizationId = user.getOrganization() == null
            ? null
            : user.getOrganization().getId();

        return new AuthenticatedUser(
            user.getId(),
            session.getId(),
            organizationId,
            user.getEmail(),
            roles
        );
    }

    private TokenPairResponse buildTokenPairResponse(
        User user,
        UserSession session,
        String rawRefreshToken
    ) {
        List<AccessRole> roles = getRoles(user);

        String accessToken = jwtService.createAccessToken(user, roles, session.getId());

        UUID organizationId = user.getOrganization() == null
            ? null
            : user.getOrganization().getId();

        return new TokenPairResponse(
            accessToken,
            rawRefreshToken,
            "Bearer",
            jwtService.getAccessTokenExpiresInSeconds(),
            user.getId(),
            organizationId,
            user.getName(),
            user.getEmail(),
            roles
        );
    }

    private static BadRequestException invalidCredentialsException() {
        return new BadRequestException("Invalid email or password.");
    }

    private UUID parseUuidClaim(String value) {
        if (value == null) {
            throw new JwtException("Invalid or expired access token.");
        }

        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            throw new JwtException("Invalid or expired access token.");
        }
    }

    private List<AccessRole> getRoles(User user) {
        return userRoleRepository.findByUser(user)
            .stream()
            .map(UserRole::getRole)
            .toList();
    }
}
