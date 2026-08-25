package me.aydgn.potriv.identity.service;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.common.exception.ErrorCodes;
import me.aydgn.potriv.identity.support.EmailAddresses;
import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.ratelimit.RateLimitService;
import me.aydgn.potriv.common.security.TokenDigest;
import me.aydgn.potriv.identity.dto.RegisterAdminConfirmRequest;
import me.aydgn.potriv.identity.dto.RegisterAdminRequest;
import me.aydgn.potriv.identity.dto.RegisterAdminResponse;
import me.aydgn.potriv.identity.dto.RegisterEmployeeRequest;
import me.aydgn.potriv.identity.dto.RegisterEmployeeResponse;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.InviteToken;
import me.aydgn.potriv.identity.entity.RegistrationVerification;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import me.aydgn.potriv.identity.repository.InviteTokenRepository;
import me.aydgn.potriv.identity.repository.RegistrationVerificationRepository;
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
    private final RegistrationVerificationRepository registrationVerificationRepository;
    private final RegistrationVerificationTokenService registrationVerificationTokenService;
    private final SecurityAuditService securityAuditService;
    private final PasswordEncoder passwordEncoder;
    private final RateLimitService rateLimitService;

    public AuthRegistrationService(
        OrganizationRepository organizationRepository,
        UserRepository userRepository,
        UserRoleRepository userRoleRepository,
        InviteTokenRepository inviteTokenRepository,
        InviteTokenService inviteTokenService,
        InviteUrlFactory inviteUrlFactory,
        RegistrationVerificationRepository registrationVerificationRepository,
        RegistrationVerificationTokenService registrationVerificationTokenService,
        SecurityAuditService securityAuditService,
        PasswordEncoder passwordEncoder,
        RateLimitService rateLimitService
    ) {
        this.organizationRepository = organizationRepository;
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.inviteTokenRepository = inviteTokenRepository;
        this.inviteTokenService = inviteTokenService;
        this.inviteUrlFactory = inviteUrlFactory;
        this.registrationVerificationRepository = registrationVerificationRepository;
        this.registrationVerificationTokenService = registrationVerificationTokenService;
        this.securityAuditService = securityAuditService;
        this.passwordEncoder = passwordEncoder;
        this.rateLimitService = rateLimitService;
    }

    /**
     * Requests a new workspace. Always returns having done exactly the same
     * work, whether or not {@code request.email()} already has an account:
     * normalise, check the rate limit, hash the password, insert one row.
     *
     * Nothing here branches on email availability — there is no
     * {@code existsByEmail} call in this method at all, deliberately. The
     * previous version answered 400 for a taken address and 201 for a new
     * one, which is an unauthenticated way to learn whether somebody has an
     * account. Password hashing is the dominant cost of this method by a wide
     * margin, and it runs unconditionally here, so there is nothing left for
     * a timing difference to hang on either.
     *
     * Nothing is created yet. This inserts one {@link RegistrationVerification}
     * row — an intention, not an account — and returns; a delivery worker
     * mints and mails a confirmation link separately, and only
     * {@link #confirmRegistration} ever creates the organization and the
     * admin account. See {@link RegistrationVerification}'s own javadoc for
     * why, including how a since-registered address is handled without this
     * method ever finding out.
     */
    @Transactional
    public void registerOrganizationAdmin(RegisterAdminRequest request, String clientIp) {
        String normalizedEmail = normalizeEmail(request.email());
        rateLimitService.checkRegisterAdmin(clientIp, normalizedEmail);

        String passwordHash = passwordEncoder.encode(request.password());

        registrationVerificationRepository.save(new RegistrationVerification(
            normalizedEmail,
            request.name().trim(),
            request.organizationName().trim(),
            request.headquarterAddress().trim(),
            passwordHash,
            registrationVerificationTokenService.provisionalExpiry()
        ));

        securityAuditService.record(
            SecurityAuditEvent.builder(
                    SecurityAuditEventType.ORGANIZATION_ADMIN_REGISTRATION_REQUESTED, true)
                .normalizedEmail(normalizedEmail)
                .build()
        );
    }

    /**
     * Confirms a workspace registration and — only now — creates the
     * organization and the admin account, atomically.
     *
     * The claim ({@link RegistrationVerificationRepository#claim}) is a
     * conditional UPDATE, not a read followed by a write, for the same
     * reason {@link #registerEmployee}'s is: two confirmations racing the
     * same token must not both pass a Java check before either has written
     * anything.
     *
     * The {@code existsByEmail} check here is not the one this class removed
     * from {@link #registerOrganizationAdmin}: this is reached only by
     * someone who has already proven ownership of the token, so there is no
     * enumeration surface left to protect — an invalid-token response here
     * means either a bad token or a race lost to a concurrent confirmation,
     * and a caller who already holds a valid token has no use for
     * distinguishing those. The {@code saveAndFlush}/catch below is the same
     * race closed a second, structural way: if two different tokens for the
     * same address are confirmed together, the {@code users.email} unique
     * constraint — not just this check — guarantees only one insert can
     * succeed, and the loser is turned into the same clean, generic error
     * instead of an uncaught exception.
     */
    @Transactional
    public RegisterAdminResponse confirmRegistration(RegisterAdminConfirmRequest request) {
        String tokenHash = TokenDigest.sha256Base64Url(request.token());

        if (registrationVerificationRepository.claim(tokenHash) != 1) {
            throw invalidRegistrationException();
        }

        RegistrationVerification pending = registrationVerificationRepository
            .findByTokenHash(tokenHash)
            .orElseThrow(AuthRegistrationService::invalidRegistrationException);

        if (userRepository.existsByEmail(pending.getEmail())) {
            // Same exception as every other failure here. The transaction
            // rolls back, so the claim above is undone.
            throw invalidRegistrationException();
        }

        Organization organization = new Organization(
            pending.getOrganizationName(),
            pending.getHeadquarterAddress()
        );
        organizationRepository.save(organization);

        User admin = new User(
            organization,
            pending.getAdminName(),
            pending.getEmail(),
            pending.getPasswordHash()
        );
        try {
            userRepository.saveAndFlush(admin);
        } catch (DataIntegrityViolationException exception) {
            throw invalidRegistrationException();
        }

        userRoleRepository.save(new UserRole(admin, AccessRole.EMPLOYEE));
        userRoleRepository.save(new UserRole(admin, AccessRole.ORGANIZATION_ADMIN));

        securityAuditService.record(
            SecurityAuditEvent.builder(
                    SecurityAuditEventType.ORGANIZATION_ADMIN_REGISTERED, true)
                .userId(admin.getId())
                .organizationId(organization.getId())
                .normalizedEmail(pending.getEmail())
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
    public RegisterEmployeeResponse registerEmployee(RegisterEmployeeRequest request) {
        String normalizedEmail = normalizeEmail(request.email());
        // Hashed immediately. The raw value is never assigned to a field, never
        // logged, and never put back into a response.
        String tokenHash = TokenDigest.sha256Base64Url(request.token());

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
        return new BadRequestException("This invitation is not valid.", ErrorCodes.INVITE_INVALID);
    }

    /**
     * The one answer {@code /auth/register-admin/verify} gives for every
     * rejection. Unknown token, expired, already used, and an address
     * registered by the time confirmation arrived all produce this — see
     * {@link #confirmRegistration}.
     */
    private static BadRequestException invalidRegistrationException() {
        return new BadRequestException(
            "This registration link is not valid.", ErrorCodes.REGISTER_TOKEN_INVALID);
    }

    /**
     * Delegates, and must keep delegating. This used to lower-case with the
     * JVM's default locale while the invite path used {@code Locale.ROOT}, so
     * the two disagreed about any address containing an {@code I} on a
     * Turkish-locale JVM — and an invitation that cannot be matched cannot be
     * redeemed.
     */
    private String normalizeEmail(String email) {
        return EmailAddresses.normalize(email);
    }
}
