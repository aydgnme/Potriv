package me.aydgn.potriv.identity.service;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import me.aydgn.potriv.identity.entity.RegistrationVerification;
import me.aydgn.potriv.identity.repository.RegistrationVerificationRepository;
import me.aydgn.potriv.identity.repository.UserRepository;

/**
 * Delivers queued registration-verification mail.
 *
 * Shaped like {@link InviteDeliveryWorker} — see that class's javadoc for the
 * full reasoning behind claim/mint-and-commit/send/record as four
 * independent transactions with the SMTP call held outside all of them. The
 * one addition: before minting anything, this worker re-checks whether the
 * address has since been registered — by this same request racing another,
 * or by any other means — and if so, suppresses the row instead of sending.
 * That check happens here, at send time, rather than being decided once at
 * request time and carried in a stored flag, because send time is the
 * freshest this application can ever know the answer.
 */
@Service
public class RegistrationVerificationDeliveryWorker {

    private static final Logger log =
        LoggerFactory.getLogger(RegistrationVerificationDeliveryWorker.class);

    /** Attempts before a verification is declared undeliverable. */
    static final int MAX_ATTEMPTS = 5;

    /** First retry delay; doubles each attempt. */
    static final Duration BASE_BACKOFF = Duration.ofMinutes(1);

    /** See {@code InviteDeliveryWorker#LEASE}. */
    static final Duration LEASE = Duration.ofMinutes(5);

    /** Jobs per pass. Bounded so one backlog cannot monopolise the scheduler. */
    private static final int BATCH = 25;

    private final RegistrationVerificationRepository registrationVerificationRepository;
    private final RegistrationVerificationTokenService registrationVerificationTokenService;
    private final RegistrationVerificationMailService registrationVerificationMailService;
    private final RegistrationVerificationUrlFactory registrationVerificationUrlFactory;
    private final UserRepository userRepository;

    /** See {@code InviteDeliveryWorker#perAttempt} for why this is explicit. */
    private final TransactionTemplate perAttempt;

    public RegistrationVerificationDeliveryWorker(
        RegistrationVerificationRepository registrationVerificationRepository,
        RegistrationVerificationTokenService registrationVerificationTokenService,
        RegistrationVerificationMailService registrationVerificationMailService,
        RegistrationVerificationUrlFactory registrationVerificationUrlFactory,
        UserRepository userRepository,
        PlatformTransactionManager transactionManager
    ) {
        this.registrationVerificationRepository = registrationVerificationRepository;
        this.registrationVerificationTokenService = registrationVerificationTokenService;
        this.registrationVerificationMailService = registrationVerificationMailService;
        this.registrationVerificationUrlFactory = registrationVerificationUrlFactory;
        this.userRepository = userRepository;
        this.perAttempt = new TransactionTemplate(transactionManager);
        this.perAttempt.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @Scheduled(fixedDelayString = "${app.registration-verification-delivery.interval-ms:15000}")
    public void deliverDue() {
        runOnce();
    }

    /**
     * One pass over the due jobs. Returns how many were delivered (mailed or
     * suppressed — both are a resolved outcome for this pass; see
     * {@link #deliverOne}).
     */
    public int runOnce() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        List<RegistrationVerification> due = registrationVerificationRepository
            .findDueDeliveries(now, PageRequest.of(0, BATCH));

        int resolved = 0;
        for (RegistrationVerification candidate : due) {
            UUID verificationId = candidate.getId();
            try {
                if (deliverOne(verificationId)) {
                    resolved++;
                }
            } catch (RuntimeException exception) {
                log.warn(
                    "A registration verification delivery attempt escaped its own "
                        + "isolation. Verification ID: {}.",
                    verificationId, exception);
            }
        }
        return resolved;
    }

    /**
     * One attempt at resolving one registration verification, as a sequence
     * of independent transactions with the SMTP call — when there is one —
     * held outside all of them.
     *
     * Returns {@code true} for either terminal outcome this attempt itself
     * achieved: mail sent and recorded, or suppressed because the address
     * was already registered. Every other outcome — lost the race to claim,
     * lost the lease before the hash could be committed, the send failed,
     * lost the lease before the outcome could be recorded — returns
     * {@code false}.
     */
    private boolean deliverOne(UUID verificationId) {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        UUID attemptId = UUID.randomUUID();

        Integer claimed = perAttempt.execute(status -> registrationVerificationRepository
            .claimDelivery(verificationId, now, now.plus(LEASE), attemptId));
        if (!Integer.valueOf(1).equals(claimed)) {
            return false;
        }

        Attempt attempt = perAttempt.execute(status -> {
            RegistrationVerification verification =
                registrationVerificationRepository.findById(verificationId).orElse(null);
            if (verification == null) {
                return null;
            }
            return new Attempt(
                verification.getEmail(),
                verification.getAdminName(),
                verification.getAttemptCount());
        });
        if (attempt == null) {
            return false;
        }

        // The freshest this application can ever know whether the address is
        // already taken — see the class javadoc. Suppressing here, rather
        // than deciding once at request time, is what lets two concurrent
        // registration attempts for the same address each be told nothing
        // more than the other, while still mailing at most one real link.
        if (userRepository.existsByEmail(attempt.email())) {
            Integer suppressed = perAttempt.execute(status -> registrationVerificationRepository
                .suppress(verificationId, attemptId));
            return Integer.valueOf(1).equals(suppressed);
        }

        try {
            RegistrationVerificationTokenService.IssuedVerification issued =
                registrationVerificationTokenService.mintFor();

            Integer hashCommitted = perAttempt.execute(status -> registrationVerificationRepository
                .commitAttemptToken(verificationId, attemptId, issued.tokenHash(), issued.expiresAt()));
            if (!Integer.valueOf(1).equals(hashCommitted)) {
                log.warn(
                    "A registration verification delivery attempt lost its lease "
                        + "before the token could be committed. Verification ID: {}.",
                    verificationId);
                return false;
            }

            registrationVerificationMailService.sendVerificationMail(
                attempt.email(),
                attempt.adminName(),
                registrationVerificationUrlFactory.build(issued.rawToken()));

            Integer sent = perAttempt.execute(status ->
                registrationVerificationRepository.markDelivered(verificationId, attemptId));
            if (!Integer.valueOf(1).equals(sent)) {
                log.warn(
                    "Registration verification mail was sent but the lease had "
                        + "already been lost by the time delivery could be recorded. "
                        + "Verification ID: {}.",
                    verificationId);
                return false;
            }
            return true;

        } catch (RuntimeException exception) {
            recoverFailedAttempt(verificationId, attemptId, attempt.attemptCountAfterClaim(), exception);
            return false;
        }
    }

    /** What one attempt needs, read once and detached. */
    private record Attempt(String email, String adminName, int attemptCountAfterClaim) {
    }

    /** See {@code InviteDeliveryWorker#recoverFailedAttempt}. */
    private void recoverFailedAttempt(
        UUID verificationId, UUID attemptId, int attemptCountAfterClaim, RuntimeException exception
    ) {
        String reason = reasonOf(exception);
        boolean exhausted = attemptCountAfterClaim >= MAX_ATTEMPTS;
        RegistrationVerification.DeliveryStatus nextStatus = exhausted
            ? RegistrationVerification.DeliveryStatus.FAILED
            : RegistrationVerification.DeliveryStatus.QUEUED;
        OffsetDateTime nextAttemptAt = exhausted
            ? null
            : OffsetDateTime.now(ZoneOffset.UTC).plus(backoffFor(attemptCountAfterClaim));

        try {
            Integer recovered = perAttempt.execute(status -> registrationVerificationRepository
                .recoverFailedAttempt(verificationId, attemptId, nextStatus, nextAttemptAt, reason));

            if (!Integer.valueOf(1).equals(recovered)) {
                log.warn(
                    "Could not record a registration verification delivery failure; "
                        + "the lease may already have been reclaimed. Verification ID: {}.",
                    verificationId);
            } else if (exhausted) {
                log.warn(
                    "Registration verification delivery failed permanently after {} "
                        + "attempts. Verification ID: {}.",
                    attemptCountAfterClaim, verificationId);
            } else {
                log.warn(
                    "Registration verification delivery attempt {} failed; retrying. "
                        + "Verification ID: {}.",
                    attemptCountAfterClaim, verificationId);
            }
        } catch (RuntimeException recoveryFailure) {
            log.warn(
                "Recording a registration verification delivery failure itself "
                    + "failed; leaving the job for its lease to expire. "
                    + "Verification ID: {}.",
                verificationId, recoveryFailure);
        }
    }

    /** 1, 2, 4, 8… minutes. Bounded by {@link #MAX_ATTEMPTS}. */
    private static Duration backoffFor(int attemptCount) {
        return BASE_BACKOFF.multipliedBy(1L << (attemptCount - 1));
    }

    /** See {@code InviteDeliveryWorker#reasonOf}: class name only, nothing sensitive. */
    private static String reasonOf(RuntimeException exception) {
        return exception.getClass().getSimpleName();
    }
}
