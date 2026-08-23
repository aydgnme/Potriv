package me.aydgn.potriv.identity.service;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.mail.MailException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import me.aydgn.potriv.identity.entity.InviteToken;
import me.aydgn.potriv.identity.repository.InviteTokenRepository;

/**
 * Delivers queued invitations.
 *
 * The problem this exists for: the invite endpoint used to create the
 * invitation, mint a token and send the mail inside one request. The send was
 * wrapped in a `catch (MailException)` that logged a warning, so an unreachable
 * mail server produced a `201`, an administrator told "invitation sent", and a
 * recipient who never received anything — with a live token sitting in the
 * database that only the mail nobody got could have carried. The SMTP call also
 * happened while the request held a pessimistic lock on the organization row,
 * so a slow mail server blocked every other invitation for that organization
 * for the length of its timeout.
 *
 * Now the request records the intention and returns. This worker does the rest,
 * in its own transaction, where failing is allowed to mean something:
 *
 * <ul>
 *   <li>a token is minted <em>per attempt</em>, so a retry never re-sends a
 *       value that may already have reached a bounce message or a relay log;</li>
 *   <li>only its hash is written, so a failed attempt leaves nothing
 *       redeemable — the hash is cleared again on failure;</li>
 *   <li>attempts back off exponentially and stop at a limit, after which the
 *       invitation is FAILED and visibly so, rather than pending forever.</li>
 * </ul>
 *
 * Claiming is a conditional UPDATE that pushes the row's next attempt forward,
 * so several workers can run against one database and a worker that dies
 * mid-attempt leaves a job that becomes due again on its own.
 */
@Service
public class InviteDeliveryWorker {

    private static final Logger log = LoggerFactory.getLogger(InviteDeliveryWorker.class);

    /** Attempts before an invitation is declared undeliverable. */
    static final int MAX_ATTEMPTS = 5;

    /** First retry delay; doubles each attempt. */
    static final Duration BASE_BACKOFF = Duration.ofMinutes(1);

    /**
     * How long a claim holds a job before it becomes due again.
     *
     * Longer than any plausible SMTP timeout, so a slow send is not retried
     * underneath itself; short enough that a crashed worker's jobs resume
     * without operator involvement.
     */
    static final Duration LEASE = Duration.ofMinutes(5);

    /** Jobs per pass. Bounded so one backlog cannot monopolise the scheduler. */
    private static final int BATCH = 25;

    private final InviteTokenRepository inviteTokenRepository;
    private final InviteTokenService inviteTokenService;
    private final EmployeeInviteMailService inviteMailService;
    private final InviteUrlFactory inviteUrlFactory;

    /**
     * An explicit template rather than {@code @Transactional} on the method
     * below.
     *
     * {@code @Transactional} is applied by a proxy, and this class calls its own
     * attempt method — a self-invocation never passes through the proxy, so the
     * annotation would have been silently inert and every attempt would have
     * shared one transaction. One recipient's failure would then have rolled
     * back another's success. The template is doing the same job in a way that
     * cannot be bypassed by accident.
     */
    private final TransactionTemplate perAttempt;

    public InviteDeliveryWorker(
        InviteTokenRepository inviteTokenRepository,
        InviteTokenService inviteTokenService,
        EmployeeInviteMailService inviteMailService,
        InviteUrlFactory inviteUrlFactory,
        PlatformTransactionManager transactionManager
    ) {
        this.inviteTokenRepository = inviteTokenRepository;
        this.inviteTokenService = inviteTokenService;
        this.inviteMailService = inviteMailService;
        this.inviteUrlFactory = inviteUrlFactory;
        this.perAttempt = new TransactionTemplate(transactionManager);
        this.perAttempt.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @Scheduled(fixedDelayString = "${app.invite-delivery.interval-ms:15000}")
    public void deliverDue() {
        runOnce();
    }

    /**
     * One pass over the due jobs. Returns how many were delivered.
     *
     * Exposed so tests can drive delivery deterministically instead of waiting
     * for a scheduler — the alternative is sleeping in tests, which makes them
     * slow when they pass and flaky when they fail.
     */
    public int runOnce() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        List<InviteToken> due = inviteTokenRepository
            .findDueDeliveries(now, PageRequest.of(0, BATCH));

        int delivered = 0;
        for (InviteToken candidate : due) {
            if (attemptDelivery(candidate.getId())) {
                delivered++;
            }
        }
        return delivered;
    }

    /**
     * One attempt, in its own transaction, so one recipient's failure cannot
     * roll back another's success in the same pass.
     */
    private boolean attemptDelivery(UUID inviteId) {
        return Boolean.TRUE.equals(perAttempt.execute(status -> deliverOne(inviteId)));
    }

    private boolean deliverOne(UUID inviteId) {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

        // Whoever wins this UPDATE owns the attempt. Everybody else stops here.
        if (inviteTokenRepository.claimDelivery(inviteId, now, now.plus(LEASE)) != 1) {
            return false;
        }

        InviteToken invite = inviteTokenRepository.findById(inviteId).orElse(null);
        if (invite == null || !invite.isActive() || invite.isConsumed()) {
            // Withdrawn or redeemed between the claim and the read. Nothing to do.
            return false;
        }

        InviteTokenService.IssuedInvite issued = inviteTokenService.mintFor(invite);

        try {
            inviteMailService.sendInviteMail(
                invite.getInvitedEmail(),
                invite.getOrganization().getName(),
                inviteUrlFactory.build(issued.rawToken()));

            invite.markSent();
            inviteTokenRepository.save(invite);
            return true;

        } catch (MailException exception) {
            /*
              The token minted above is discarded rather than kept for the
              retry: it may already have reached a relay's log or a bounce
              message on the way to failing, and a value that has been anywhere
              is not a value to keep alive.
            */
            if (invite.getAttemptCount() >= MAX_ATTEMPTS) {
                invite.markDeliveryFailed(reasonOf(exception));
                log.warn("Invite delivery failed permanently after {} attempts. Invite ID: {}.",
                    invite.getAttemptCount(), invite.getId());
            } else {
                invite.markAttemptFailed(reasonOf(exception), now.plus(backoffFor(invite)));
                log.warn("Invite delivery attempt {} failed; retrying. Invite ID: {}.",
                    invite.getAttemptCount(), invite.getId());
            }
            inviteTokenRepository.save(invite);
            return false;
        }
    }

    /** 1, 2, 4, 8… minutes. Bounded by {@link #MAX_ATTEMPTS}. */
    private static Duration backoffFor(InviteToken invite) {
        return BASE_BACKOFF.multipliedBy(1L << (invite.getAttemptCount() - 1));
    }

    /**
     * The failure, for an operator, with nothing sensitive in it.
     *
     * The exception's message is deliberately not used: mail libraries put the
     * message they were sending — recipients and, on some transports, the body —
     * into it, and the body is the one place the link legitimately appears.
     */
    private static String reasonOf(MailException exception) {
        return exception.getClass().getSimpleName();
    }
}
