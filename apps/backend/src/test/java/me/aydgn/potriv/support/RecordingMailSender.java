package me.aydgn.potriv.support;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

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

    @Override
    public void send(SimpleMailMessage simpleMessage) throws MailException {
        failIfRequested();
        sentMessages.add(simpleMessage);
    }

    @Override
    public void send(SimpleMailMessage... simpleMessages) throws MailException {
        failIfRequested();
        for (SimpleMailMessage message : simpleMessages) {
            sentMessages.add(message);
        }
    }

    /** Makes subsequent sends throw the way an unreachable SMTP server does. */
    public void setFailing(boolean failing) {
        this.failing = failing;
    }

    private void failIfRequested() {
        if (failing) {
            throw new MailSendException("Simulated SMTP failure");
        }
    }

    public List<SimpleMailMessage> getSentMessages() {
        return sentMessages;
    }

    public void clear() {
        sentMessages.clear();
        failing = false;
    }
}
