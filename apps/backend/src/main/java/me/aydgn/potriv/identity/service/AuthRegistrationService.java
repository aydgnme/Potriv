package me.aydgn.potriv.identity.service;

import java.security.SecureRandom;
import java.util.Base64;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.exception.NotFoundException;
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
public class AuthRegistrationService {

    private final OrganizationRepository organizationRepository;
    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final InviteTokenRepository inviteTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom secureRandom = new SecureRandom();

    @Value("${app.frontend-url}")
    private String frontendUrl;

    public AuthRegistrationService(
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
        String normalizedEmail = normalizeEmail(request.email());
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
            passwordEncoder.encode(request.password())
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
        String normalizedEmail = normalizeEmail(request.email());
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
            passwordEncoder.encode(request.password())
        );
        userRepository.save(employee);

        userRoleRepository.save(new UserRole(employee, AccessRole.EMPLOYEE));

        return new RegisterEmployeeResponse(
            organization.getId(),
            employee.getId()
        );
    }

    private InviteToken createInviteToken(Organization organization) {
        return new InviteToken(organization, generateToken(), null);
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

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase();
    }
}
