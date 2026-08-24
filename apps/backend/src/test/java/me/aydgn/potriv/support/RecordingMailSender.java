package me.aydgn.potriv.support;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import org.springframework.mail.MailException;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;

/**
 * Test double that records outgoing mail in memory instead of transmitting it,
 * so integration tests never require a running SMTP server such as Mailpit.
 */
public class RecordingMailSender extends JavaMailSenderImpl {

    private final List<SimpleMailMessage> sentMessages = new CopyOnWriteArrayList<>();

    /**
     * Opt-in failure mode. Off by default so every existing test is unaffected;
     * a test that needs to prove "a broken SMTP server changes nothing the
     * caller can observe" turns it on and must turn it off again.
     */
    private volatile boolean failing;

    /**
     * One-shot, per-recipient failures.
     *
     * Exists for tests that need to poison exactly one job in a batch and leave
     * the rest healthy — {@code setFailing} is global and cannot target a
     * single recipient. The supplier decides the exception type, so a test can
     * assert isolation against a {@code MailException}, a
     * {@code DataAccessException}, a {@code QueryTimeoutException} or a bare
     * {@code RuntimeException} without needing four different failure knobs.
     * Consumed on first use: a retry to the same address succeeds unless the
     * test arms it again.
     */
    private final Map<String, Supplier<RuntimeException>> failureByRecipient =
        new ConcurrentHashMap<>();

    /**
     * One-shot, per-recipient blocking send.
     *
     * Exists for the test that measures whether the worker's SMTP call holds a
     * database transaction or row lock open: the send here does not return
     * until the test says so, which gives the test a window to prove — from a
     * second connection — that the same row is still reachable while the
     * "SMTP call" is in flight.
     */
    private final Map<String, Block> blockByRecipient = new ConcurrentHashMap<>();

    private record Block(CountDownLatch started, CountDownLatch release) {
    }

    @Override
    public void send(SimpleMailMessage simpleMessage) throws MailException {
        failIfRequested();
        blockIfRequested(recipientOf(simpleMessage));
        failRecipientIfRequested(recipientOf(simpleMessage));
        sentMessages.add(simpleMessage);
    }

    @Override
    public void send(SimpleMailMessage... simpleMessages) throws MailException {
        for (SimpleMailMessage message : simpleMessages) {
            send(message);
        }
    }

    /** Makes subsequent sends throw the way an unreachable SMTP server does. */
    public void setFailing(boolean failing) {
        this.failing = failing;
    }

    /**
     * Arms a one-shot failure for the next send to this address, whatever
     * exception the supplier produces.
     */
    public void failFor(String recipientEmail, Supplier<RuntimeException> exceptionSupplier) {
        failureByRecipient.put(recipientEmail, exceptionSupplier);
    }

    /**
     * Arms a one-shot block for the next send to this address. The send
     * counts down {@code started} the moment it begins blocking, then waits on
     * {@code release} before returning — giving the caller a window in which
     * the "mail server" is unreachable but has not yet failed or succeeded.
     */
    public void blockFor(String recipientEmail, CountDownLatch started, CountDownLatch release) {
        blockByRecipient.put(recipientEmail, new Block(started, release));
    }

    private void failIfRequested() {
        if (failing) {
            throw new MailSendException("Simulated SMTP failure");
        }
    }

    private void failRecipientIfRequested(String recipient) {
        if (recipient == null) {
            return;
        }
        Supplier<RuntimeException> supplier = failureByRecipient.remove(recipient);
        if (supplier != null) {
            throw supplier.get();
        }
    }

    private void blockIfRequested(String recipient) {
        if (recipient == null) {
            return;
        }
        Block block = blockByRecipient.remove(recipient);
        if (block == null) {
            return;
        }
        block.started().countDown();
        try {
            if (!block.release().await(30, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Test never released a blocked send.");
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while blocked", interrupted);
        }
    }

    private static String recipientOf(SimpleMailMessage message) {
        String[] to = message.getTo();
        return to != null && to.length > 0 ? to[0] : null;
    }

    public List<SimpleMailMessage> getSentMessages() {
        return sentMessages;
    }

    public void clear() {
        sentMessages.clear();
        failing = false;
        failureByRecipient.clear();
        blockByRecipient.clear();
    }
}
