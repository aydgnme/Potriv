package me.aydgn.potriv.identity.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/**
 * Sends the invite link to the address it was issued to.
 *
 * Shaped like {@link PasswordResetMailService}: sender and subject are fixed,
 * the recipient comes from the invite, and nothing user-supplied reaches a
 * header — so there is no CRLF injection surface. The link is in the body and
 * never in a log statement.
 */
@Service
public class EmployeeInviteMailService {

    private static final Logger log = LoggerFactory.getLogger(EmployeeInviteMailService.class);

    private final JavaMailSender mailSender;
    private final String fromAddress;

    public EmployeeInviteMailService(
        JavaMailSender mailSender,
        @Value("${app.mail.from}") String fromAddress
    ) {
        this.mailSender = mailSender;
        this.fromAddress = fromAddress;
    }

    public void sendInviteMail(String toEmail, String organizationName, String inviteUrl) {
        SimpleMailMessage message = new SimpleMailMessage();

        message.setFrom(fromAddress);
        message.setTo(toEmail);
        message.setSubject("You have been invited to Potriv");
        message.setText(
            "Hello,\n\n"
                + "You have been invited to join " + organizationName + " on Potriv.\n\n"
                + "Open the link below to create your account:\n"
                + inviteUrl + "\n\n"
                + "The link works once, only for this address, and expires.\n\n"
                + "If you were not expecting this, you can ignore this email.\n\n"
                + "The Potriv Team"
        );

        try {
            mailSender.send(message);
        } catch (MailException exception) {
            // The invite is already issued and the caller gets the link back;
            // a mail outage must not fail the request or change its shape. The
            // link is deliberately absent from this statement.
            log.warn("Failed to send employee invite email.", exception);
        }
    }
}
