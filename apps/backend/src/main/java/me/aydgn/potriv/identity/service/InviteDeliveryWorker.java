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
 * A worker replaced that, and the first version of the worker had its own
 * failure mode: claiming, minting and sending all still happened inside one
 * transaction. A `RuntimeException` from anywhere in that — not only a mail
 * failure — rolled the whole thing back, the claim included, so the job that
 * had just thrown stayed exactly where it was: oldest, due, and first in line
 * for the next pass. One bad row could sit at the head of the queue
 * indefinitely and nothing behind it would ever be attempted. And because the
 * redemption check never looked at delivery state, a hash committed a moment
 * before the send that then failed was — for that moment — a live, redeemable
 * credential for mail nobody had received.
 *
 * Both problems come from the same cause: too much happening inside one
 * transaction. This version has four, none of which can roll back another:
 *
 * <ol>
 *   <li>{@code claimDelivery} — an atomic conditional UPDATE that moves the row
 *       to {@code DELIVERING} under a fresh lease owner, so at most one worker
 *       is ever attempting a given job;</li>
 *   <li>{@code commitAttemptToken} — commits the hash of a freshly minted token
 *       while the row is still {@code DELIVERING}, and therefore still not
 *       redeemable: {@link InviteToken#isRedeemable()} and the acceptance
 *       query both require {@code SENT};</li>
 *   <li>the SMTP call itself, with no transaction open and no row lock held —
 *       the whole reason the previous, request-inline version blocked other
 *       invitations behind a slow mail server, and the reason this worker
 *       cannot have that problem either;</li>
 *   <li>{@code markDelivered} or {@code recoverFailedAttempt} — exactly one of
 *       which runs afterwards, depending on whether the send succeeded, each
 *       guarded by the lease owner from the first step so a worker that has
 *       lost its lease cannot write an outcome for an attempt somebody else
 *       now owns.</li>
 * </ol>
 *
 * A failure anywhere in steps 2–4 is caught here, per job, and turned into a
 * recovery write rather than being allowed to propagate: one recipient's
 * failure — mail, database, or otherwise — must never stop the jobs behind it
 * in the same pass. What is not caught is anything that is not a
 * {@link RuntimeException}: a JVM {@link Error} — an {@code OutOfMemoryError},
 * a {@code StackOverflowError} — is a signal that the process itself is no
 * longer trustworthy, and treating it as "this one job failed, try the next"
 * would be exactly the wrong response.
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
     * An explicit template rather than {@code @Transactional} on the methods
     * below.
     *
     * {@code @Transactional} is applied by a proxy, and this class calls its own
     * methods — a self-invocation never passes through the proxy, so the
     * annotation would have been silently inert and every step of every attempt
     * would have shared one ambient transaction, exactly the failure mode this
     * class exists to avoid. The template does the same job in a way that
     * cannot be bypassed by accident, and makes every transaction boundary in
     * {@link #deliverOne} visible at the call site instead of implicit.
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
     *
     * The per-job try/catch here is deliberately redundant with the one inside
     * {@link #deliverOne}: that method is the primary guarantee that one job's
     * failure cannot affect another, but a loop that depends on every callee
     * upholding a contract perfectly is one bug away from the exact failure
     * mode this class exists to prevent. Belt, and suspenders.
     */
    public int runOnce() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        List<InviteToken> due = inviteTokenRepository
            .findDueDeliveries(now, PageRequest.of(0, BATCH));

        int delivered = 0;
        for (InviteToken candidate : due) {
            UUID inviteId = candidate.getId();
            try {
                if (deliverOne(inviteId)) {
                    delivered++;
                }
            } catch (RuntimeException exception) {
                // Reachable only if deliverOne's own isolation failed to catch
                // something. Logged, not rethrown: the batch continues either
                // way, which is the property this whole class exists for.
                log.warn(
                    "An invite delivery attempt escaped its own isolation. Invite ID: {}.",
                    inviteId, exception);
            }
        }
        return delivered;
    }

    /**
     * One attempt at delivering one invitation, as a sequence of independent
     * transactions with the SMTP call held outside all of them.
     *
     * Returns {@code true} only when the mail was sent and that fact was
     * durably recorded under this attempt's own lease. Every other outcome —
     * lost the race to claim, lost the lease before the hash could be
     * committed, the send failed, lost the lease before the send could be
     * recorded — returns {@code false}, and the job either becomes reclaimable
     * again or is already being handled by whoever holds it now.
     */
    private boolean deliverOne(UUID inviteId) {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        UUID attemptId = UUID.randomUUID();

        // Step 1 — claim, in its own committed transaction. Whoever wins this
        // conditional UPDATE owns the attempt; everybody else stops here.
        Integer claimed = perAttempt.execute(status ->
            inviteTokenRepository.claimDelivery(inviteId, now, now.plus(LEASE), attemptId));
        if (!Integer.valueOf(1).equals(claimed)) {
            return false;
        }

        // A snapshot of what the mail needs, read and detached in its own
        // transaction. Nothing from here is an open Hibernate session by the
        // time the SMTP call happens — `organization.getName()` is resolved
        // now, inside the transaction, precisely so it is not resolved later,
        // outside one, where a lazy association would throw.
        Attempt attempt = perAttempt.execute(status -> {
            InviteToken invite = inviteTokenRepository.findById(inviteId).orElse(null);
            if (invite == null) {
                return null;
            }
            return new Attempt(
                invite.getInvitedEmail(),
                invite.getOrganization().getName(),
                invite.isActive(),
                invite.getAttemptCount());
        });
        if (attempt == null) {
            // Claimed a row that is now gone. Not reachable in practice —
            // nothing in this codebase deletes an InviteToken — but the lease
            // simply expires and the job becomes reclaimable if it ever is.
            return false;
        }

        if (!attempt.active()) {
            // Revoked between being queued and being claimed. Release the
            // lease and park the job rather than mailing a link an
            // administrator has already withdrawn; nothing will retry it.
            releaseWithoutRetry(inviteId, attemptId);
            return false;
        }

        try {
            InviteTokenService.IssuedInvite issued = inviteTokenService.mintFor();

            // Step 2 — commit the hash, in its own committed transaction,
            // still before the mail is sent. The row stays DELIVERING, so
            // this value is not yet redeemable by anyone.
            Integer hashCommitted = perAttempt.execute(status ->
                inviteTokenRepository.commitAttemptToken(
                    inviteId, attemptId, issued.tokenHash(), issued.expiresAt()));
            if (!Integer.valueOf(1).equals(hashCommitted)) {
                // Lost the lease before the hash could be committed. Whoever
                // holds the job now is responsible for it; sending mail under
                // a token that will never be recorded as SENT would only
                // confuse the recipient with a link that can never work.
                log.warn(
                    "An invite delivery attempt lost its lease before the token "
                        + "could be committed. Invite ID: {}.",
                    inviteId);
                return false;
            }

            // Step 3 — the SMTP call. No transaction, no row lock: this is the
            // entire reason invitations are no longer sent inside the request
            // that creates them.
            inviteMailService.sendInviteMail(
                attempt.invitedEmail(),
                attempt.organizationName(),
                inviteUrlFactory.build(issued.rawToken()));

            // Step 4 — record success, in its own committed transaction,
            // guarded by the same lease owner as every other step.
            Integer sent = perAttempt.execute(status ->
                inviteTokenRepository.markDelivered(inviteId, attemptId));
            if (!Integer.valueOf(1).equals(sent)) {
                // The mail went out, but this attempt's lease was already
                // gone by the time it tried to say so — a slow send that
                // outlived the lease, most likely, with a reclaiming attempt
                // having sent its own mail in the meantime. Not countable as
                // this pass's delivery; whatever the reclaiming attempt
                // records is the one the recipient can actually use.
                log.warn(
                    "Invite mail was sent but the lease had already been lost "
                        + "by the time delivery could be recorded. Invite ID: {}.",
                    inviteId);
                return false;
            }
            return true;

        } catch (RuntimeException exception) {
            // Everything from minting through recording success funnels here
            // on failure: a mail exception, a database exception from either
            // guarded write, or any other unexpected RuntimeException. All of
            // them are this job's problem alone.
            recoverFailedAttempt(inviteId, attemptId, attempt.attemptCountAfterClaim(), exception);
            return false;
        }
    }

    /** What one attempt needs from the invitation, read once and detached. */
    private record Attempt(
        String invitedEmail,
        String organizationName,
        boolean active,
        int attemptCountAfterClaim
    ) {
    }

    /**
     * Releases a claimed lease without scheduling a retry, for a job that
     * turned out not to need one — currently, only a revoked invitation.
     *
     * Not a failure: no error is recorded, and the attempt already counted by
     * {@code claimDelivery} is not treated as one of {@link #MAX_ATTEMPTS}
     * towards {@code FAILED}. The row simply returns to QUEUED with no next
     * attempt, which — because {@code findDueDeliveries} requires a
     * non-null, past {@code nextAttemptAt} — means nothing will pick it up
     * again.
     */
    private void releaseWithoutRetry(UUID inviteId, UUID attemptId) {
        try {
            perAttempt.execute(status -> inviteTokenRepository.recoverFailedAttempt(
                inviteId, attemptId, InviteToken.DeliveryStatus.QUEUED, null, null));
        } catch (RuntimeException exception) {
            log.warn(
                "Could not release a revoked invitation's delivery lease; it will "
                    + "expire on its own. Invite ID: {}.",
                inviteId, exception);
        }
    }

    /**
     * Turns a failed attempt into the next state: another QUEUED try after a
     * backoff, or FAILED once {@link #MAX_ATTEMPTS} is reached.
     *
     * Never lets its own failure escape. If the recovery write itself throws,
     * or finds the lease already gone, the job is left exactly where it is —
     * DELIVERING, under a lease that will expire on its own and make the job
     * reclaimable again. That is a worse outcome than a clean recovery, but a
     * strictly better one than corrupting a job another attempt already owns,
     * or letting this failure propagate and stop the rest of the batch.
     */
    private void recoverFailedAttempt(
        UUID inviteId, UUID attemptId, int attemptCountAfterClaim, RuntimeException exception
    ) {
        String reason = reasonOf(exception);
        boolean exhausted = attemptCountAfterClaim >= MAX_ATTEMPTS;
        InviteToken.DeliveryStatus nextStatus =
            exhausted ? InviteToken.DeliveryStatus.FAILED : InviteToken.DeliveryStatus.QUEUED;
        OffsetDateTime nextAttemptAt = exhausted
            ? null
            : OffsetDateTime.now(ZoneOffset.UTC).plus(backoffFor(attemptCountAfterClaim));

        try {
            Integer recovered = perAttempt.execute(status ->
                inviteTokenRepository.recoverFailedAttempt(
                    inviteId, attemptId, nextStatus, nextAttemptAt, reason));

            if (!Integer.valueOf(1).equals(recovered)) {
                log.warn(
                    "Could not record an invite delivery failure; the lease may "
                        + "already have been reclaimed. Invite ID: {}.",
                    inviteId);
            } else if (exhausted) {
                log.warn(
                    "Invite delivery failed permanently after {} attempts. Invite ID: {}.",
                    attemptCountAfterClaim, inviteId);
            } else {
                log.warn(
                    "Invite delivery attempt {} failed; retrying. Invite ID: {}.",
                    attemptCountAfterClaim, inviteId);
            }
        } catch (RuntimeException recoveryFailure) {
            log.warn(
                "Recording an invite delivery failure itself failed; leaving the "
                    + "job for its lease to expire. Invite ID: {}.",
                inviteId, recoveryFailure);
        }
    }

    /** 1, 2, 4, 8… minutes. Bounded by {@link #MAX_ATTEMPTS}. */
    private static Duration backoffFor(int attemptCount) {
        return BASE_BACKOFF.multipliedBy(1L << (attemptCount - 1));
    }

    /**
     * The failure, for an operator, with nothing sensitive in it.
     *
     * The exception's message is deliberately not used: mail libraries put the
     * message they were sending — recipients and, on some transports, the body —
     * into it, and the body is the one place the link legitimately appears.
     * That risk is not unique to {@code MailException}: a data-access exception
     * can just as easily wrap a statement's parameters into its message, so
     * every failure recorded here — mail, database, or otherwise — is reduced
     * to its class name and nothing more.
     */
    private static String reasonOf(RuntimeException exception) {
        return exception.getClass().getSimpleName();
    }
}
