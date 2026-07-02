package me.aydgn.potriv.identity.service;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.identity.dto.AuthUserResponse;
import me.aydgn.potriv.identity.dto.RegisterAdminRequest;
import me.aydgn.potriv.identity.dto.RegisterAdminResponse;
import me.aydgn.potriv.identity.dto.RegisterEmployeeRequest;
import me.aydgn.potriv.identity.dto.RegisterEmployeeResponse;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.InviteToken;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.InviteTokenRepository;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.identity.repository.UserRoleRepository;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.OrganizationRepository;


@Service
public class AuthService {

    private final OrganizationRepository organizationRepository;
    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final InviteTokenRepository inviteTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom secureRandom = new SecureRandom();

    @Value("${app.frontend-url}")
    private String frontendUrl;

    public AuthService(
        OrganizationRepository organizationRepository,
        UserRepository userRepository,
        UserRoleRepository userRoleRepository,
        InviteTokenRepository inviteTokenRepository,
        PasswordEncoder passwordEncoder
    ) {
        this.organizationRepository = organizationRepository;
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.inviteTokenRepository = inviteTokenRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public RegisterAdminResponse registerOrganizationAdmin(RegisterAdminRequest request) {
        String normalizedEmail = normailzeEmail(request.email());

        ensureEmailIsAvailable(normalizedEmail);

        Organization organization = new Organization(
            request.organizationName().trim(),
            request.headquarterAddress().trim()
        );

        organizationRepository.save(organization);

        User admin = new User(
            organization,
            request.name().trim(),
            normalizedEmail,
            passwordEncoder.encode(request.password().trim())
        );
        userRepository.save(admin);

        userRoleRepository.save(new UserRole(admin, AccessRole.EMPLOYEE));
        userRoleRepository.save(new UserRole(admin, AccessRole.ORGANIZATION_ADMIN));

        InviteToken inviteToken = createInviteToken(organization);
        inviteTokenRepository.save(inviteToken);

        return new RegisterAdminResponse(
            organization.getId(),
            admin.getId(),
            buildEmployeeInviteUrl(inviteToken.getToken())
        );
    }


    @Transactional
    public RegisterEmployeeResponse registerEmployee(String inviteTokenValue, RegisterEmployeeRequest request) {
        String normalizedEmail = normailzeEmail(request.email());


        ensureEmailIsAvailable(normalizedEmail);

        InviteToken inviteToken = inviteTokenRepository.findByToken(inviteTokenValue)
            .orElseThrow(() -> new NotFoundException("Employee invite token was not found."));

        if (!inviteToken.isUsable()) {
            throw new BadRequestException("Employee invite token is not active or has expired.");
        }

        Organization organization = inviteToken.getOrganization();

        User employee = new User(
            organization,
            request.name().trim(),
            normalizedEmail,
            passwordEncoder.encode(request.password().trim())
        );

        userRepository.save(employee);
        userRoleRepository.save(new UserRole(employee, AccessRole.EMPLOYEE));

        return new RegisterEmployeeResponse(
            organization.getId(),
            employee.getId()
        );
    }

    @Transactional(readOnly = true)
    public AuthUserResponse getUser(UUID userId) {
        User user = userRepository.findById(userId)
        .orElseThrow(() -> new NotFoundException("User was not found."));

        List<AccessRole> roles = userRoleRepository.findByUserId(userId)
            .stream()
            .map(UserRole::getRole)
            .toList();

        UUID organizationId = user.getOrganization() == null ? null : user.getOrganization().getId();

        return new AuthUserResponse(user.getId(), organizationId, user.getName(), user.getEmail(), roles);
    }

    private InviteToken createInviteToken(Organization organization) {
        return new InviteToken(
            organization,
            generateToken(),
            null
        );
    }

    private String generateToken() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String buildEmployeeInviteUrl(String token) {
        return frontendUrl + "/invite?token=" + token;
    }

    private void ensureEmailIsAvailable(String email) {
        if (userRepository.existsByEmail(email)) {
            throw new BadRequestException("Email address is already used.");
        }
    }

    private String normailzeEmail(String email) {
        return email.trim().toLowerCase();
    }
}
