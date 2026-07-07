package me.aydgn.potriv.support;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;

/**
 * Test double that records outgoing mail in memory instead of transmitting it,
 * so integration tests never require a running SMTP server such as Mailpit.
 */
public class RecordingMailSender extends JavaMailSenderImpl {

    private final List<SimpleMailMessage> sentMessages = new CopyOnWriteArrayList<>();

    @Override
    public void send(SimpleMailMessage simpleMessage) throws MailException {
        sentMessages.add(simpleMessage);
    }

    @Override
    public void send(SimpleMailMessage... simpleMessages) throws MailException {
        for (SimpleMailMessage message : simpleMessages) {
            sentMessages.add(message);
        }
    }

    public List<SimpleMailMessage> getSentMessages() {
        return sentMessages;
    }

    public void clear() {
        sentMessages.clear();
    }
}
