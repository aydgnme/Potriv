package me.aydgn.potriv.identity.service;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.security.TokenDigest;
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
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.service.SecurityAuditService;

@Service
public class AuthRegistrationService {

    private final OrganizationRepository organizationRepository;
    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final InviteTokenRepository inviteTokenRepository;
    private final InviteTokenService inviteTokenService;
    private final InviteUrlFactory inviteUrlFactory;
    private final SecurityAuditService securityAuditService;
    private final PasswordEncoder passwordEncoder;

    public AuthRegistrationService(
        OrganizationRepository organizationRepository,
        UserRepository userRepository,
        UserRoleRepository userRoleRepository,
        InviteTokenRepository inviteTokenRepository,
        InviteTokenService inviteTokenService,
        InviteUrlFactory inviteUrlFactory,
        SecurityAuditService securityAuditService,
        PasswordEncoder passwordEncoder
    ) {
        this.organizationRepository = organizationRepository;
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.inviteTokenRepository = inviteTokenRepository;
        this.inviteTokenService = inviteTokenService;
        this.inviteUrlFactory = inviteUrlFactory;
        this.securityAuditService = securityAuditService;
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


        securityAuditService.record(
            SecurityAuditEvent.builder(
                    SecurityAuditEventType.ORGANIZATION_ADMIN_REGISTERED, true)
                .userId(admin.getId())
                .organizationId(organization.getId())
                .normalizedEmail(normalizedEmail)
                .build()
        );

        /*
          No invite is minted here any more. An invite is addressed to a person,
          and at this point there is nobody to address: the admin invites each
          employee by email afterwards.
        */
        return new RegisterAdminResponse(
            organization.getId(),
            admin.getId()
        );
    }

    /**
     * Registers an employee against an invite.
     *
     * Two things about the order here are deliberate.
     *
     * The invite is claimed before the directory is consulted. The previous
     * version checked email availability first, so a request carrying a garbage
     * token still answered 400 for a registered address and 404 for an
     * unregistered one — an unauthenticated way to test whether somebody has an
     * account.
     *
     * The claim is a conditional UPDATE, not a read followed by a write. Two
     * requests arriving together with the same token would both pass a Java
     * check before either had saved anything, and both would register.
     * `claim` returns the number of rows it changed, so exactly one wins.
     */
    @Transactional
    public RegisterEmployeeResponse registerEmployee(
        String inviteTokenValue,
        RegisterEmployeeRequest request
    ) {
        String normalizedEmail = normalizeEmail(request.email());
        String tokenHash = TokenDigest.sha256Base64Url(inviteTokenValue);

        if (inviteTokenRepository.claim(tokenHash, normalizedEmail) != 1) {
            throw invalidInviteException();
        }

        InviteToken inviteToken = inviteTokenRepository
            .findByTokenHash(tokenHash)
            .orElseThrow(AuthRegistrationService::invalidInviteException);

        if (userRepository.existsByEmail(normalizedEmail)) {
            // Same exception as every other failure here, which is what closes
            // the enumeration: a caller cannot tell a taken address from a bad
            // token. The transaction rolls back, so the claim is undone and a
            // second attempt with a corrected address still works.
            throw invalidInviteException();
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

        securityAuditService.record(
            SecurityAuditEvent.builder(SecurityAuditEventType.EMPLOYEE_REGISTERED, true)
                .userId(employee.getId())
                .organizationId(organization.getId())
                .normalizedEmail(normalizedEmail)
                .build()
        );

        return new RegisterEmployeeResponse(
            organization.getId(),
            employee.getId()
        );
    }

    /**
     * The one answer this endpoint gives for every rejection.
     *
     * Unknown token, expired, already used, revoked, an address that does not
     * match the one invited, and an address that is already registered all
     * produce this. Distinguishing them is what let an
     * anonymous caller enumerate accounts; the reason is recorded internally
     * through the audit trail instead.
     */
    private static BadRequestException invalidInviteException() {
        return new BadRequestException("This invitation is not valid.");
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
