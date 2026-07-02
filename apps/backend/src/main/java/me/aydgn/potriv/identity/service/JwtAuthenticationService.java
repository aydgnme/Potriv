package me.aydgn.potriv.identity.service;

import io.jsonwebtoken.Claims;
import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.JwtService;
import me.aydgn.potriv.identity.dto.LoginRequest;
import me.aydgn.potriv.identity.dto.LoginResponse;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class JwtAuthenticationService {

    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public JwtAuthenticationService(
        UserRepository userRepository,
        UserRoleRepository userRoleRepository,
        PasswordEncoder passwordEncoder,
        JwtService jwtService
    ) {
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Transactional(readOnly = true)
    public LoginResponse login(LoginRequest request) {
        String normalizedEmail = request.email().trim().toLowerCase();

        User user = userRepository.findByEmail(normalizedEmail)
            .orElseThrow(() -> new BadRequestException("Invalid email or password."));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new BadRequestException("Invalid email or password.");
        }

        List<AccessRole> roles = getRoles(user);

        String accessToken = jwtService.createAccessToken(user, roles);

        UUID organizationId = user.getOrganization() == null
            ? null
            : user.getOrganization().getId();

        return new LoginResponse(
            accessToken,
            "Bearer",
            jwtService.getAccessTokenExpiresInSeconds(),
            user.getId(),
            organizationId,
            user.getName(),
            user.getEmail(),
            roles
        );
    }

    @Transactional(readOnly = true)
    public AuthenticatedUser authenticateAccessToken(String token) {
        Claims claims = jwtService.parseAccessToken(token);

        UUID userId = UUID.fromString(claims.getSubject());

        User user = userRepository.findById(userId)
            .orElseThrow(() -> new NotFoundException("Authenticated user was not found."));

        List<AccessRole> roles = getRoles(user);

        UUID organizationId = user.getOrganization() == null
            ? null
            : user.getOrganization().getId();

        return new AuthenticatedUser(
            user.getId(),
            organizationId,
            user.getEmail(),
            roles
        );
    }

    private List<AccessRole> getRoles(User user) {
        return userRoleRepository.findByUserId(user.getId())
            .stream()
            .map(UserRole::getRole)
            .toList();
    }
}